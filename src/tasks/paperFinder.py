"""Find this week's NCI-supported papers for NCI Signal.

Default: last 7 days of NCI-supported papers, filtered to PubMed Trending
and ranked by trending order. Altmetric and older-paper / iCite-RCR search
are parked (USE_ALTMETRIC / SEARCH_OLDER_PAPERS).
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Any

from .reusableOutputs import curate_outputs as _curate_text_outputs
from .reusableOutputs import find_outputs, merge_outputs

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
PUBMED_TRENDING_URL = "https://pubmed.ncbi.nlm.nih.gov/trending/"
ICITE_URL = "https://icite.od.nih.gov/api/pubs"
OPENALEX_URL = "https://api.openalex.org/works"
MANIFEST_URL = (
    "https://s3.k8s.maayanlab.cloud/axiom-podcasts/nci-signal/manifest.json"
)

NCBI_TOOL = os.getenv("NCBI_TOOL", "nci-signal")
NCBI_EMAIL = os.getenv("NCBI_EMAIL", "nci-signal@example.org")
NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
ALTMETRIC_API_KEY = os.getenv("ALTMETRIC_API_KEY", "")
ALTMETRIC_URL = "https://api.altmetric.com/v1"

JOURNAL_WHITELIST = {
    "nature": "Nature",
    "science": "Science",
    "cell": "Cell",
    "cancer cell": "Cancer Cell",
    "nature cancer": "Nature Cancer",
    "nat cancer": "Nature Cancer",
    "nature medicine": "Nature Medicine",
    "nat med": "Nature Medicine",
    "nature genetics": "Nature Genetics",
    "nat genet": "Nature Genetics",
    "cancer discovery": "Cancer Discovery",
    "cancer discov": "Cancer Discovery",
}

JOURNAL_QUERY = (
    '"Nature"[ta] OR "Science"[ta] OR "Cell"[ta] OR "Cancer Cell"[ta] '
    'OR "Nat Cancer"[ta] OR "Nat Med"[ta] OR "Nat Genet"[ta] OR "Cancer Discov"[ta]'
)

GRANT_CORE_RE = re.compile(r"(?:(\d))?([A-Z]\d{2})([A-Z]{2})(\d{6})")
GRANT_CA_RE = re.compile(r"(?:[A-Z]\d{2})?CA\d{6}")

# Accession regexes live in reusableOutputs.find_outputs.

RCR_THRESHOLD = 2.0
RECENT_DAYS = 365
ALTMETRIC_PAUSE_S = 0.2 if ALTMETRIC_API_KEY else 0.35
TRENDING_LIST_SIZE = 1000

SAVED_SEARCH_RE = re.compile(
    r'id="saved-search-term"[^>]*>([^<]+)</textarea>',
    re.I | re.S,
)
DISPLAYED_UIDS_RE = re.compile(
    r'name="log_displayeduids"\s+content="([^"]+)"',
    re.I,
)
ARTICLE_ID_RE = re.compile(r'data-article-id="(\d+)"')

# 5-year iCite RCR lane for older "highly cited" papers.
SEARCH_OLDER_PAPERS = False
# Altmetric Details Page scores. Replaced by PubMed Trending as the attention filter.
USE_ALTMETRIC = False
DEFAULT_WINDOW = "7d"


def _http_get(url: str, timeout: int = 30) -> bytes:
    # Fetch raw bytes from a URL. Shared by PubMed, iCite, OpenAlex, and the S3 manifest.
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"{NCBI_TOOL} (mailto:{NCBI_EMAIL})",
            "Accept": "*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _http_get_json(url: str, timeout: int = 30) -> Any:
    # Same as _http_get, but parse JSON. Used by iCite, OpenAlex, PubMed esearch, and the manifest.
    return json.loads(_http_get(url, timeout=timeout).decode("utf-8"))


def _ncbi_params(extra: dict[str, Any]) -> str:
    # Build an NCBI query string with tool/email/api key. Required on every E-utilities request.
    params = {
        "tool": NCBI_TOOL,
        "email": NCBI_EMAIL,
        **extra,
    }
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY
    return urllib.parse.urlencode(params)


def _ncbi_pause() -> None:
    # Sleep between NCBI calls so we stay under the public rate limit.
    time.sleep(0.12 if NCBI_API_KEY else 0.34)


def parse_window(window: str | None) -> int:
    # Turn "7d" into a day count for PubMed's date filter. Default is one week.
    raw = (window or DEFAULT_WINDOW).strip().lower()
    match = re.fullmatch(r"(\d+)d", raw)
    if match:
        return max(1, min(int(match.group(1)), 3650))
    return 7


def normalize_grant(grant_id: str) -> str | None:
    # Clean a messy grant string to a core ID like U24CA264250. Used on Admin cards and episode metadata.
    cleaned = re.sub(r"[\s\-]", "", (grant_id or "").upper())
    if not cleaned:
        return None
    match = GRANT_CORE_RE.search(cleaned)
    if match:
        return f"{match.group(2)}{match.group(3)}{match.group(4)}"
    if GRANT_CA_RE.search(cleaned):
        return cleaned
    return cleaned


def is_nci_grant(grant: dict[str, str]) -> bool:
    # True if one PubMed grant record is NCI (CA code, NCI agency, or CA in the ID).
    acronym = (grant.get("acronym") or "").upper()
    agency = (grant.get("agency") or "").upper()
    gid = re.sub(r"[\s\-]", "", (grant.get("grant_id") or "").upper())
    if acronym == "CA":
        return True
    if "NCI" in agency:
        return True
    if GRANT_CA_RE.search(gid):
        return True
    return False


def match_journal(title: str, iso: str) -> str | None:
    # Map a journal name onto the flagship whitelist. Used to enlarge the pool, not as a quality gate.
    for value in (title, iso):
        key = re.sub(r"\s+", " ", (value or "").strip().lower())
        if key in JOURNAL_WHITELIST:
            return JOURNAL_WHITELIST[key]
    return None


def parse_pub_date(year: str, month: str, day: str, medline_date: str | None) -> date | None:
    # Parse PubMed's messy date fields. Age decides recent (use journal) vs older (use Relative Citation Ratio).
    if year and year.isdigit():
        month_raw = (month or "1").strip()
        try:
            month_num = datetime.strptime(month_raw[:3], "%b").month
        except ValueError:
            try:
                month_num = int(month_raw)
            except ValueError:
                month_num = 1
        try:
            day_num = int(day) if day else 1
            return date(int(year), month_num, max(1, min(day_num, 28)))
        except ValueError:
            return None
    if medline_date:
        match = re.search(r"(19|20)\d{2}", medline_date)
        if match:
            return date(int(match.group(0)), 1, 1)
    return None


def pubmed_elink_outputs(pmids: list[str]) -> dict[str, list[dict[str, str]]]:
    """Attach GEO / SRA records PubMed already linked, even if the abstract omits the accession."""
    clean = [pmid for pmid in _dedupe_pmids(pmids) if pmid]
    linked: dict[str, list[dict[str, str]]] = {pmid: [] for pmid in clean}
    if not clean:
        return linked
    gds_by_pmid: dict[str, list[str]] = {}
    sra_by_pmid: dict[str, list[str]] = {}
    for start in range(0, len(clean), 40):
        batch = clean[start:start + 40]
        gds_by_pmid.update(_elink_ids(batch, "gds"))
        sra_by_pmid.update(_elink_ids(batch, "sra"))
    gds_meta = _esummary_accessions([uid for uids in gds_by_pmid.values() for uid in uids], "gds")
    sra_meta = _esummary_accessions([uid for uids in sra_by_pmid.values() for uid in uids], "sra")
    for pmid, uids in gds_by_pmid.items():
        for uid in uids:
            acc = gds_meta.get(uid)
            if acc:
                linked[pmid].append({
                    "type": "geo",
                    "id": acc,
                    "url": f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={acc}",
                })
    for pmid, uids in sra_by_pmid.items():
        for uid in uids:
            acc = sra_meta.get(uid)
            if acc:
                linked[pmid].append({
                    "type": "sra",
                    "id": acc,
                    "url": f"https://www.ncbi.nlm.nih.gov/sra/?term={acc}",
                })
    return {pmid: merge_outputs(items) for pmid, items in linked.items()}


def _elink_ids(pmids: list[str], db: str) -> dict[str, list[str]]:
    url = f"{EUTILS}/elink.fcgi?{_ncbi_params({'dbfrom': 'pubmed', 'db': db, 'id': ','.join(pmids), 'retmode': 'json'})}"
    try:
        payload = _http_get_json(url)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {}
    _ncbi_pause()
    found: dict[str, list[str]] = {}
    for linkset in payload.get("linksets") or []:
        source = str((linkset.get("ids") or ["",])[0])
        if not source:
            continue
        uids: list[str] = []
        for db_links in linkset.get("linksetdbs") or []:
            uids.extend(str(uid) for uid in (db_links.get("links") or []) if uid)
        if uids:
            found[source] = _dedupe_pmids(uids)
    return found


def _esummary_accessions(uids: list[str], db: str) -> dict[str, str]:
    ids = _dedupe_pmids([str(uid) for uid in uids if uid])
    accessions: dict[str, str] = {}
    for start in range(0, len(ids), 40):
        batch = ids[start:start + 40]
        url = f"{EUTILS}/esummary.fcgi?{_ncbi_params({'db': db, 'id': ','.join(batch), 'retmode': 'json'})}"
        try:
            payload = _http_get_json(url)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            continue
        _ncbi_pause()
        result = payload.get("result") or {}
        for uid in batch:
            row = result.get(uid) or {}
            acc = str(row.get("accession") or row.get("Accession") or row.get("accn") or row.get("caption") or "").strip()
            if acc:
                accessions[uid] = acc
    return accessions


def curate_outputs(paper: dict[str, Any] | None = None, extra_text: str = "") -> list[dict[str, str]]:
    paper = paper or {}
    pmid = str(paper.get("pmid") or "")
    linked = pubmed_elink_outputs([pmid]).get(pmid, []) if pmid else []
    return merge_outputs(_curate_text_outputs(paper, extra_text=extra_text), linked)


def _dedupe_pmids(ids: list[str]) -> list[str]:
    # Keep first-seen order. Trending rank is the list index.
    ordered: list[str] = []
    seen: set[str] = set()
    for pmid in ids:
        if pmid and pmid not in seen:
            seen.add(pmid)
            ordered.append(pmid)
    return ordered


def fetch_pubmed_trending_pmids() -> list[str]:
    # PubMed Trending has no JSON API. The HTML stores ~1000 PMIDs, hottest first,
    # in the saved-search-term box. This is NLM-wide activity, not NCI-specific.
    try:
        html = _http_get(PUBMED_TRENDING_URL, timeout=45).decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError):
        return []

    ids: list[str] = []
    match = SAVED_SEARCH_RE.search(html)
    if match:
        ids = [part.strip() for part in re.split(r"[,\s]+", match.group(1)) if part.strip().isdigit()]
    if not ids:
        match = DISPLAYED_UIDS_RE.search(html)
        if match:
            ids = [part.strip() for part in match.group(1).split(",") if part.strip().isdigit()]
    if not ids:
        ids = ARTICLE_ID_RE.findall(html)
    return _dedupe_pmids(ids)[:TRENDING_LIST_SIZE]


def pubmed_search(term: str, retmax: int = 100) -> list[str]:
    # PubMed ESearch: return PMIDs for a query. First discovery step for both lanes.
    url = f"{EUTILS}/esearch.fcgi?{_ncbi_params({'db': 'pubmed', 'term': term, 'retmax': retmax, 'retmode': 'json', 'sort': 'pub+date'})}"
    payload = _http_get_json(url)
    _ncbi_pause()
    return payload.get("esearchresult", {}).get("idlist", []) or []


def pubmed_efetch(pmids: list[str]) -> list[dict[str, Any]]:
    # PubMed EFetch: turn PMID batches into article metadata (title, grants, abstract, DOI).
    articles: list[dict[str, Any]] = []
    for i in range(0, len(pmids), 50):
        batch = pmids[i:i + 50]
        url = f"{EUTILS}/efetch.fcgi?{_ncbi_params({'db': 'pubmed', 'id': ','.join(batch), 'rettype': 'xml', 'retmode': 'xml'})}"
        xml_bytes = _http_get(url, timeout=60)
        _ncbi_pause()
        articles.extend(_parse_pubmed_xml(xml_bytes))
    return articles


def _text(node: ET.Element | None) -> str:
    # Safe XML node → string. Used while walking PubMed EFetch XML.
    if node is None:
        return ""
    return "".join(node.itertext()).strip()


def _parse_pubmed_xml(xml_bytes: bytes) -> list[dict[str, Any]]:
    # Convert PubMed XML into paper dicts the scorer and Admin payload can use.
    root = ET.fromstring(xml_bytes)
    papers: list[dict[str, Any]] = []
    for article in root.findall(".//PubmedArticle"):
        pmid = _text(article.find("./MedlineCitation/PMID"))
        art = article.find("./MedlineCitation/Article")
        if art is None or not pmid:
            continue

        journal_title = _text(art.find("./Journal/Title"))
        journal_iso = _text(art.find("./Journal/ISOAbbreviation"))
        pubdate = art.find("./Journal/JournalIssue/PubDate")
        year = _text(pubdate.find("Year")) if pubdate is not None else ""
        month = _text(pubdate.find("Month")) if pubdate is not None else ""
        day = _text(pubdate.find("Day")) if pubdate is not None else ""
        medline = _text(pubdate.find("MedlineDate")) if pubdate is not None else ""
        published = parse_pub_date(year, month, day, medline)

        doi = ""
        for eloc in art.findall("./ELocationID"):
            if (eloc.get("EIdType") or "").lower() == "doi":
                doi = _text(eloc)
                break
        if not doi:
            for aid in article.findall("./PubmedData/ArticleIdList/ArticleId"):
                if (aid.get("IdType") or "").lower() == "doi":
                    doi = _text(aid)
                    break

        pmcid = ""
        for aid in article.findall("./PubmedData/ArticleIdList/ArticleId"):
            if (aid.get("IdType") or "").lower() == "pmc":
                pmcid = _text(aid)
                break

        grants = []
        for grant in art.findall("./GrantList/Grant"):
            grants.append({
                "grant_id": _text(grant.find("GrantID")),
                "acronym": _text(grant.find("Acronym")),
                "agency": _text(grant.find("Agency")),
            })

        abstract_parts = [_text(node) for node in art.findall("./Abstract/AbstractText")]
        abstract = " ".join(part for part in abstract_parts if part)

        papers.append({
            "pmid": pmid,
            "title": _text(art.find("ArticleTitle")),
            "abstract": abstract,
            "journal_title": journal_title,
            "journal_iso": journal_iso,
            "journal": match_journal(journal_title, journal_iso) or journal_iso or journal_title,
            "pub_date": published.isoformat() if published else None,
            "age_days": (date.today() - published).days if published else None,
            "doi": doi,
            "pmcid": pmcid,
            "grants": grants,
        })
    return papers


def icite_enrich(pmids: list[str]) -> dict[str, dict[str, Any]]:
    # Batch-fetch NIH iCite RCR/citations. Lane B keeps older papers with RCR >= 2.
    out: dict[str, dict[str, Any]] = {}
    if not pmids:
        return out
    for i in range(0, len(pmids), 200):
        batch = pmids[i:i + 200]
        query = urllib.parse.urlencode({
            "pmids": ",".join(batch),
            "fl": "pmid,relative_citation_ratio,nih_percentile,citation_count,year",
        })
        try:
            payload = _http_get_json(f"{ICITE_URL}?{query}", timeout=45)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            continue
        for row in payload.get("data", []) or []:
            pmid = str(row.get("pmid") or "")
            if pmid:
                out[pmid] = row
    return out


def openalex_enrich(papers: list[dict[str, Any]]) -> None:
    # Add OpenAlex citation counts and OA PDF URLs so Admin can try auto-attaching a PDF.
    dois = [p["doi"] for p in papers if p.get("doi")]
    by_doi: dict[str, dict[str, Any]] = {}
    for i in range(0, len(dois), 25):
        batch = dois[i:i + 25]
        query = urllib.parse.urlencode({
            "filter": f"doi:{'|'.join(batch)}",
            "per-page": 25,
            "select": "doi,cited_by_count,open_access,primary_location,best_oa_location",
            "mailto": NCBI_EMAIL,
        })
        try:
            payload = _http_get_json(f"{OPENALEX_URL}?{query}", timeout=30)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            continue
        for work in payload.get("results", []) or []:
            doi = (work.get("doi") or "").replace("https://doi.org/", "").lower()
            if doi:
                by_doi[doi] = work

    for paper in papers:
        work = by_doi.get((paper.get("doi") or "").lower())
        if not work:
            continue
        paper["citation_count"] = work.get("cited_by_count")
        oa = work.get("best_oa_location") or {}
        open_access = work.get("open_access") or {}
        paper["oa_pdf_url"] = oa.get("pdf_url") or open_access.get("oa_url")
        paper["image_url"] = paper.get("image_url") or ""


def _altmetric_get(path: str) -> dict[str, Any] | None:
    # One Altmetric Details Page lookup. 404 = no mentions; 403 = key required/denied.
    url = f"{ALTMETRIC_URL}/{path}"
    if ALTMETRIC_API_KEY:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode({"key": ALTMETRIC_API_KEY})
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"{NCBI_TOOL} (mailto:{NCBI_EMAIL})",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        if err.code in {403, 404, 429}:
            return {"_status": err.code}
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def altmetric_enrich(papers: list[dict[str, Any]]) -> str:
    # Parked: USE_ALTMETRIC is False. PubMed Trending is the attention filter now.
    # Pull Altmetric Attention Scores for cutting-edge ranking. Returns the source actually used.
    got_any = False
    blocked = False
    for paper in papers:
        payload = None
        doi = paper.get("doi") or ""
        if doi:
            payload = _altmetric_get("doi/" + urllib.parse.quote(doi, safe=""))
            time.sleep(ALTMETRIC_PAUSE_S)
        if (not payload or payload.get("_status") == 404) and paper.get("pmid"):
            payload = _altmetric_get("pmid/" + paper["pmid"])
            time.sleep(ALTMETRIC_PAUSE_S)
        status = (payload or {}).get("_status")
        if status == 403:
            blocked = True
            paper["attention_score"] = 0.0
            paper["altmetric"] = None
            continue
        if not payload or status:
            paper["attention_score"] = 0.0
            paper["altmetric"] = None
            continue
        score = payload.get("score")
        paper["attention_score"] = float(score) if isinstance(score, (int, float)) else 0.0
        paper["altmetric"] = {
            "score": paper["attention_score"],
            "news": payload.get("cited_by_msm_count") or 0,
            "posts": payload.get("cited_by_posts_count") or payload.get("cited_by_tweeters_count") or 0,
            "details_url": payload.get("details_url") or "",
        }
        if paper["attention_score"] > 0:
            got_any = True

    if got_any:
        for paper in papers:
            paper["attention_source"] = "altmetric" if paper.get("altmetric") else "none"
        return "altmetric"

    # No Altmetric access (missing key / 403) or no scored papers: use citations as a weak proxy.
    for paper in papers:
        cites = paper.get("icite_citations") or paper.get("citation_count") or 0
        try:
            paper["attention_score"] = float(cites)
        except (TypeError, ValueError):
            paper["attention_score"] = 0.0
        paper["attention_source"] = "citations"
        paper["altmetric"] = None
    return "citations" if not blocked else "unavailable"


def existing_pmids(catalog_url: str | None = None) -> set[str]:
    # PMIDs already in an episode catalog. Drops papers that feed has already used.
    url = catalog_url or MANIFEST_URL
    try:
        payload = _http_get_json(f"{url}?t={int(time.time())}", timeout=15)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return set()
    if not isinstance(payload, list):
        return set()
    found = set()
    for episode in payload:
        pmid = str(episode.get("pmid") or "").strip()
        if pmid:
            found.add(pmid)
    return found


def pubmed_term(
    days: int,
    topic_query: str = "",
    require_nci: bool = True,
    journals: bool = False,
) -> str:
    # Build a PubMed query. Flagship is NCI-only; a scoped feed adds a topic clause.
    parts: list[str] = []
    if require_nci:
        parts.append("(CA[gr] OR NCI[gr])")
    topic = (topic_query or "").strip()
    if topic:
        parts.append(f"({topic})")
    if journals:
        parts.append(f"({JOURNAL_QUERY})")
    if not parts:
        raise ValueError("Need a topic query or the NCI grant filter")
    parts.append(f'"last {days} days"[PDat]')
    parts.append("english[la]")
    parts.append("journal article[pt]")
    return " AND ".join(parts)


def _nci_grants(paper: dict[str, Any]) -> list[str]:
    # Unique CA grant IDs from a paper. Shown on Admin cards and stored on episodes.
    grants = []
    seen = set()
    for grant in paper.get("grants") or []:
        if not is_nci_grant(grant):
            continue
        normalized = normalize_grant(grant.get("grant_id") or "")
        if not normalized or normalized in seen:
            continue
        if not GRANT_CA_RE.search(re.sub(r"[\s\-]", "", normalized)):
            continue
        seen.add(normalized)
        grants.append(normalized)
    return grants


def _is_nci_paper(paper: dict[str, Any]) -> bool:
    # Paper-level NCI check. Drops PubMed hits that are not actually NCI-supported.
    return any(is_nci_grant(grant) for grant in paper.get("grants") or [])


def _score(paper: dict[str, Any]) -> float:
    # Rank by PubMed Trending (lower rank = hotter), then shared outputs. Journal is a small bonus.
    score = 0.0
    rank = paper.get("trending_rank")
    if isinstance(rank, int) and rank > 0:
        score += max(0, TRENDING_LIST_SIZE + 1 - rank) * 2.0
    else:
        attention = paper.get("attention_score")
        if isinstance(attention, (int, float)):
            score += min(float(attention), 250.0) * 2.0
    score += 15 * len(paper.get("outputs") or [])
    if paper.get("whitelist_journal"):
        score += 8
    # Older-paper ranking (unused while SEARCH_OLDER_PAPERS is False):
    # rcr = paper.get("rcr")
    # if isinstance(rcr, (int, float)):
    #     score += min(float(rcr), 10.0) * 4
    return score


def _to_candidate(paper: dict[str, Any]) -> dict[str, Any]:
    # Shape a scored paper into the JSON the Admin API returns.
    outputs = paper.get("outputs") or []
    tool = next((item["url"] for item in outputs if item["type"] in {"github", "zenodo"}), "")
    doi = paper.get("doi") or ""
    pmid = paper["pmid"]
    publication_url = f"https://doi.org/{doi}" if doi else f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    oa_pdf_url = paper.get("oa_pdf_url") or ""
    if not oa_pdf_url and paper.get("pmcid"):
        pmcid = paper["pmcid"] if str(paper["pmcid"]).upper().startswith("PMC") else f"PMC{paper['pmcid']}"
        oa_pdf_url = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/pdf/"

    rcr = paper.get("rcr")
    rank = paper.get("trending_rank")
    attention = paper.get("attention_score")
    source = paper.get("attention_source") or "none"
    if isinstance(rank, int) and rank > 0:
        reason = f"PubMed trending #{rank}"
    elif paper.get("lane") == "weekly":
        reason = "this week's NCI paper" if paper.get("require_nci", True) else "this week's paper"
    elif paper.get("lane") == "attention":
        if source == "altmetric" and isinstance(attention, (int, float)):
            reason = f"Altmetric {attention:.1f}"
        elif source == "citations" and isinstance(attention, (int, float)):
            reason = f"citation proxy {int(attention)}"
        else:
            reason = "recent attention"
    elif isinstance(rcr, (int, float)):
        reason = f"iCite RCR {rcr:.2f}"
    else:
        reason = "citation impact"
    return {
        "pmid": pmid,
        "doi": doi,
        "title": paper.get("title") or "",
        "abstract": paper.get("abstract") or "",
        "journal": paper.get("whitelist_journal") or paper.get("journal") or "",
        "pub_date": paper.get("pub_date"),
        "age_days": paper.get("age_days"),
        "nci_grants": paper.get("nci_grants") or [],
        "lane": paper.get("lane"),
        "rcr": rcr,
        "trending_rank": rank if isinstance(rank, int) else None,
        "trending_url": PUBMED_TRENDING_URL,
        "attention_score": attention if isinstance(attention, (int, float)) else 0,
        "attention_source": source,
        "altmetric": paper.get("altmetric"),
        "citation_count": paper.get("citation_count") or paper.get("icite_citations"),
        "impact": {
            "lane": paper.get("lane"),
            "rcr": rcr,
            "trending_rank": rank if isinstance(rank, int) else None,
            "attention_score": attention if isinstance(attention, (int, float)) else None,
            "reason": reason,
        },
        "outputs": outputs,
        "publication_url": publication_url,
        "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "tool_url": tool,
        "image_url": paper.get("image_url") or "",
        "oa_pdf_url": oa_pdf_url,
        "score": round(_score(paper), 2),
    }


def find_candidates(
    window: str = DEFAULT_WINDOW,
    limit: int = 10,
    topic_query: str = "",
    require_nci: bool = True,
    catalog_url: str | None = None,
    journals_only: bool = False,
    require_outputs: bool = False,
    exclude_pmids: list[str] | None = None,
    trending_only: bool = True,
) -> dict[str, Any]:
    # Weekly search → intersect PubMed Trending → rank by trending order.
    # Flagship defaults: NCI grants, no topic, nci-signal catalog.
    # Community signals pass exclude_pmids from their own history instead of a catalog.
    days = parse_window(window)
    topic_query = (topic_query or "").strip()
    require_nci = bool(require_nci)
    catalog = catalog_url or MANIFEST_URL
    if exclude_pmids is not None:
        used = {str(pmid) for pmid in exclude_pmids if pmid}
    else:
        used = existing_pmids(catalog)
    trending_pmids = fetch_pubmed_trending_pmids()
    trending_rank = {pmid: index + 1 for index, pmid in enumerate(trending_pmids)}

    recent_term = pubmed_term(days, topic_query, require_nci, journals=False)
    flagship_term = pubmed_term(days, topic_query, require_nci, journals=True)
    recent_ids = [] if journals_only else [
        pmid for pmid in pubmed_search(recent_term, retmax=120) if pmid not in used
    ]
    flagship_ids = [pmid for pmid in pubmed_search(flagship_term, retmax=80) if pmid not in used]

    lane_b_ids: list[str] = []
    # --- older papers (iCite RCR lane) ---
    # Parked: the weekly show only wants this week's literature.
    # Set SEARCH_OLDER_PAPERS = True to restore the 5-year highly-cited backup search.
    if SEARCH_OLDER_PAPERS:
        if len(recent_ids) + len(flagship_ids) < 8:
            lane_b_term = pubmed_term(5 * 365, topic_query, require_nci, journals=False)
            lane_b_ids = [
                pmid for pmid in pubmed_search(lane_b_term, retmax=150)
                if pmid not in used and pmid not in recent_ids and pmid not in flagship_ids
            ]

    all_ids = list(dict.fromkeys(recent_ids + flagship_ids + lane_b_ids))
    papers = pubmed_efetch(all_ids)
    papers = [
        paper for paper in papers
        if paper["pmid"] not in used and (not require_nci or _is_nci_paper(paper))
    ]

    icite: dict[str, dict[str, Any]] = {}
    if SEARCH_OLDER_PAPERS:
        icite = icite_enrich([paper["pmid"] for paper in papers])
    for paper in papers:
        row = icite.get(paper["pmid"]) or {}
        rcr = row.get("relative_citation_ratio")
        paper["rcr"] = float(rcr) if isinstance(rcr, (int, float)) else None
        paper["icite_citations"] = row.get("citation_count")
        paper["nci_grants"] = _nci_grants(paper)
        paper["whitelist_journal"] = match_journal(paper.get("journal_title") or "", paper.get("journal_iso") or "")
        paper["outputs"] = find_outputs(" ".join([
            paper.get("title") or "",
            paper.get("abstract") or "",
        ]))
        rank = trending_rank.get(paper["pmid"])
        paper["trending_rank"] = rank
        paper["attention_source"] = "pubmed_trending" if rank else "none"
        paper["attention_score"] = float(TRENDING_LIST_SIZE + 1 - rank) if rank else 0.0
        paper["altmetric"] = None
        paper["require_nci"] = require_nci

    linked = pubmed_elink_outputs([paper["pmid"] for paper in papers])
    for paper in papers:
        paper["outputs"] = merge_outputs(paper.get("outputs"), linked.get(paper["pmid"]))

    if require_outputs:
        papers = [paper for paper in papers if paper.get("outputs")]

    # Parked: Altmetric Details Page scoring. Set USE_ALTMETRIC = True to restore.
    if USE_ALTMETRIC:
        altmetric_enrich(papers)

    for paper in papers:
        age = paper.get("age_days")
        in_window = age is None or age <= days
        if in_window and paper.get("trending_rank"):
            paper["lane"] = "trending"
        elif in_window:
            paper["lane"] = "weekly"
        elif SEARCH_OLDER_PAPERS and paper.get("rcr") is not None and paper["rcr"] >= RCR_THRESHOLD:
            paper["lane"] = "rcr"
        else:
            paper["lane"] = None

    trending_kept = [paper for paper in papers if paper.get("lane") == "trending"]
    if trending_kept and trending_only:
        kept = trending_kept
        attention_source = "pubmed_trending"
    else:
        kept = [paper for paper in papers if paper.get("lane") in {"weekly", "trending", "rcr"}]
        if not kept:
            kept = papers
        if trending_kept:
            attention_source = "pubmed_trending_first"
        else:
            attention_source = "weekly_fallback" if kept else "none"

    openalex_enrich(kept)
    kept.sort(key=lambda paper: (
        paper.get("trending_rank") is None,
        paper.get("trending_rank") or 10**9,
        -_score(paper),
    ))
    candidates = [_to_candidate(paper) for paper in kept[: max(1, min(int(limit or 10), 25))]]

    return {
        "window": f"{days}d",
        "queried": len(all_ids),
        "kept": len(kept),
        "trending_listed": len(trending_pmids),
        "trending_hits": len(trending_kept),
        "attention_source": attention_source,
        "topic_query": topic_query,
        "require_nci": require_nci,
        "journals_only": bool(journals_only),
        "require_outputs": bool(require_outputs),
        "catalog_url": catalog,
        "candidates": candidates,
    }


if __name__ == "__main__":
    result = find_candidates(window=os.getenv("NCI_WINDOW", DEFAULT_WINDOW))
    print(json.dumps(result, indent=2))
