"""Paper search for Community Signals.

A signal's criteria are a friendlier version of a scoped feed: plain keywords,
an optional raw PubMed clause, and a few toggles. Finding candidates never
generates content.
"""

from __future__ import annotations

import re
from typing import Any

from .paperFinder import find_candidates

MAX_KEYWORDS = 12


def keywords_to_query(keywords: str) -> str:
    # "pancreatic cancer, KRAS" -> ("pancreatic cancer"[tiab] OR "KRAS"[tiab])
    terms = []
    for raw in re.split(r"[,\n;]+", keywords or ""):
        term = re.sub(r'["\[\]()]', "", raw).strip()
        if term and term.lower() not in {t.lower() for t in terms}:
            terms.append(term)
    terms = terms[:MAX_KEYWORDS]
    if not terms:
        return ""
    return " OR ".join(f'"{term}"[tiab]' for term in terms)


def build_topic_query(keywords: str = "", topic_query: str = "") -> str:
    parts = [part for part in (keywords_to_query(keywords), (topic_query or "").strip()) if part]
    if len(parts) == 1:
        return parts[0]
    return " AND ".join(f"({part})" for part in parts)


def find_signal_candidates(
    criteria: dict[str, Any] | None = None,
    exclude_pmids: list[str] | None = None,
    window: str = "",
    limit: int = 10,
) -> dict[str, Any]:
    criteria = criteria or {}
    topic = build_topic_query(criteria.get("keywords") or "", criteria.get("topic_query") or "")
    require_nci = bool(criteria.get("require_nci", True))
    if not topic and not require_nci:
        raise ValueError("Add keywords or a PubMed query, or turn the NCI grant filter back on")
    return find_candidates(
        window=window or criteria.get("window") or "7d",
        limit=limit,
        topic_query=topic,
        require_nci=require_nci,
        journals_only=bool(criteria.get("journals_only")),
        require_outputs=bool(criteria.get("require_outputs")),
        exclude_pmids=list(exclude_pmids or []),
        trending_only=False,
    )
