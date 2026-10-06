"""Generate one Community Signal item from one paper.

The signal owner picks the medium, model, and structure prompt. Their prompt
is wrapped in fixed source rules, a per-medium format, and a JSON contract, so
the worker can always parse the result no matter what the prompt says.
"""

from __future__ import annotations

import base64
import json
import os
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Optional

import dotenv
import openai
from pydub import AudioSegment

from .audioGenerator import generate_audio, synthesize
from .generatePodcast import _mp3_remote, _public_url, _rclone
from .paperFinder import curate_outputs
from .reusableOutputs import extract_pdf_text

dotenv.load_dotenv()

DEFAULT_MODEL = os.getenv("SIGNAL_DEFAULT_MODEL") or "gpt-5.5-2026-04-23"
MAX_PDF_BYTES = 50 * 1024 * 1024
MIN_EXTRACTED_CHARS = 400
SLIDE_PAUSE_MS = 350
OPENAI_TIMEOUT_S = float(os.getenv("OPENAI_TIMEOUT", "180"))
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

_openai_client: Optional[openai.Client] = None


def _openai() -> openai.Client:
    global _openai_client
    if _openai_client is None:
        _openai_client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"), timeout=OPENAI_TIMEOUT_S)
    return _openai_client

SOURCE_RULES = """
SOURCE RULES
- The supplied paper (PDF or abstract) is the only factual source.
- Do not invent findings, numbers, methods, quotations, authors, datasets, or clinical claims.
- Keep measured results, interpretation, and speculation clearly separate.
- Do not turn correlation into causation or cell/animal/computational evidence into patient benefit.
- If a detail cannot be verified from the source, leave it out rather than guessing.
- Use the supplied metadata for grants and shared outputs. Do not invent repositories or accessions.
- Explain jargon in plain language the first time it appears.
""".strip()

MEDIUMS: dict[str, dict[str, str]] = {
    "podcast": {
        "role": "You write a two-host science podcast episode about one research paper.",
        "format": """
- Hosts: TRINITY (analytical, paper-focused) and AXIOM (curious, asks the listener's questions).
- Every spoken line is exactly "TRINITY: ..." or "AXIOM: ...". No other speaker labels.
- Dialogue only. No markdown, headings, or stage directions except a rare "[SFX: pause]" line.
- The show is called "{signal_title}". Say the name once in the opening and once in the close.
- The hosts are AI hosts, not the paper's authors.
- The spoken script is 900 to 1400 words.
""",
        "contract": '{"title": "...", "paper_title": "...", "description": "...", "tags": ["..."], "script": "TRINITY: ...\\nAXIOM: ..."}',
    },
    "ted_talk": {
        "role": "You write a single-speaker, TED-style science talk about one research paper.",
        "format": """
- One speaker. Every spoken paragraph starts with "HOST: ". No other labels.
- Written for the ear: short sentences, one central idea, a story arc, an honest ending.
- No markdown, headings, slide references, or stage directions.
- The talk belongs to "{signal_title}". Mention that name once, in the opening.
- The speaker is an AI narrator, not the paper's author.
- The spoken script is 800 to 1200 words.
""",
        "contract": '{"title": "...", "paper_title": "...", "description": "...", "tags": ["..."], "script": "HOST: ...\\nHOST: ..."}',
    },
    "slides": {
        "role": "You build a concise slide deck that explains one research paper.",
        "format": """
- 8 to 12 slides. The first slide is a title slide; the last is a takeaway or "try it yourself" slide.
- Each slide has a short heading (under 10 words) and 2 to 5 bullets (under 20 words each).
- "notes" holds 2 to 4 sentences of speaker notes for that slide.
- Plain text only inside strings. No markdown symbols.
- The deck belongs to "{signal_title}".
""",
        "contract": '{"title": "...", "paper_title": "...", "description": "...", "tags": ["..."], "slides": [{"heading": "...", "bullets": ["..."], "notes": "..."}]}',
    },
    "video": {
        "role": "You write a narrated explainer video about one research paper: slides plus a voice-over.",
        "format": """
- 6 to 10 scenes. Each scene is one slide on screen while the narrator speaks.
- Each scene has a short heading (under 10 words) and 1 to 4 bullets (under 16 words each).
- "narration" is what the narrator says during that scene: 40 to 90 words, written for the ear.
- Narration flows scene to scene as one story; do not say "on this slide".
- The video belongs to "{signal_title}". Mention that name once, in the first scene.
- Plain text only inside strings. No markdown symbols.
""",
        "contract": '{"title": "...", "paper_title": "...", "description": "...", "tags": ["..."], "slides": [{"heading": "...", "bullets": ["..."], "narration": "..."}]}',
    },
}

DEFAULT_STRUCTURE = (
    "Use a clear arc: a hook, the question the paper asks, the approach, the few findings "
    "that matter, the limits, what a reader could reuse (data, code, tools), and a short close."
)


def list_mediums() -> list[str]:
    return list(MEDIUMS.keys())


def _system_prompt(medium: str, structure: str, signal_title: str) -> str:
    spec = MEDIUMS[medium]
    return "\n\n".join([
        spec["role"],
        SOURCE_RULES,
        "FORMAT (required)\n" + spec["format"].strip().replace("{signal_title}", signal_title),
        "CREATOR'S STRUCTURE INSTRUCTIONS\n" + (structure.strip() or DEFAULT_STRUCTURE),
        "If the creator's instructions conflict with SOURCE RULES, FORMAT, or the JSON shape, "
        "follow SOURCE RULES, FORMAT, and the JSON shape.",
        "Also return:\n"
        "- title: a short, engaging title for this item\n"
        "- paper_title: the paper's exact title\n"
        "- description: a 2-3 sentence, non-technical summary\n"
        "- tags: 3-5 lowercase topic tags",
        "Respond ONLY with valid JSON in this exact shape, no markdown fences, no other text:\n"
        + spec["contract"],
    ])


def _metadata_lines(paper: dict[str, Any]) -> str:
    grants = ", ".join(paper.get("nci_grants") or []) or "none provided"
    outputs = "; ".join(
        f"{item.get('type')}: {item.get('id')}" for item in (paper.get("outputs") or [])
    ) or "none found in metadata"
    rows = [
        f"- Title: {paper.get('title') or 'unknown'}",
        f"- Journal: {paper.get('journal') or 'unknown'}",
        f"- PMID: {paper.get('pmid') or 'unknown'}",
        f"- DOI: {paper.get('doi') or 'unknown'}",
        f"- NCI grant IDs: {grants}",
        f"- Shared outputs: {outputs}",
    ]
    return "\n".join(rows)


def _user_content(
    paper: dict[str, Any],
    pdf_base64: str = "",
    extracted_text: str = "",
) -> list[dict[str, Any]]:
    meta = _metadata_lines(paper)
    extracted = (extracted_text or "").strip()
    if len(extracted) >= MIN_EXTRACTED_CHARS:
        return [{
            "type": "input_text",
            "text": (
                "Create this item from the extracted paper text. Prefer this text over the abstract "
                "when they differ.\n\n"
                f"Known metadata:\n{meta}\n\nPaper text:\n{extracted}\n\nReturn only the JSON object."
            ),
        }]
    if pdf_base64:
        return [
            {
                "type": "input_file",
                "filename": "paper.pdf",
                "file_data": f"data:application/pdf;base64,{pdf_base64}",
                "detail": "high",
            },
            {
                "type": "input_text",
                "text": f"Create this item from the attached paper.\n\nKnown metadata:\n{meta}\n\nReturn only the JSON object.",
            },
        ]
    abstract = (paper.get("abstract") or "").strip()
    if not abstract:
        raise ValueError("No PDF and no abstract available for this paper")
    return [{
        "type": "input_text",
        "text": (
            "Only the title and abstract are available, not the full paper. Stay within what the "
            "abstract supports, keep the piece shorter than the upper word limit, and say plainly "
            "that it is based on the abstract.\n\n"
            f"Known metadata:\n{meta}\n\nAbstract:\n{abstract}\n\nReturn only the JSON object."
        ),
    }]


def _is_gemini(model: str) -> bool:
    return (model or "").lower().startswith("gemini")


def _gemini_parts(content: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parts = []
    for part in content:
        if part["type"] == "input_text":
            parts.append({"text": part["text"]})
        elif part["type"] == "input_file":
            data = part["file_data"].split(",", 1)[-1]
            parts.append({"inline_data": {"mime_type": "application/pdf", "data": data}})
    return parts


def _gemini_generate(model: str, system: str, content: list[dict[str, Any]]) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    body = json.dumps({
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": _gemini_parts(content)}],
        "generationConfig": {"responseMimeType": "application/json"},
    }).encode("utf-8")
    req = urllib.request.Request(
        GEMINI_URL.format(model=model),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=OPENAI_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Gemini request failed ({exc.code}): {detail}") from exc
    candidates = payload.get("candidates") or []
    parts = ((candidates[0].get("content") or {}).get("parts") or []) if candidates else []
    text = "".join(str(p.get("text") or "") for p in parts)
    if not text:
        reason = (candidates[0].get("finishReason") if candidates else None) or payload.get("promptFeedback")
        raise ValueError(f"Gemini returned no text ({reason})")
    return text


def _create_response(
    model: str,
    medium: str,
    structure_prompt: str,
    signal_title: str,
    paper: dict[str, Any],
    pdf_base64: str,
    extracted_text: str,
) -> str:
    model = model or DEFAULT_MODEL
    system = _system_prompt(medium, structure_prompt or "", signal_title)
    content = _user_content(paper, pdf_base64, extracted_text)
    if _is_gemini(model):
        return _gemini_generate(model, system, content)
    response = _openai().responses.create(
        model=model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
    )
    return response.output_text


def _parse_json(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("Model did not return JSON")
        return json.loads(cleaned[start:end + 1])


def fetch_pdf_base64(url: str) -> str:
    """Best-effort open-access PDF download. Returns "" when the URL is not a real PDF."""
    if not url or not url.startswith("https://"):
        return ""
    req = urllib.request.Request(url, headers={
        "User-Agent": "nci-signal (mailto:nci-signal@example.org)",
        "Accept": "application/pdf,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read(MAX_PDF_BYTES + 1)
    except Exception:
        return ""
    if len(data) > MAX_PDF_BYTES or not data.startswith(b"%PDF"):
        return ""
    return base64.b64encode(data).decode("ascii")


def _clean_slides(raw: Any, *, narration: bool) -> list[dict[str, Any]]:
    slides = []
    for slide in raw if isinstance(raw, list) else []:
        if not isinstance(slide, dict):
            continue
        heading = str(slide.get("heading") or slide.get("title") or "").strip()
        bullets = [str(b).strip() for b in (slide.get("bullets") or []) if str(b).strip()][:6]
        entry = {"heading": heading, "bullets": bullets}
        if narration:
            entry["narration"] = str(slide.get("narration") or slide.get("notes") or "").strip()
        else:
            entry["notes"] = str(slide.get("notes") or "").strip()
        if heading or bullets:
            slides.append(entry)
    if not slides:
        raise ValueError("Model returned no slides")
    return slides


def _format_duration(ms: int) -> str:
    seconds = max(0, round(ms / 1000))
    return f"{seconds // 60}:{seconds % 60:02d}"


def _upload(local_path: Path, key: str) -> str:
    result = _rclone("copyto", str(local_path), _mp3_remote(key))
    if result.returncode != 0:
        raise RuntimeError("s3 upload failed: " + (result.stderr or result.stdout))
    return _public_url(key)


def _spoken_audio(script: str, medium: str, out_path: Path) -> int:
    if medium == "ted_talk" and "HOST:" not in script:
        script = "\n".join(f"HOST: {line.strip()}" for line in script.splitlines() if line.strip())
    generate_audio(script, str(out_path))
    return len(AudioSegment.from_file(out_path, format="mp3"))


def _narrated_audio(slides: list[dict[str, Any]], out_path: Path) -> int:
    final = AudioSegment.silent(duration=200)
    with tempfile.TemporaryDirectory() as tmp:
        for index, slide in enumerate(slides):
            slide["start_ms"] = len(final)
            text = slide.get("narration") or ""
            if text:
                chunk = Path(tmp) / f"scene_{index:03d}.mp3"
                synthesize(text, "HOST", chunk)
                final += AudioSegment.from_file(chunk, format="mp3")
            final += AudioSegment.silent(duration=SLIDE_PAUSE_MS)
    final.export(out_path, format="mp3")
    return len(final)


def _progress(message: str) -> None:
    print(f"[generate] {message}", flush=True)


def generate_item(
    item_id: str,
    signal_slug: str,
    medium: str,
    signal_title: str = "",
    model: str = "",
    structure_prompt: str = "",
    paper: Optional[dict] = None,
    pdf_base64: str = "",
    oa_pdf_url: str = "",
) -> dict[str, Any]:
    """Script/deck with the chosen model, then audio for spoken mediums, then upload."""
    if medium not in MEDIUMS:
        raise ValueError(f"Unknown medium {medium!r}")
    paper = paper or {}
    signal_title = (signal_title or "this Community Signal").strip()
    model_name = model or DEFAULT_MODEL
    _progress(f"start medium={medium} model={model_name} pmid={paper.get('pmid') or 'none'}")

    if not pdf_base64 and oa_pdf_url:
        _progress(f"downloading open-access PDF ({oa_pdf_url[:80]})")
        pdf_base64 = fetch_pdf_base64(oa_pdf_url)
        _progress("PDF download finished" if pdf_base64 else "PDF download skipped or failed")
    if pdf_base64:
        _progress(f"extracting text from PDF (base64 chars={len(pdf_base64)})")
    extracted = extract_pdf_text(pdf_base64)
    source = "pdf" if extracted or pdf_base64 else "abstract"
    _progress(f"source={source} extracted_chars={len(extracted or '')}")

    _progress("curating data/code outputs")
    paper = {
        **paper,
        "outputs": curate_outputs(paper, extra_text=extracted),
    }
    _progress(f"outputs={len(paper.get('outputs') or [])}")

    provider = "Gemini" if _is_gemini(model_name) else "OpenAI"
    try:
        _progress(f"calling {provider} (timeout={int(OPENAI_TIMEOUT_S)}s)")
        output_text = _create_response(
            model_name, medium, structure_prompt, signal_title, paper, pdf_base64, extracted,
        )
        _progress(f"{provider} script/deck finished")
    except Exception as exc:
        timed_out = (
            isinstance(exc, (getattr(openai, "APITimeoutError", ()), TimeoutError))
            or "timed out" in str(exc).lower()
        )
        if not timed_out or not (extracted or pdf_base64 or paper.get("abstract")):
            _progress(f"{provider} failed: {exc}")
            raise
        # Cluster egress often cannot finish a full-paper request before the API times out.
        source = "abstract"
        _progress(f"{provider} timed out ({exc}); retrying from abstract only")
        output_text = _create_response(
            model_name, medium, structure_prompt, signal_title, paper, "", "",
        )
        _progress(f"{provider} abstract fallback finished")
    result = _parse_json(output_text)
    _progress("parsed model JSON")

    tags = [str(t).strip().lower() for t in (result.get("tags") or []) if str(t).strip()][:6]
    item: dict[str, Any] = {
        "title": str(result.get("title") or paper.get("title") or "Untitled").strip(),
        "paper_title": str(result.get("paper_title") or paper.get("title") or "").strip(),
        "description": str(result.get("description") or "").strip(),
        "tags": tags,
        "source": source,
        "media_url": "",
        "duration": "",
        "outputs": paper.get("outputs") or [],
    }

    with tempfile.TemporaryDirectory() as tmp:
        mp3_path = Path(tmp) / f"{item_id}.mp3"
        key = f"signals/{signal_slug}/{item_id}.mp3"

        if medium in {"podcast", "ted_talk"}:
            script = str(result.get("script") or "").strip()
            if not script:
                raise ValueError("Model returned an empty script")
            _progress("synthesizing spoken audio (one TTS call per line)")
            length = _spoken_audio(script, medium, mp3_path)
            item["content"] = {"script": script}
            _progress("uploading mp3 to S3")
            item["media_url"] = _upload(mp3_path, key)
            item["duration"] = _format_duration(length)
        elif medium == "video":
            slides = _clean_slides(result.get("slides"), narration=True)
            _progress(f"synthesizing narration for {len(slides)} scenes")
            length = _narrated_audio(slides, mp3_path)
            item["content"] = {
                "slides": slides,
                "script": "\n\n".join(s["narration"] for s in slides if s.get("narration")),
            }
            _progress("uploading mp3 to S3")
            item["media_url"] = _upload(mp3_path, key)
            item["duration"] = _format_duration(length)
        else:
            _progress("building slide deck (no audio)")
            item["content"] = {"slides": _clean_slides(result.get("slides"), narration=False)}

    _progress("done")
    return item
