import json
import os

import dotenv
import openai

from .scriptPrompts import get_prompt, render_paper_prompt

dotenv.load_dotenv()

_client = None


def _openai():
    global _client
    if _client is None:
        _client = openai.Client(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def generate_script(
    pdf_base64: str,
    nci_grants=None,
    journal=None,
    outputs=None,
    prompt_name=None,
) -> dict:
    """
    Turn a paper PDF into a podcast script using the active prompt setup
    in scriptPrompts.py (or prompt_name / NCI_SCRIPT_PROMPT).
    """
    grants = nci_grants or []
    outputs = outputs or []
    grant_line = ", ".join(grants) if grants else "none provided"
    output_line = (
        "; ".join(f"{item.get('type')}: {item.get('id')}" for item in outputs)
        if outputs
        else "none found in metadata"
    )
    journal_line = journal or "unknown"

    setup = get_prompt(prompt_name)
    paper_prompt = render_paper_prompt(
        setup,
        journal=journal_line,
        grants=grant_line,
        outputs=output_line,
    )

    response = _openai().responses.create(
        model="gpt-5.5-2026-04-23",
        input=[
            {"role": "system", "content": setup["system"]},
            {"role": "user", "content": [
                {
                    "type": "input_file",
                    "filename": "paper.pdf",
                    "file_data": f"data:application/pdf;base64,{pdf_base64}",
                    "detail": "high",
                },
                {
                    "type": "input_text",
                    "text": paper_prompt,
                },
            ]},
        ],
    )

    result = json.loads(response.output_text)
    result["_prompt"] = setup["name"]
    return result
