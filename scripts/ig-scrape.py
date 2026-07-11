#!/usr/bin/env python3
"""Competitor Instagram reel scraper for the Client OS content-intel engine.

Adapted from the operator's competitor-dashboard starter kit. Mechanical
stages only: scrape (Apify) -> dedup -> download -> transcribe (ElevenLabs
Scribe) -> stage JSON. The thinking (relevance scoring, Hook/Beats/CTA
breakdown, the intel doc) is done by the worker's Claude session.

Reads APIFY_TOKEN and ELEVENLABS_API_KEY from the environment, falling back
to the repo .env (this script lives in <repo>/scripts/).

Usage:
    python3 scripts/ig-scrape.py --accounts handle1 handle2 --limit 3 --out ./staging
    python3 scripts/ig-scrape.py --balance          # print Apify usage and exit
    python3 scripts/ig-scrape.py --accounts x --no-transcribe   # captions only
"""
from __future__ import annotations
import argparse, datetime, json, os, re, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_LEDGER = REPO / "worker" / "intel" / "ledger.json"
APIFY_ACTOR = "xMc5Ga1oCONPmWJIa"  # Apify Instagram Reel Scraper

try:
    import requests
except ImportError:
    sys.exit("The 'requests' package is missing. Run: pip3 install requests")

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def load_env_fallback():
    """Populate os.environ from the repo .env for keys not already set."""
    env_file = REPO / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def env_key(name: str, hint: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"{name} not set. {hint}")
    return val


def with_retry(fn, *, what: str, attempts: int = 3, base_delay: float = 2.0):
    last_exc = None
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except Exception as e:
            last_exc = e
            if attempt == attempts:
                break
            delay = base_delay * (2 ** (attempt - 1))
            print(f"  {what} failed (attempt {attempt}/{attempts}): {e}. Retrying in {delay:.0f}s")
            time.sleep(delay)
    raise last_exc


def write_json(path: Path, data, **kw):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, **kw))
    tmp.replace(path)


def shortcode_from_url(url: str) -> str:
    m = re.search(r"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else (re.sub(r"[^A-Za-z0-9_-]", "", (url or ""))[-11:] or "unknown")


def load_ledger(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"seen": []}


def run_apify(token: str, usernames: list[str], per_account: int) -> list[dict]:
    url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"
    body = {"resultsLimit": per_account, "username": usernames}

    def _call():
        r = requests.post(url, json=body, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}, timeout=600)
        r.raise_for_status()
        return r.json()

    return with_retry(_call, what="Apify run")


def print_balance(token: str):
    def _call():
        r = requests.get("https://api.apify.com/v2/users/me/limits", headers={"Authorization": f"Bearer {token}"}, timeout=60)
        r.raise_for_status()
        return r.json().get("data", {})

    d = with_retry(_call, what="Apify usage")
    cur, lim = d.get("current", {}), d.get("limits", {})
    used, cap = cur.get("monthlyUsageUsd"), lim.get("maxMonthlyUsageUsd")
    if used is not None and cap is not None:
        print(f"Apify usage this cycle: ${used:.2f} / ${cap:.2f} (~${cap - used:.2f} left)")


def field(item: dict, *names, default=None):
    for n in names:
        if item.get(n) not in (None, ""):
            return item[n]
    return default


def download_video(video_url: str, dest: Path, attempts: int = 3) -> bool:
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(video_url, headers={"User-Agent": UA}, stream=True, timeout=120) as r:
                r.raise_for_status()
                dest.write_bytes(r.content)
            if dest.stat().st_size > 1000:
                return True
            raise ValueError(f"file too small ({dest.stat().st_size} bytes)")
        except Exception as e:
            if attempt == attempts:
                print(f"    download failed after {attempts} attempts: {e}")
                return False
            time.sleep(2 ** (attempt - 1))
    return False


def transcribe(video_path: Path, api_key: str) -> str:
    def _call():
        with open(video_path, "rb") as fh:
            r = requests.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": api_key},
                data={"model_id": "scribe_v1"},
                files={"file": (video_path.name, fh, "video/mp4")},
                timeout=300,
            )
        r.raise_for_status()
        return r.json()

    try:
        data = with_retry(_call, what="transcribe")
    except Exception as e:
        print(f"    transcribe failed: {e}")
        return ""
    if isinstance(data.get("text"), str) and data["text"].strip():
        return data["text"].strip()
    words = data.get("words") or []
    return " ".join(w.get("text", "") for w in words if w.get("type", "word") == "word").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--accounts", nargs="+", help="Instagram usernames, no @")
    ap.add_argument("--limit", type=int, default=3, help="reels per account")
    ap.add_argument("--out", default="./staging", help="output dir for the batch JSON + videos")
    ap.add_argument("--ledger", default=str(DEFAULT_LEDGER), help="dedup ledger path")
    ap.add_argument("--cap", type=int, default=40, help="max new reels per run")
    ap.add_argument("--no-transcribe", action="store_true")
    ap.add_argument("--balance", action="store_true")
    args = ap.parse_args()

    load_env_fallback()
    token = env_key("APIFY_TOKEN", "set it in the repo .env")
    if args.balance:
        print_balance(token)
        return
    if not args.accounts:
        sys.exit("--accounts required (Instagram usernames, no @)")
    el_key = "" if args.no_transcribe else env_key("ELEVENLABS_API_KEY", "set it in the repo .env")

    out = Path(args.out).resolve()
    videos = out / "videos"
    videos.mkdir(parents=True, exist_ok=True)
    ledger_path = Path(args.ledger).resolve()
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger = load_ledger(ledger_path)
    seen = set(ledger["seen"])
    accounts = [a.lstrip("@").strip() for a in args.accounts if a.strip()]
    print(f"accounts ({len(accounts)}): {', '.join(accounts)} at {args.limit}/account. dedup: {len(seen)} known")

    print("calling Apify...")
    items = run_apify(token, accounts, args.limit)
    print(f"  Apify returned {len(items)} items")

    batch, failures = [], []
    for it in items:
        if len(batch) >= args.cap:
            break
        url = field(it, "url", "postUrl", default="")
        video_url = field(it, "videoUrl", "video_url", "displayUrl")
        code = shortcode_from_url(url)
        if not video_url or code in seen:
            continue
        user = field(it, "ownerUsername", "username", "ownerUserName", default="unknown")
        print(f"  [{user}] {code}")
        try:
            vpath = videos / f"{code}.mp4"
            if not download_video(video_url, vpath):
                failures.append((user, code, "download failed"))
                continue
            transcript = "" if args.no_transcribe else transcribe(vpath, el_key)
            batch.append({
                "shortcode": code,
                "username": user,
                "url": url,
                "views": field(it, "videoViewCount", "videoPlayCount", "playCount", default=0),
                "likes": field(it, "likesCount", "likeCount", default=0),
                "comments": field(it, "commentsCount", "commentCount", default=0),
                "caption": field(it, "caption", "text", default=""),
                "transcript": transcript,
            })
            seen.add(code)
        except Exception as e:
            print(f"    ERROR {code}: {e}. Skipping")
            failures.append((user, code, str(e)))

    date = datetime.date.today().isoformat()
    batch_path = out / f"batch-{date}.json"
    write_json(batch_path, batch, indent=2, ensure_ascii=False)
    ledger["seen"] = sorted(seen)
    write_json(ledger_path, ledger, indent=2)

    print(f"\nstaged {len(batch)} new reels -> {batch_path}")
    if failures:
        print(f"! {len(failures)} skipped: " + "; ".join(f"[{u}] {c}: {w}" for u, c, w in failures))


if __name__ == "__main__":
    main()
