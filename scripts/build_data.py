#!/usr/bin/env python3
"""Build compact story JSON from downloaded Project SEKAI .asset files."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def clean_body(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if len(text) >= 2 and text.startswith("<") and text.endswith(">"):
        text = text[1:-1]
    return text.replace("\r\n", "\n").replace("\r", "\n")


def parse_asset(path: Path, root: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)

    talks = []
    chars: dict[str, dict[str, Any]] = {}
    for i, talk in enumerate(raw.get("TalkData", []) or []):
        name = str(talk.get("WindowDisplayName") or "Unknown")
        ids = [x.get("Character2dId") for x in (talk.get("TalkCharacters") or []) if isinstance(x, dict)]
        ids = [x for x in ids if x is not None]
        body = clean_body(talk.get("Body"))
        voices = [
            {"character2dId": v.get("Character2dId"), "voiceId": v.get("VoiceId")}
            for v in (talk.get("Voices") or [])
            if isinstance(v, dict)
        ]
        talks.append({
            "index": i + 1,
            "speaker": name,
            "character2dIds": ids,
            "body": body,
            "voices": voices,
        })
        entry = chars.setdefault(name, {"name": name, "character2dIds": set()})
        entry["character2dIds"].update(ids)

    for entry in chars.values():
        entry["character2dIds"] = sorted(entry["character2dIds"])

    rel = path.relative_to(root).as_posix()
    return {
        "scenarioId": raw.get("ScenarioId") or path.stem,
        "file": rel,
        "firstBackground": raw.get("FirstBackground") or "",
        "firstBgm": raw.get("FirstBgm") or "",
        "appearCharacters": raw.get("AppearCharacters") or [],
        "characters": sorted(chars.values(), key=lambda x: x["name"]),
        "talks": talks,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="assets")
    ap.add_argument("--output", default="site/data")
    args = ap.parse_args()

    root = Path(args.input)
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    episodes: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.asset")):
        try:
            item = parse_asset(path, root)
        except Exception as exc:
            print(f"[WARN] skipped {path}: {exc}")
            continue
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", item["scenarioId"])
        payload = out / f"{name}.json"
        payload.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
        episodes.append({
            "scenarioId": item["scenarioId"],
            "file": item["file"],
            "dataFile": f"{name}.json",
            "talkCount": len(item["talks"]),
            "characterNames": [x["name"] for x in item["characters"]],
        })

    index = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "episodeCount": len(episodes),
        "talkCount": sum(x["talkCount"] for x in episodes),
        "episodes": episodes,
    }
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Built {len(episodes)} episode files / {index['talkCount']} talks")


if __name__ == "__main__":
    main()
