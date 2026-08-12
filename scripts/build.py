from __future__ import annotations
import json, html, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
DATA = ROOT / 'data'
OUT = ROOT / 'dist'
ASSET = DATA / 'event_39_01.asset'


def clean_body(body: str) -> str:
    # Asset text is wrapped in <...>; strip one or more wrappers safely.
    body = body or ''
    body = body.strip()
    if body.startswith('<') and body.endswith('>'):
        body = body[1:-1]
    return body.replace('\\n', '\n').replace('<br>', '\n')


def get_names(asset: dict) -> dict[int, str]:
    names = {}
    for t in asset.get('TalkData', []):
        n = (t.get('WindowDisplayName') or '').strip()
        for c in t.get('TalkCharacters', []):
            cid = c.get('Character2dId')
            if cid is not None and n:
                names.setdefault(cid, n)
    return names


def build_data(asset: dict) -> dict:
    names = get_names(asset)
    chars = []
    seen = set()
    for c in asset.get('AppearCharacters', []):
        cid = c.get('Character2dId')
        if cid in seen:
            continue
        seen.add(cid)
        chars.append({
            'id': cid,
            'name': names.get(cid, f'Character {cid}'),
            'costume': c.get('CostumeType', ''),
        })
    talks = []
    for i, t in enumerate(asset.get('TalkData', []), start=1):
        ids = [c.get('Character2dId') for c in t.get('TalkCharacters', [])]
        names_here = [names.get(cid, f'Character {cid}') for cid in ids]
        talks.append({
            'index': i,
            'characterIds': ids,
            'speakers': names_here,
            'name': t.get('WindowDisplayName') or (names_here[0] if names_here else 'Narration'),
            'body': clean_body(t.get('Body', '')),
            'voiceIds': [v.get('VoiceId') for v in t.get('Voices', []) if v.get('VoiceId')],
            'motionNames': [m.get('MotionName') for m in t.get('Motions', []) if m.get('MotionName')],
        })
    return {
        'scenarioId': asset.get('ScenarioId') or asset.get('m_Name'),
        'background': asset.get('FirstBackground', ''),
        'bgm': asset.get('FirstBgm', ''),
        'characters': chars,
        'talks': talks,
        'meta': {
            'talkCount': len(talks),
            'snippetCount': len(asset.get('Snippets', [])),
            'layoutCount': len(asset.get('LayoutData', [])),
            'soundCount': len(asset.get('SoundData', [])),
        }
    }

asset = json.loads(ASSET.read_text(encoding='utf-8'))
parsed = build_data(asset)
OUT.mkdir(exist_ok=True)
(OUT / 'data').mkdir(exist_ok=True)
(OUT / 'assets').mkdir(exist_ok=True)
(OUT / 'data' / 'story.json').write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding='utf-8')
for p in (SRC / 'index.html', SRC / 'styles.css', SRC / 'app.js'):
    (OUT / p.name).write_text(p.read_text(encoding='utf-8'), encoding='utf-8')
print(f"built {parsed['scenarioId']}: {len(parsed['talks'])} talks, {len(parsed['characters'])} characters")
