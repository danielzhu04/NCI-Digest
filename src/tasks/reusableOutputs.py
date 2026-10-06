"""Find reusable data and code deposits named by a paper.

Search-time scans use title + abstract. Generation also scans the PDF and
PubMed/Europe PMC database links so the item page can list every resource.
"""

from __future__ import annotations

import base64
import io
import json
import re
import urllib.error
import urllib.request
from typing import Any, Iterable

MAX_OUTPUTS = 24
EPMC_DATALINKS = "https://www.ebi.ac.uk/europepmc/webservices/rest/MED/{pmid}/datalinks?format=json"

# Only keep Europe PMC categories that are deposits or supplements, not
# text-mined genes, SNPs, diseases, or Altmetric.
EPMC_KEEP = (
    "geo", "sra", "ena", "arrayexpress", "pride", "proteomexchange", "figshare",
    "dryad", "zenodo", "biostudies", "data citations", "metabolights", "pdb",
    "dbgap", "bioproject", "github", "gitlab",
)

OUTPUT_PATTERNS = [
    (re.compile(r"\b(GSE\d+)\b", re.I), "geo", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={id}"),
    (re.compile(r"\b(GDS\d+)\b", re.I), "geo", "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={id}"),
    (re.compile(r"\b(SR[PRXS]\d+)\b", re.I), "sra", "https://www.ncbi.nlm.nih.gov/sra/?term={id}"),
    (re.compile(r"\b(PRJ[NED][A-Z]\d+)\b", re.I), "bioproject", "https://www.ncbi.nlm.nih.gov/bioproject/{id}"),
    (re.compile(r"\b(phs\d+(?:\.\w+)*)\b", re.I), "dbgap", "https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id={id}"),
    (re.compile(r"\b(E-(?:MTAB|GEOD|MEXP|TABM)-\d+)\b", re.I), "arrayexpress", "https://www.ebi.ac.uk/arrayexpress/experiments/{id}"),
    (re.compile(r"\b(PXD\d+)\b", re.I), "pride", "https://www.ebi.ac.uk/pride/archive/projects/{id}"),
    (re.compile(r"(github\.com/[\w.\-]+/[\w.\-]+)", re.I), "github", "https://{id}"),
    (re.compile(r"(gitlab\.com/[\w.\-]+/[\w.\-]+)", re.I), "gitlab", "https://{id}"),
    (re.compile(r"(huggingface\.co/[\w.\-]+/[\w.\-]+)", re.I), "huggingface", "https://{id}"),
    (re.compile(r"(10\.5281/zenodo\.\d+)", re.I), "zenodo", "https://doi.org/{id}"),
    (re.compile(r"(10\.6084/m9\.figshare\.\S+)", re.I), "figshare", "https://doi.org/{id}"),
    (re.compile(r"(10\.5061/dryad\.\S+)", re.I), "dryad", "https://doi.org/{id}"),
    (re.compile(r"(osf\.io/[a-z0-9]{5,})\b", re.I), "osf", "https://{id}"),
    (re.compile(r"(protocols\.io/(?:view|private)/[\w.\-/]+)", re.I), "protocols", "https://www.{id}"),
    (re.compile(r"(portal\.gdc\.cancer\.gov/(?:projects|cases|files)/[\w-]+)", re.I), "gdc", "https://{id}"),
    (re.compile(r"(imaging\.datacommons\.cancer\.gov/[^\s)\]\"']+)", re.I), "idc", "https://{id}"),
    (re.compile(r"(pdc\.cancer\.gov/[^\s)\]\"']+)", re.I), "pdc", "https://{id}"),
    (re.compile(r"(datacommons\.cancer\.gov/[^\s)\]\"']+)", re.I), "crdc", "https://{id}"),
    (re.compile(r"(bioconductor\.org/packages/[\w./-]+)", re.I), "bioconductor", "https://{id}"),
]

_TYPE_RANK = {
    "github": 0, "gitlab": 1, "zenodo": 2, "geo": 3, "sra": 4, "dbgap": 5,
    "gdc": 6, "idc": 7, "pdc": 8, "pride": 9, "arrayexpress": 10,
    "figshare": 11, "osf": 12, "huggingface": 13, "dryad": 14, "bioproject": 15,
    "crdc": 16, "protocols": 17, "bioconductor": 18, "pdb": 19, "biostudies": 20,
}


def _clean_id(raw: str) -> str:
    return re.sub(r"[.,;:)\]]+$", "", (raw or "").strip())


def _record(kind: str, raw_id: str, url: str) -> dict[str, str] | None:
    ident = _clean_id(raw_id)
    href = (url or "").strip()
    if not ident or not href:
        return None
    if href.startswith("http://"):
        href = "https://" + href[len("http://"):]
    if not href.startswith("https://"):
        return None
    return {"type": kind, "id": ident, "url": href}


def merge_outputs(*groups: Iterable[dict[str, str]] | None) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    found: list[dict[str, str]] = []
    for group in groups:
        for item in group or []:
            if not isinstance(item, dict):
                continue
            record = _record(str(item.get("type") or "").lower(), str(item.get("id") or ""), str(item.get("url") or ""))
            if not record:
                continue
            key = (record["type"], record["id"].lower())
            if key in seen:
                continue
            seen.add(key)
            found.append(record)
    found.sort(key=lambda item: (_TYPE_RANK.get(item["type"], 50), item["id"].lower()))
    return found[:MAX_OUTPUTS]


def find_outputs(text: str) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    blob = text or ""
    for pattern, kind, url_tmpl in OUTPUT_PATTERNS:
        for match in pattern.finditer(blob):
            raw_id = _clean_id(match.group(1))
            found.append({
                "type": kind,
                "id": raw_id,
                "url": url_tmpl.format(id=raw_id),
            })
    return merge_outputs(found)


def extract_pdf_text(pdf_base64: str, max_chars: int = 40000) -> str:
    """Read the first and last pages — data/code availability is usually at the end."""
    if not pdf_base64:
        return ""
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(base64.b64decode(pdf_base64)))
    except Exception:
        return ""
    pages = list(reader.pages)
    if not pages:
        return ""
    chosen = pages[:8]
    if len(pages) > 8:
        chosen = pages[:6] + pages[-6:]
    chunks: list[str] = []
    for page in chosen:
        try:
            chunks.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(chunks)[:max_chars]


def _http_json(url: str, timeout: int = 12) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "nci-signal (mailto:nci-signal@example.org)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def europe_pmc_outputs(pmid: str) -> list[dict[str, str]]:
    if not re.fullmatch(r"\d{1,10}", str(pmid or "")):
        return []
    try:
        payload = _http_json(EPMC_DATALINKS.format(pmid=pmid))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []
    found: list[dict[str, str]] = []
    categories = _as_list(((payload.get("dataLinkList") or {}).get("Category")))
    for category in categories:
        if not isinstance(category, dict):
            continue
        name = str(category.get("Name") or "").lower()
        if not any(token in name for token in EPMC_KEEP):
            continue
        for section in _as_list(category.get("Section")):
            if not isinstance(section, dict):
                continue
            links = _as_list(((section.get("Linklist") or {}).get("Link")))
            for link in links:
                if not isinstance(link, dict):
                    continue
                target = link.get("Target") or {}
                ident = (target.get("Identifier") or {})
                raw_id = str(ident.get("ID") or target.get("Title") or "").strip()
                url = str(ident.get("IDURL") or "").strip()
                scheme = str(ident.get("IDScheme") or category.get("Name") or "data").lower()
                kind = _epmc_kind(scheme, name, raw_id, url)
                raw_id = _short_id(raw_id, url)
                if kind and raw_id and url:
                    found.append({"type": kind, "id": raw_id, "url": url})
    return merge_outputs(found)


def _short_id(raw_id: str, url: str = "") -> str:
    hay = f"{raw_id} {url}"
    match = re.search(r"(S-EPMC\d+|S-BSST\d+)", hay, re.I)
    if match:
        return match.group(1)
    if raw_id.lower().startswith("http"):
        return raw_id.rstrip("/").split("/")[-1].split("?")[0] or raw_id
    return _clean_id(raw_id)


def _epmc_kind(scheme: str, category: str, raw_id: str, url: str) -> str:
    hay = f"{scheme} {category} {raw_id} {url}".lower()
    if "github" in hay:
        return "github"
    if "zenodo" in hay:
        return "zenodo"
    if "figshare" in hay:
        return "figshare"
    if "dryad" in hay:
        return "dryad"
    if "geo" in hay or raw_id.upper().startswith("GSE"):
        return "geo"
    if "sra" in hay or re.match(r"SR[PRXS]", raw_id, re.I):
        return "sra"
    if "pride" in hay or raw_id.upper().startswith("PXD"):
        return "pride"
    if "arrayexpress" in hay or raw_id.upper().startswith("E-"):
        return "arrayexpress"
    if "dbgap" in hay or raw_id.lower().startswith("phs"):
        return "dbgap"
    if "biostudies" in hay:
        return "biostudies"
    if "pdb" in hay:
        return "pdb"
    if "metabolights" in hay:
        return "metabolights"
    if "osf" in hay:
        return "osf"
    return ""


def curate_outputs(paper: dict[str, Any] | None = None, extra_text: str = "") -> list[dict[str, str]]:
    paper = paper or {}
    text = " ".join([
        str(paper.get("title") or ""),
        str(paper.get("abstract") or ""),
        extra_text or "",
    ])
    pmid = str(paper.get("pmid") or "")
    return merge_outputs(
        paper.get("outputs"),
        find_outputs(text),
        europe_pmc_outputs(pmid),
    )
