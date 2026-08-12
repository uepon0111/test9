#!/usr/bin/env python3
from __future__ import annotations

import concurrent.futures
import json
import os
import re
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / 'data'
STORY_DIR = DATA_DIR / 'stories'

EVENTS_URL = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/events.json'
EVENT_STORIES_URL = 'https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/eventStories.json'
STORAGE_ROOT = 'https://storage.sekai.best/sekai-en-assets/event_story'

TIMEOUT = int(os.getenv('DOWNLOAD_TIMEOUT', '25'))
RETRIES = max(1, int(os.getenv('DOWNLOAD_RETRIES', '2')))
WORKERS = max(1, int(os.getenv('DOWNLOAD_WORKERS', '12')))
FORCE = os.getenv('FORCE_REBUILD', 'false').lower() == 'true'
MAX_BYTES = 8 * 1024 * 1024
HEARTBEAT_SECONDS = max(5, int(os.getenv('PROGRESS_HEARTBEAT', '10')))

log_lock = threading.Lock()
progress_lock = threading.Lock()
progress_state = {
    'done': 0,
    'total': 0,
    'ok': 0,
    'cached': 0,
    'failed': 0,
    'active': set(),
}


def log(message: str) -> None:
    with log_lock:
        print(message, flush=True)


def heartbeat_loop(stop_event: threading.Event) -> None:
    while not stop_event.wait(HEARTBEAT_SECONDS):
        with progress_lock:
            done = progress_state['done']
            total = progress_state['total']
            active = sorted(progress_state['active'])
            ok = progress_state['ok']
            cached = progress_state['cached']
            failed = progress_state['failed']
        pct = (done * 100 // total) if total else 100
        active_text = ', '.join(active[:6]) if active else '待機中'
        if len(active) > 6:
            active_text += f' …他{len(active) - 6}件'
        log(
            f'HEARTBEAT {done}/{total} ({pct}%) | '
            f'成功={ok} キャッシュ={cached} 失敗={failed} | '
            f'処理中={active_text}'
        )


def get_json(url: str):
    with urlopen(Request(url, headers={'User-Agent': 'sekai-story-talk-viewer/3.0'}), timeout=TIMEOUT) as response:
        return json.loads(response.read().decode('utf-8'))


def get_bytes(url: str, label: str) -> bytes:
    last_error = None
    for attempt in range(1, RETRIES + 1):
        log(f'DOWNLOAD_START | {label} | attempt {attempt}/{RETRIES}')
        started = time.monotonic()
        try:
            with urlopen(
                Request(
                    url,
                    headers={
                        'User-Agent': 'sekai-story-talk-viewer/3.0',
                        'Accept': 'application/json,text/plain,*/*',
                    },
                ),
                timeout=TIMEOUT,
            ) as response:
                data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError(f'asset too large: >{MAX_BYTES} bytes')
            elapsed = time.monotonic() - started
            log(f'DOWNLOAD_OK   | {label} | {len(data):,} bytes | {elapsed:.1f}s')
            return data
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            elapsed = time.monotonic() - started
            log(f'DOWNLOAD_FAIL | {label} | {elapsed:.1f}s | {exc}')
            if attempt < RETRIES:
                wait = min(attempt * 2, 5)
                log(f'RETRY_WAIT    | {label} | {wait}s')
                time.sleep(wait)
    raise RuntimeError(f'download failed after {RETRIES} attempts: {last_error}')


def body(value) -> str:
    text = '' if value is None else str(value)
    return text[1:-1] if len(text) >= 2 and text.startswith('<') and text.endswith('>') else text


def character_ids(value) -> list[int]:
    if not isinstance(value, list):
        return []
    result = []
    for character in value:
        if isinstance(character, dict):
            value_id = character.get('Character2dId')
        else:
            value_id = character
        try:
            if value_id is not None:
                result.append(int(value_id))
        except (TypeError, ValueError):
            continue
    return list(dict.fromkeys(result))


def normalize(asset: dict, event: dict, episode: dict, url: str) -> dict:
    talks = []
    for index, talk in enumerate(asset.get('TalkData', []), start=1):
        # Keep only dialogue text and character IDs. Voice/motion/lip-sync data is intentionally omitted.
        talks.append(
            {
                'index': index,
                'speaker': talk.get('WindowDisplayName', ''),
                'body': body(talk.get('Body', '')),
                'characters': character_ids(talk.get('TalkCharacters', [])),
            }
        )

    return {
        'scenarioId': asset.get('ScenarioId') or episode.get('scenarioId'),
        'eventId': event.get('id'),
        'eventStoryId': event.get('eventStoryId'),
        'episodeNo': episode.get('episodeNo'),
        'title': episode.get('title', ''),
        'assetbundleName': episode.get('assetbundleName', ''),
        'sourceUrl': url,
        'talks': talks,
    }


def safe(value: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]', '_', value)


def process(task):
    event, story, episode, meta = task
    scenario_id = episode['scenarioId']
    filename = safe(f'{scenario_id}.json')
    output = STORY_DIR / filename
    url = f"{STORAGE_ROOT}/{episode['assetbundleName']}/scenario/{scenario_id}.asset"
    label = f"{meta['eventName']} / 第{episode['episodeNo']}話 / {scenario_id}"

    with progress_lock:
        progress_state['active'].add(label)

    try:
        if output.exists() and not FORCE:
            try:
                cached = json.loads(output.read_text(encoding='utf-8'))
                # Rebuild old-format files once so removed voice/motion/appearance fields disappear.
                if set(cached.keys()) >= {'scenarioId', 'talks'}:
                    return {
                        **meta,
                        'file': filename,
                        'sourceUrl': url,
                        'status': 'cached',
                        'talkCount': len(cached.get('talks', [])),
                        'characterCount': len({cid for t in cached.get('talks', []) for cid in character_ids(t.get('characters', []))}),
                    }
            except Exception:
                pass

        asset = json.loads(get_bytes(url, label).decode('utf-8'))
        normalized = normalize(asset, {**story, **event, 'id': event['id']}, episode, url)
        output.write_text(json.dumps(normalized, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        return {
            **meta,
            'file': filename,
            'sourceUrl': url,
            'status': 'ok',
            'talkCount': len(normalized['talks']),
            'characterCount': len({cid for t in normalized['talks'] for cid in t['characters']}),
        }
    except Exception as exc:
        return {**meta, 'file': filename, 'sourceUrl': url, 'status': 'error', 'error': str(exc)}
    finally:
        with progress_lock:
            progress_state['active'].discard(label)


def write_summary(done: int, total: int, ok: int, cached: int, failed: int, started_at: float) -> None:
    summary_path = os.getenv('GITHUB_STEP_SUMMARY')
    if not summary_path:
        return
    pct = (done * 100 // total) if total else 100
    elapsed = time.monotonic() - started_at
    remaining = max(total - done, 0)
    lines = [
        '## ストーリーデータ更新',
        '',
        f'- 進捗: **{done}/{total} ({pct}%)**',
        f'- 成功: **{ok}**',
        f'- キャッシュ: **{cached}**',
        f'- 失敗: **{failed}**',
        f'- 未処理: **{remaining}**',
        f'- 並列数: **{WORKERS}**',
        f'- 経過時間: **{elapsed:.0f}秒**',
        f'- 再取得: **{"有効" if FORCE else "無効"}**',
    ]
    Path(summary_path).write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main() -> int:
    started_at = time.monotonic()
    DATA_DIR.mkdir(exist_ok=True)
    STORY_DIR.mkdir(exist_ok=True)

    log('::group::マスターデータ取得')
    events = get_json(EVENTS_URL)
    event_stories = get_json(EVENT_STORIES_URL)
    log(f'マスターデータ: events={len(events)}, eventStories={len(event_stories)}')
    log('::endgroup::')

    event_by_id = {event.get('id'): event for event in events}
    groups = []
    tasks = []

    for story in event_stories:
        event_id = story.get('eventId') or story.get('id')
        event = event_by_id.get(event_id, {})
        group = {
            'id': event_id,
            'name': event.get('name', f'Event {event_id}'),
            'assetbundleName': story.get('assetbundleName') or event.get('assetbundleName', ''),
            'outline': story.get('outline', ''),
            'episodes': [],
        }
        for episode in sorted(story.get('eventStoryEpisodes', []), key=lambda item: item.get('episodeNo', 0)):
            if not episode.get('assetbundleName') or not episode.get('scenarioId'):
                continue
            meta = {
                'episodeId': episode.get('id'),
                'episodeNo': episode.get('episodeNo'),
                'title': episode.get('title', ''),
                'assetbundleName': episode['assetbundleName'],
                'scenarioId': episode['scenarioId'],
            }
            tasks.append((event, story, episode, {'eventId': event_id, 'eventName': group['name'], **meta}))
            group['episodes'].append(meta)
        groups.append(group)

    total = len(tasks)
    with progress_lock:
        progress_state['total'] = total

    log(f'::notice::対象 {total} エピソード / {WORKERS} 並列 / タイムアウト {TIMEOUT}s / 最大試行 {RETRIES}回')
    log(f'CACHE_MODE | existing JSON reuse = {not FORCE}')
    results = []
    done = ok = cached = failed = 0
    write_summary(0, total, 0, 0, 0, started_at)

    stop_heartbeat = threading.Event()
    heartbeat = threading.Thread(target=heartbeat_loop, args=(stop_heartbeat,), daemon=True)
    heartbeat.start()

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = [executor.submit(process, task) for task in tasks]
            for future in concurrent.futures.as_completed(futures):
                result = future.result()
                results.append(result)
                done += 1
                if result['status'] == 'ok':
                    ok += 1
                elif result['status'] == 'cached':
                    cached += 1
                else:
                    failed += 1

                with progress_lock:
                    progress_state.update(done=done, ok=ok, cached=cached, failed=failed)

                pct = (done * 100 // total) if total else 100
                icon = {'ok': 'OK', 'cached': 'CACHE', 'error': 'ERROR'}[result['status']]
                log(
                    f'PROGRESS {done}/{total} ({pct}%) | {icon} | '
                    f'{result["eventName"]} | 第{result["episodeNo"]}話 | {result["scenarioId"]}'
                )
                if result['status'] == 'error':
                    log(f'ERROR_DETAIL | {result.get("error", "unknown error")}')
                write_summary(done, total, ok, cached, failed, started_at)
    finally:
        stop_heartbeat.set()
        heartbeat.join(timeout=1)

    by_episode = {(result['eventId'], result['episodeNo']): result for result in results}
    output_events = []
    for group in groups:
        episodes = []
        for meta in group['episodes']:
            result = by_episode.get((group['id'], meta['episodeNo']))
            if result and result['status'] in ('ok', 'cached'):
                episodes.append(
                    {
                        key: result[key]
                        for key in (
                            'episodeId', 'episodeNo', 'title', 'assetbundleName',
                            'scenarioId', 'file', 'sourceUrl', 'status',
                            'talkCount', 'characterCount'
                        )
                    }
                )
        if episodes:
            group['episodes'] = episodes
            output_events.append(group)

    index = {
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'source': 'Sekai-World/sekai-master-db-diff + storage.sekai.best/sekai-en-assets',
        'totalEvents': len(output_events),
        'totalEpisodes': sum(len(group['episodes']) for group in output_events),
        'totalTalks': sum(episode.get('talkCount', 0) for group in output_events for episode in group['episodes']),
        'failedEpisodes': [result for result in results if result['status'] == 'error'],
        'events': output_events,
    }
    (DATA_DIR / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
    elapsed = time.monotonic() - started_at
    log(f'::notice::完了 success={ok} cached={cached} failed={failed} total={total} elapsed={elapsed:.1f}s')

    if failed:
        log('::warning::一部のエピソード取得に失敗しました。失敗一覧は data/index.json とStep Summaryを確認してください。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
