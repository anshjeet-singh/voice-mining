#!/usr/bin/env python3
"""Competitor YouTube scraper for the Client OS content-intel engine.

Given channel handles or URLs, pulls each channel's latest long-form videos
via the YouTube Data API (title, description, views, likes, published date)
and attempts a caption transcript via the public timedtext endpoint. Stages
a JSON batch for the worker's Claude session to analyze.

Reads YOUTUBE_API_KEY from the environment, falling back to the repo .env.

Usage:
    python3 scripts/yt-scrape.py --channels @handle1 https://youtube.com/@handle2 --limit 3 --out ./staging
"""
from __future__ import annotations
import argparse, datetime, html, json, os, re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
API = "https://www.googleapis.com/youtube/v3"

try:
    import requests
except ImportError:
    sys.exit("The 'requests' package is missing. Run: pip3 install requests")


def load_env_fallback():
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


def handle_from(raw: str) -> str:
    raw = raw.strip()
    m = re.search(r"youtube\.com/(@[A-Za-z0-9._-]+)", raw)
    if m:
        return m.group(1)
    m = re.search(r"youtube\.com/channel/([A-Za-z0-9_-]+)", raw)
    if m:
        return m.group(1)  # raw channel id
    return raw if raw.startswith("@") or raw.startswith("UC") else "@" + raw


def resolve_channel(key: str, handle: str) -> dict | None:
    params = {"part": "id,snippet,contentDetails", "key": key}
    if handle.startswith("UC"):
        params["id"] = handle
    else:
        params["forHandle"] = handle
    r = requests.get(f"{API}/channels", params=params, timeout=30)
    r.raise_for_status()
    items = r.json().get("items", [])
    return items[0] if items else None


def latest_videos(key: str, uploads_playlist: str, limit: int) -> list[str]:
    r = requests.get(
        f"{API}/playlistItems",
        params={"part": "contentDetails", "playlistId": uploads_playlist, "maxResults": min(max(limit * 6, 20), 50), "key": key},
        timeout=30,
    )
    r.raise_for_status()
    return [i["contentDetails"]["videoId"] for i in r.json().get("items", [])]


def video_details(key: str, video_ids: list[str]) -> list[dict]:
    if not video_ids:
        return []
    r = requests.get(
        f"{API}/videos",
        params={"part": "snippet,statistics,contentDetails", "id": ",".join(video_ids), "key": key},
        timeout=30,
    )
    r.raise_for_status()
    return r.json().get("items", [])


def duration_seconds(iso: str) -> int:
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def try_captions(video_id: str) -> str:
    """Public timedtext captions when available (no auth). Empty when not."""
    try:
        r = requests.get(
            "https://video.google.com/timedtext",
            params={"lang": "en", "v": video_id},
            timeout=20,
        )
        if r.status_code != 200 or not r.text.strip():
            return ""
        texts = re.findall(r"<text[^>]*>(.*?)</text>", r.text, re.S)
        joined = " ".join(html.unescape(t).replace("\n", " ") for t in texts)
        return re.sub(r"\s+", " ", joined).strip()
    except Exception:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channels", nargs="+", required=True, help="@handles or channel URLs")
    ap.add_argument("--limit", type=int, default=3, help="videos per channel")
    ap.add_argument("--min-seconds", type=int, default=120, help="skip shorts below this duration")
    ap.add_argument("--out", default="./staging")
    args = ap.parse_args()

    load_env_fallback()
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        sys.exit("YOUTUBE_API_KEY not set. Set it in the repo .env")

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    batch = []
    for raw in args.channels:
        handle = handle_from(raw)
        try:
            ch = resolve_channel(key, handle)
        except Exception as e:
            print(f"  [{handle}] channel lookup failed: {e}")
            continue
        if not ch:
            print(f"  [{handle}] channel not found")
            continue
        name = ch["snippet"]["title"]
        uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
        print(f"  [{handle}] {name}")
        try:
            ids = latest_videos(key, uploads, args.limit)
            details = video_details(key, ids)
        except Exception as e:
            print(f"    video fetch failed: {e}")
            continue
        kept = 0
        for v in details:
            if kept >= args.limit:
                break
            if duration_seconds(v["contentDetails"].get("duration", "")) < args.min_seconds:
                continue  # skip shorts
            vid = v["id"]
            transcript = try_captions(vid)
            batch.append({
                "platform": "youtube",
                "channel": name,
                "handle": handle,
                "videoId": vid,
                "url": f"https://youtube.com/watch?v={vid}",
                "title": v["snippet"]["title"],
                "description": (v["snippet"].get("description") or "")[:1500],
                "publishedAt": v["snippet"].get("publishedAt", "")[:10],
                "views": int(v["statistics"].get("viewCount", 0)),
                "likes": int(v["statistics"].get("likeCount", 0)),
                "comments": int(v["statistics"].get("commentCount", 0)),
                "transcript": transcript,
                "transcriptSource": "captions" if transcript else "none (analyze from title + description)",
            })
            kept += 1
            print(f"    + {v['snippet']['title'][:60]} ({v['statistics'].get('viewCount', '?')} views{', captions' if transcript else ''})")

    date = datetime.date.today().isoformat()
    path = out / f"yt-batch-{date}.json"
    path.write_text(json.dumps(batch, indent=2, ensure_ascii=False))
    print(f"\nstaged {len(batch)} videos -> {path}")


if __name__ == "__main__":
    main()
