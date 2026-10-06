import os
import re
import tempfile
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from openai import OpenAI
from pydub import AudioSegment

_client = None


def _openai():
    global _client
    if _client is None:
        _client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=float(os.getenv("OPENAI_TTS_TIMEOUT", "120")),
        )
    return _client

VOICE_MAP = {
    "TRINITY": {
        "voice": "marin",
        "instructions": """
        New York-based radio host.
        Natural American accent.
        Sharp, confident, witty, assertive.
        Data Scientist.
        Fast conversational pacing.
        Occasionally sarcastic.
        Pronounce 'NCI' as 'N-C-I'.
        Speak grant IDs in broken form: 'U24CA264250' as 'U-24 C-A 2-6-4-2-5-0'.
        """
    },

    "AXIOM": {
        "voice": "cedar",
        "instructions": """
        Midwestern American public-radio host.
        Warm American accent.
        Gentle, thoughtful, empathetic.
        Postdoc.
        Fast conversational pacing.
        Wise and reassuring.
        Pronounce 'NCI' as 'N-C-I'.
        Speak grant IDs in broken form: 'U24CA264250' as 'U-24 C-A 2-6-4-2-5-0'.
        """
    }
}

DEFAULT_VOICE = {
    "voice": "coral",
    "instructions": "Natural podcast voice. Conversational and clear.",
}

PAUSE_MS = {
    "short": 80,
    "medium": 150,
    "long": 250,
}

def parse_script(text: str):
    """
    Handles:
      TRINITY 
      TRINITY:
      ### TRINITY
      ### TRINITY:
      TRINITY: Welcome back...
    """
    segments = []
    current_speaker = None
    buffer = []

    known_speakers = {"TRINITY", "AXIOM", "HOST", "AVI", "ANNA", "JOHN", "DANIEL"}

    for raw_line in text.splitlines():
        line = raw_line.strip()

        if not line:
            continue

        # Remove markdown heading markers
        line = re.sub(r"^#+\s*", "", line).strip()

        # Stage directions
        if line.startswith("[") and line.endswith("]"):
            if buffer and current_speaker:
                segments.append((current_speaker, " ".join(buffer)))
                buffer = []
            segments.append(("SFX", line))
            continue

        # Speaker with inline dialogue, e.g. "TRINITY: Welcome back"
        inline_match = re.match(r"^([A-Z][A-Z0-9 '\-]+):\s*(.+)$", line)
        if inline_match:
            speaker = inline_match.group(1).strip()
            dialogue = inline_match.group(2).strip()

            if speaker in known_speakers:
                if buffer and current_speaker:
                    segments.append((current_speaker, " ".join(buffer)))
                current_speaker = speaker
                buffer = [dialogue]
                continue

        # Speaker alone, e.g. "TRINITY" or "TRINITY:"
        speaker_only = line.rstrip(":").strip()
        if speaker_only in known_speakers:
            if buffer and current_speaker:
                segments.append((current_speaker, " ".join(buffer)))
                buffer = []
            current_speaker = speaker_only
            continue

        # Dialogue
        if current_speaker:
            buffer.append(line)

    if buffer and current_speaker:
        segments.append((current_speaker, " ".join(buffer)))

    return segments

def synthesize(text: str, speaker: str, out_path: Path):
    config = VOICE_MAP.get(speaker.upper(), DEFAULT_VOICE)

    response = _openai().audio.speech.create(
        model="gpt-4o-mini-tts",
        voice=config["voice"],
        input=text,
        instructions=config["instructions"],
        response_format="mp3",
    )

    out_path.write_bytes(response.read())

def make_silence_for_sfx(sfx_line: str):
    lower = sfx_line.lower()

    if "music" in lower or "transition" in lower:
        return AudioSegment.silent(duration=PAUSE_MS["long"])

    if "laughter" in lower or "laugh" in lower:
        return AudioSegment.silent(duration=PAUSE_MS["medium"])

    return AudioSegment.silent(duration=PAUSE_MS["short"])


# New function to generate the final podcast audio from the script programmatically
def generate_audio(script_text: str, output_file: str, intro_file: str = None, outro_file: str = None):
    """
    Takes a dialogue script and optional intro/outro mp3 paths.
    Returns the final podcast audio as an mp3.
    """
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("Please set OPENAI_API_KEY first.")

    segments = parse_script(script_text)

    if not segments:
        raise RuntimeError("No podcast segments found. Check speaker labels.")

    final_audio = AudioSegment.silent(duration=200)

    if intro_file:
        intro_audio = AudioSegment.from_file(intro_file).apply_gain(-6)
        final_audio += intro_audio
        final_audio += AudioSegment.silent(duration=400)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        for i, (speaker, content) in enumerate(segments, start=1):
            print(f"{i}/{len(segments)}: {speaker}", flush=True)

            if speaker == "SFX":
                final_audio += make_silence_for_sfx(content)
                continue

            chunk_path = tmpdir / f"chunk_{i:04d}_{speaker}.mp3"
            spoken_text = content

            synthesize(spoken_text, speaker, chunk_path)

            chunk_audio = AudioSegment.from_file(chunk_path, format="mp3")
            final_audio += chunk_audio
            final_audio += AudioSegment.silent(duration=200)

    if outro_file:
        final_audio += AudioSegment.silent(duration=400)
        outro_audio = AudioSegment.from_file(outro_file).apply_gain(-6)
        final_audio += outro_audio

    final_audio.export(output_file, format="mp3")
    print(f"Saved podcast audio to: {output_file}")

    return output_file