#!/usr/bin/env python3
"""Download Project SEKAI event-story .asset files and build static JSON for GitHub Pages."""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STORY_DIR = DATA_DIR / "stories"
RAW_DIR = ROOT / ".asset-cache"
EVENTS_URL = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/events.json"
EVENT_STORIES_URL = "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/eventStories.json"
STORAGE_ROOT = "https://storage.sekai.best/sekai-en-assets/event_story"
CACHE_ENABLED = os.getenv("ASSET_CACHE", "false").lower() == "true"
TIMEOUT = int(os.getenv("DOWNLOAD_TIMEOUT", "30"))
RETRIES = int(os.getenv("DOWNLOAD_RETRIES", "3"))
MAX_BYTES = 8 * 1024 * 1024


def http_json(url: str):
    req = Request(url, headers={"User-Agent": "sekai-story-talk-viewer/1.0"})
    with urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def http_bytes(url: str) -> bytes:
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = Request(url, headers={"User-Agent": "sekai-story-talk-viewer/1.0", "Accept": "application/json,text/plain,*/*"})
            with urlopen(req, timeout=TIMEOUT) as r:
                data = r.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError(f"asset too large: {url}")
            return data
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            last = exc
            if attempt < RETRIES:
                time.sleep(attempt)
    raise RuntimeError(f"download failed: {url}: {last}")


def clean_body(value):
    text = "" if value is None else str(value)
    if len(text) >= 2 and text.startswith("<") and text.endswith(">"):
        text = text[1:-1]
    return text


def normalize_talk(index: int, talk: dict) -> dict:
    return {
        "index": index + 1,
        "speaker": talk.get("WindowDisplayName", ""),
        "body": clean_body(talk.get("Body", "")),
        "characters": talk.get("TalkCharacters", []),
        "voices": talk.get("Voices", []),
        "talkTention": talk.get("TalkTention", 0),
        "lipSync": talk.get("LipSync", 0),
        "motionChangeFrom": talk.get("MotionChangeFrom", 0),
        "motions": talk.get("Motions", []),
        "speed": talk.get("Speed", 0),
        "fontSize": talk.get("FontSize", 0),
        "whenFinishCloseWindow": talk.get("WhenFinishCloseWindow", 0),
        "requirePlayEffect": talk.get("RequirePlayEffect", 0),
        "effectReferenceIdx": talk.get("EffectReferenceIdx", 0),
        "requirePlaySound": talk.get("RequirePlaySound", 0),
        "soundReferenceIdx": talk.get("SoundReferenceIdx", 0),
    }


def normalize_asset(asset: dict, event: dict, ep: dict, source_url: str) -> dict:
    talks = asset.get("TalkData", [])
    appear = asset.get("AppearCharacters", [])
    return {
        "scenarioId": asset.get("ScenarioId") or ep.get("scenarioId"),
        "eventId": event.get("id"),
        "eventStoryId": event.get("eventStoryId"),
        "episodeNo": ep.get("episodeNo"),
        "title": ep.get("title", ""),
        "assetbundleName": ep.get("assetbundleName", ""),
        "sourceUrl": source_url,
        "downloadedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "firstBgm": asset.get("FirstBgm", ""),
        "firstBackground": asset.get("FirstBackground", ""),
        "appearCharacters": appear,
        "talks": [normalize_talk(i, t) for i, t in enumerate(talks)],
    }


def safe_filename(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", s)


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    STORY_DIR.mkdir(parents=True, exist_ok=True)
    if CACHE_ENABLED:
        RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching master data...")
    events = http_json(EVENTS_URL)
    event_stories = http_json(EVENT_STORIES_URL)
    event_by_id = {e.get("id"): e for e in events}

    index_events = []
    success = 0
    failed = []

    for story in event_stories:
        event_id = story.get("eventId") or story.get("id")
        event = event_by_id.get(event_id, {})
        event_record = {
            "id": event_id,
            "name": event.get("name", f"Event {event_id}"),
            "assetbundleName": story.get("assetbundleName") or event.get("assetbundleName", ""),
            "outline": story.get("outline", ""),
            "episodes": [],
        }
        for ep in sorted(story.get("eventStoryEpisodes", []), key=lambda x: x.get("episodeNo", 0)):
            bundle = ep.get("assetbundleName", "")
            scenario = ep.get("scenarioId", "")
            if not bundle or not scenario:
                continue
            filename = safe_filename(f"{scenario}.json")
            source_url = f"{STORAGE_ROOT}/{bundle}/scenario/{scenario}.asset"
            record = {
                "episodeId": ep.get("id"),
                "episodeNo": ep.get("episodeNo"),
                "title": ep.get("title", ""),
                "assetbundleName": bundle,
                "scenarioId": scenario,
                "file": filename,
                "sourceUrl": source_url,
                "status": "pending",
            }
            out_path = STORY_DIR / filename
            try:
                raw = None
                if CACHE_ENABLED:
                    cache_path = RAW_DIR / safe_filename(f"{scenario}.asset")
                    if cache_path.exists():
                        raw = cache_path.read_bytes()
                    else:
                        raw = http_bytes(source_url)
                        cache_path.write_bytes(raw)
                else:
                    raw = http_bytes(source_url)
                asset = json.loads(raw.decode("utf-8"))
                normalized = normalize_asset(asset, {**story, **event, "id": event_id}, ep, source_url)
                out_path.write_text(json.dumps(normalized, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                record["status"] = "ok"
                record["talkCount"] = len(normalized["talks"])
                record["characterCount"] = len(normalized["appearCharacters"])
                success += 1
            except Exception as exc:
                record["status"] = "error"
                record["error"] = str(exc)
                failed.append((scenario, source_url, str(exc)))
                if out_path.exists():
                    out_path.unlink()
            event_record["episodes"].append(record)
        index_events.append(event_record)
        print(f"EVENT {event_id}: {event_record['name']} -> {len(event_record['episodes'])} episodes")

    # Keep only successfully built episodes in the public index.
    for event in index_events:
        event["episodes"] = [ep for ep in event["episodes"] if ep["status"] == "ok"]
    index_events = [e for e in index_events if e["episodes"]]

    index = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Sekai-World/sekai-master-db-diff + storage.sekai.best/sekai-en-assets",
        "totalEvents": len(index_events),
        "totalEpisodes": sum(len(e["episodes"]) for e in index_events),
        "totalTalks": sum(ep.get("talkCount", 0) for e in index_events for ep in e["episodes"]),
        "failedEpisodes": [{"scenarioId": s, "url": u, "error": err} for s, u, err in failed],
        "events": index_events,
    }
    (DATA_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Built {success} episodes. Failed: {len(failed)}")
    if failed:
        for row in failed[:20]: print("FAILED", row)
        # Do not fail the whole Pages deployment when individual retired/missing assets are encountered.
    return 0


if __name__ == "__main__":
    sys.exit(main())
