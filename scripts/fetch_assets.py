#!/usr/bin/env python3
"""Download all .asset files under an S3-compatible public bucket prefix."""
from __future__ import annotations

import argparse
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}


def list_objects(base: str, prefix: str, max_keys: int = 1000):
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": str(max_keys)}
        if token:
            params["continuation-token"] = token
        url = base.rstrip("/") + "/?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=60) as r:
            xml = r.read()
        root = ET.fromstring(xml)
        for c in root.findall("s3:Contents", NS):
            key = c.findtext("s3:Key", default="", namespaces=NS)
            if key.endswith(".asset"):
                yield key
        truncated = root.findtext("s3:IsTruncated", default="false", namespaces=NS).lower() == "true"
        if not truncated:
            break
        token = root.findtext("s3:NextContinuationToken", default="", namespaces=NS)
        if not token:
            break


def download(base: str, key: str, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = base.rstrip("/") + "/" + urllib.parse.quote(key, safe="/")
    req = urllib.request.Request(url, headers={"User-Agent": "sekai-event-story-viewer/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as w:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            w.write(chunk)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("ASSET_BASE", "https://storage.sekai.best/sekai-en-assets"))
    ap.add_argument("--prefix", default=os.environ.get("EVENT_PREFIX", "event_story/event_ashiato_2021/scenario/"))
    ap.add_argument("--output", default=os.environ.get("ASSET_OUTPUT", "assets"))
    args = ap.parse_args()

    out = Path(args.output)
    count = 0
    for key in list_objects(args.base, args.prefix):
        dest = out / key
        if dest.exists() and dest.stat().st_size > 0:
            print(f"[skip] {key}")
            count += 1
            continue
        print(f"[get ] {key}")
        for attempt in range(3):
            try:
                download(args.base, key, dest)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        count += 1
    print(f"Downloaded {count} asset files")


if __name__ == "__main__":
    main()
