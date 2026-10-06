"""Scoped-feed records for NCI Signal.

Flagship is the default case: empty topic, NCI grant filter, nci-signal catalog.
A lab feed adds a PubMed topic clause and writes used PMIDs to its own catalog.
Finding candidates never starts TTS.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SRC = Path(__file__).resolve().parents[1]
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from tasks.paperFinder import find_candidates
from tasks.scriptPrompts import list_prompts, resolve_prompt_name

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCAL_FEEDS = Path(os.getenv("NCI_FEEDS_PATH") or REPO_ROOT / "data" / "feeds.json")

S3_BUCKET = os.getenv("S3_BUCKET", "axiom-podcasts")
S3_REMOTE = os.getenv("S3_REMOTE", "maayanlab")
S3_PREFIX = os.getenv("S3_PREFIX", "nci-signal")
S3_PUBLIC_BASE = os.getenv(
    "S3_PUBLIC_BASE",
    f"https://s3.k8s.maayanlab.cloud/{S3_BUCKET}",
)

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
FLAGSHIP_SLUG = "flagship"

FLAGSHIP: dict[str, Any] = {
    "slug": FLAGSHIP_SLUG,
    "name": "NCI Signal",
    "topic_query": "",
    "require_nci": True,
    "window": "7d",
    "prompt": "v2_ted_talk",
    "catalog_prefix": "nci-signal",
}


def catalog_url(prefix: str | None = None) -> str:
    clean = (prefix or S3_PREFIX).strip().strip("/")
    return f"{S3_PUBLIC_BASE}/{clean}/manifest.json"


def feeds_public_url() -> str:
    return f"{S3_PUBLIC_BASE}/{S3_PREFIX}/feeds.json"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:48]


def _normalize(raw: dict[str, Any], *, creating: bool = False) -> dict[str, Any]:
    slug = str(raw.get("slug") or "").strip().lower()
    if not slug:
        slug = _slugify(str(raw.get("name") or ""))
    if not SLUG_RE.match(slug):
        raise ValueError("Feed slug must be lowercase letters, numbers, and hyphens")

    name = str(raw.get("name") or "").strip() or slug
    topic_query = str(raw.get("topic_query") or "").strip()
    require_nci = bool(raw.get("require_nci", True))
    if not require_nci and not topic_query:
        raise ValueError("A scoped feed needs a topic query if the NCI grant filter is off")

    window = str(raw.get("window") or "7d").strip() or "7d"
    prompt = resolve_prompt_name(raw.get("prompt"))
    if slug == FLAGSHIP_SLUG:
        prefix = FLAGSHIP["catalog_prefix"]
        topic_query = ""
        require_nci = True
    else:
        prefix = str(raw.get("catalog_prefix") or f"{S3_PREFIX}/feeds/{slug}").strip().strip("/")

    now = _now()
    return {
        "slug": slug,
        "name": name,
        "topic_query": topic_query,
        "require_nci": require_nci,
        "window": window,
        "prompt": prompt,
        "catalog_prefix": prefix,
        "created_at": now if creating else (raw.get("created_at") or now),
        "updated_at": now,
    }


def _ensure_flagship(feeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_slug = {feed.get("slug"): feed for feed in feeds if feed.get("slug")}
    if FLAGSHIP_SLUG not in by_slug:
        feeds = [_normalize(dict(FLAGSHIP), creating=True), *feeds]
    else:
        feeds = [feed for feed in feeds if feed.get("slug") != FLAGSHIP_SLUG]
        feeds.insert(0, _normalize({**FLAGSHIP, **by_slug[FLAGSHIP_SLUG]}))
    return feeds


def _rclone(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("RCLONE_CONFIG_MAAYANLAB_ACL", None)
    return subprocess.run(
        [
            "rclone",
            "--s3-no-check-bucket",
            "--s3-no-head",
            "--no-check-dest",
            *args,
        ],
        capture_output=True,
        text=True,
        env=env,
    )


def _read_local() -> list[dict[str, Any]]:
    if not LOCAL_FEEDS.exists():
        return []
    payload = json.loads(LOCAL_FEEDS.read_text())
    if isinstance(payload, dict):
        payload = payload.get("feeds")
    return payload if isinstance(payload, list) else []


def _write_local(feeds: list[dict[str, Any]]) -> None:
    LOCAL_FEEDS.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_FEEDS.write_text(json.dumps({"feeds": feeds}, indent=2) + "\n")


def _read_s3() -> list[dict[str, Any]]:
    try:
        from tasks.paperFinder import _http_get_json
        payload = _http_get_json(f"{feeds_public_url()}?t={int(__import__('time').time())}", timeout=15)
    except Exception:
        return []
    if isinstance(payload, dict):
        payload = payload.get("feeds")
    return payload if isinstance(payload, list) else []


def _write_s3(feeds: list[dict[str, Any]]) -> bool:
    tmp = Path("/tmp/nci-signal-feeds.json")
    tmp.write_text(json.dumps({"feeds": feeds}, indent=2) + "\n")
    remote = f"{S3_REMOTE}:{S3_BUCKET}/{S3_PREFIX}/feeds.json"
    result = _rclone("copyto", str(tmp), remote)
    return result.returncode == 0


def load_feeds() -> list[dict[str, Any]]:
    feeds = _read_s3() or _read_local()
    return _ensure_flagship(feeds)


def save_feeds(feeds: list[dict[str, Any]]) -> dict[str, Any]:
    feeds = _ensure_flagship(feeds)
    _write_local(feeds)
    stored = "s3" if _write_s3(feeds) else "local"
    return {"feeds": feeds, "stored": stored}


def list_feeds() -> dict[str, Any]:
    feeds = load_feeds()
    return {
        "feeds": feeds,
        "prompts": list_prompts(),
        "flagship": FLAGSHIP_SLUG,
    }


def get_feed(slug: str) -> dict[str, Any]:
    wanted = (slug or FLAGSHIP_SLUG).strip().lower() or FLAGSHIP_SLUG
    for feed in load_feeds():
        if feed["slug"] == wanted:
            return feed
    raise KeyError(f"Unknown feed {wanted!r}")


def upsert_feed(
    name: str = "",
    slug: str = "",
    topic_query: str = "",
    require_nci: bool = True,
    window: str = "7d",
    prompt: str = "",
    catalog_prefix: str = "",
) -> dict[str, Any]:
    incoming = {
        "name": name,
        "slug": slug,
        "topic_query": topic_query,
        "require_nci": require_nci,
        "window": window,
        "prompt": prompt or None,
        "catalog_prefix": catalog_prefix,
    }
    wanted = (slug or _slugify(name)).strip().lower()
    if wanted == FLAGSHIP_SLUG:
        raise ValueError("The flagship feed cannot be overwritten")
    feeds = load_feeds()
    existing = next((feed for feed in feeds if feed["slug"] == wanted), None)
    if existing:
        merged = {**existing, **incoming}
        if not prompt:
            merged["prompt"] = existing.get("prompt")
        if not catalog_prefix:
            merged["catalog_prefix"] = existing.get("catalog_prefix")
        feed = _normalize(merged)
        feeds = [feed if item["slug"] == feed["slug"] else item for item in feeds]
    else:
        feed = _normalize(incoming, creating=True)
        feeds.append(feed)
    saved = save_feeds(feeds)
    return {"feed": feed, "stored": saved["stored"]}


def delete_feed(slug: str) -> dict[str, Any]:
    wanted = (slug or "").strip().lower()
    if wanted == FLAGSHIP_SLUG:
        raise ValueError("The flagship feed cannot be deleted")
    feeds = load_feeds()
    kept = [feed for feed in feeds if feed["slug"] != wanted]
    if len(kept) == len(feeds):
        raise KeyError(f"Unknown feed {wanted!r}")
    saved = save_feeds(kept)
    return {"deleted": wanted, "stored": saved["stored"], "feeds": saved["feeds"]}


def run_feed(slug: str = FLAGSHIP_SLUG, window: str = "", limit: int = 10) -> dict[str, Any]:
    # Candidate-only. Does not generate audio.
    feed = get_feed(slug)
    result = find_candidates(
        window=window or feed.get("window") or "7d",
        limit=limit,
        topic_query=feed.get("topic_query") or "",
        require_nci=feed.get("require_nci", True),
        catalog_url=catalog_url(feed.get("catalog_prefix")),
    )
    result["feed"] = feed
    return result


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="List, add, or run a scoped NCI Signal feed")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="Show saved feeds")

    add = sub.add_parser("add", help="Create or update a feed")
    add.add_argument("--name", required=True)
    add.add_argument("--slug", default="")
    add.add_argument("--topic", dest="topic_query", default="")
    add.add_argument("--no-nci", dest="require_nci", action="store_false")
    add.add_argument("--window", default="7d")
    add.add_argument("--prompt", default="")

    delete = sub.add_parser("delete", help="Remove a scoped feed")
    delete.add_argument("slug")

    run = sub.add_parser("run", help="Find candidates for a feed (no TTS)")
    run.add_argument("slug", nargs="?", default=FLAGSHIP_SLUG)
    run.add_argument("--window", default="")
    run.add_argument("--limit", type=int, default=10)

    args = parser.parse_args(argv)
    if args.command == "list":
        print(json.dumps(list_feeds(), indent=2))
        return 0
    if args.command == "add":
        print(json.dumps(upsert_feed(
            name=args.name,
            slug=args.slug,
            topic_query=args.topic_query,
            require_nci=args.require_nci,
            window=args.window,
            prompt=args.prompt,
        ), indent=2))
        return 0
    if args.command == "delete":
        print(json.dumps(delete_feed(args.slug), indent=2))
        return 0
    print(json.dumps(run_feed(args.slug, window=args.window, limit=args.limit), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
