#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import urllib.request
from typing import Any


def fetch_text(source: str) -> str:
    if source.startswith(("http://", "https://")):
        req = urllib.request.Request(
            source,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; SekaiTalkExtractor/1.0)",
                "Accept": "text/plain, application/json, */*",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
        return raw.decode("utf-8", errors="replace")

    return pathlib.Path(source).read_text(encoding="utf-8", errors="replace")


def safe_get(obj: dict[str, Any], key: str, default=None):
    value = obj.get(key, default)
    return default if value is None else value


def normalize_talk(t: dict[str, Any], idx: int) -> dict[str, Any]:
    voices = []
    for v in t.get("Voices") or []:
        voices.append(
            {
                "Character2dId": v.get("Character2dId"),
                "VoiceId": v.get("VoiceId"),
                "Volume": v.get("Volume"),
            }
        )

    motions = []
    for m in t.get("Motions") or []:
        motions.append(
            {
                "Character2dId": m.get("Character2dId"),
                "MotionName": m.get("MotionName"),
                "FacialName": m.get("FacialName"),
                "TimingSyncValue": m.get("TimingSyncValue"),
            }
        )

    return {
        "index": idx,
        "speaker": t.get("WindowDisplayName") or "",
        "body": t.get("Body") or "",
        "talk_tention": t.get("TalkTention"),
        "lip_sync": t.get("LipSync"),
        "speed": t.get("Speed"),
        "font_size": t.get("FontSize"),
        "when_finish_close_window": t.get("WhenFinishCloseWindow"),
        "require_play_effect": t.get("RequirePlayEffect"),
        "effect_reference_idx": t.get("EffectReferenceIdx"),
        "require_play_sound": t.get("RequirePlaySound"),
        "sound_reference_idx": t.get("SoundReferenceIdx"),
        "target_value_scale": t.get("TargetValueScale"),
        "motions": motions,
        "voices": voices,
    }


def extract(payload: dict[str, Any], source_url: str) -> dict[str, Any]:
    talks = payload.get("TalkData") or []
    return {
        "source_url": source_url,
        "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scenario_id": payload.get("ScenarioId") or payload.get("m_Name") or "",
        "name": payload.get("m_Name") or "",
        "first_bgm": payload.get("FirstBgm"),
        "first_background": payload.get("FirstBackground"),
        "appear_characters": payload.get("AppearCharacters") or [],
        "talk_count": len(talks),
        "talks": [normalize_talk(t, i + 1) for i, t in enumerate(talks)],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a Sekai .asset file and extract TalkData.")
    parser.add_argument("--url", required=True, help="Source .asset URL")
    parser.add_argument("--out", required=True, help="Output JSON file path")
    args = parser.parse_args()

    text = fetch_text(args.url)
    payload = json.loads(text)
    extracted = extract(payload, args.url)

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(extracted['talks'])} talks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
