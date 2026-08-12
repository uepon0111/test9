(() => {
  'use strict';

  const MASTER_BASE = 'https://sekai-world.github.io/sekai-master-db-diff';
  const ASSET_BASE = 'https://storage.sekai.best/sekai-en-assets/event_story';
  const EVENTS_URL = `${MASTER_BASE}/events.json`;
  const EVENT_STORIES_URL = `${MASTER_BASE}/eventStories.json`;

  const state = {
    events: [],
    eventStories: [],
    selectedEvent: null,
    selectedChapter: null,
    selectedEpisode: null,
    currentScenario: null,
    showTechnical: false,
    compact: false,
  };

  const $ = (id) => document.getElementById(id);
  const eventList = $('eventList');
  const eventStatus = $('eventStatus');
  const eventSearch = $('eventSearch');
  const storyView = $('storyView');
  const emptyState = $('emptyState');
  const storyMeta = $('storyMeta');
  const episodeList = $('episodeList');
  const episodeView = $('episodeView');
  const episodeTitle = $('episodeTitle');
  const episodeSub = $('episodeSub');
  const assetLink = $('assetLink');
  const talkList = $('talkList');
  const loading = $('loading');
  const errorBox = $('error');
  const talkCount = $('talkCount');
  const rawDetails = $('rawDetails');
  const rawJson = $('rawJson');
  const footerStatus = $('footerStatus');

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function setVisible(el, visible) { el.classList.toggle('hidden', !visible); }
  function setLoading(on) { setVisible(loading, on); if (on) setVisible(errorBox, false); }
  function setError(message) { errorBox.textContent = message; setVisible(errorBox, true); setLoading(false); }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
    return await res.json();
  }

  function eventDate(ms) {
    if (!Number.isFinite(Number(ms))) return '';
    return new Date(Number(ms)).toLocaleDateString('ja-JP');
  }

  function chapterForEvent(eventId) {
    return state.eventStories.find(x => Number(x.eventId) === Number(eventId)) || null;
  }

  function filterEvents() {
    const q = eventSearch.value.trim().toLowerCase();
    return state.events.filter(ev => {
      if (!q) return true;
      return String(ev.id).includes(q) || String(ev.name || '').toLowerCase().includes(q);
    });
  }

  function renderEventList() {
    const items = filterEvents();
    eventList.innerHTML = '';
    for (const ev of items) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'event-item' + (state.selectedEvent?.id === ev.id ? ' active' : '');
      node.innerHTML = `<div class="event-name">${esc(ev.name || `Event ${ev.id}`)}</div><div class="event-meta">ID ${esc(ev.id)}${ev.startAt ? ` · ${esc(eventDate(ev.startAt))}` : ''}</div>`;
      node.addEventListener('click', () => selectEvent(ev));
      eventList.appendChild(node);
    }
    eventStatus.textContent = `${items.length} / ${state.events.length} 件`;
  }

  function sortEvents(events) {
    return [...events].sort((a,b) => Number(b.startAt || 0) - Number(a.startAt || 0));
  }

  function renderEpisodeList(chapter) {
    episodeList.innerHTML = '';
    const episodes = [...(chapter?.eventStoryEpisodes || [])].sort((a,b) => Number(a.episodeNo || 0) - Number(b.episodeNo || 0));
    for (const ep of episodes) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'ep-btn' + (state.selectedEpisode?.id === ep.id ? ' active' : '');
      node.innerHTML = `<div class="ep-no">第${esc(ep.episodeNo)}話</div><div class="ep-name" title="${esc(ep.title || '')}">${esc(ep.title || `Episode ${ep.episodeNo}`)}</div>`;
      node.addEventListener('click', () => selectEpisode(ep));
      episodeList.appendChild(node);
    }
  }

  function selectEvent(ev) {
    state.selectedEvent = ev;
    state.selectedChapter = chapterForEvent(ev.id);
    state.selectedEpisode = null;
    state.currentScenario = null;
    emptyState.classList.add('hidden');
    storyView.classList.remove('hidden');
    episodeView.classList.add('hidden');
    rawDetails.classList.add('hidden');
    const title = ev.name || `Event ${ev.id}`;
    const chapter = state.selectedChapter;
    storyMeta.innerHTML = `<div class="story-title">${esc(title)}</div><div class="story-info">ID ${esc(ev.id)}${ev.startAt ? ` · 開催開始 ${esc(eventDate(ev.startAt))}` : ''}${chapter?.outline ? ` · ${esc(chapter.outline)}` : ''}</div>`;
    renderEpisodeList(chapter);
    renderEventList();
    history.replaceState(null, '', `?event=${encodeURIComponent(ev.id)}`);
  }

  function normalizeScenario(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('asset の内容がJSONオブジェクトではありません。');

    // sekai.best / master schema normally exposes IScenarioData directly.
    if (Array.isArray(raw.TalkData)) return raw;

    // Be tolerant of wrappers used by some asset converters.
    const candidates = [raw.data, raw.Base, raw.base, raw.m_Script, raw.scenario, raw.value];
    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object' && Array.isArray(candidate.TalkData)) return candidate;
    }

    throw new Error(`TalkData が見つかりません。ルートキー: ${Object.keys(raw).slice(0, 20).join(', ')}`);
  }

  function textFromBody(body) {
    return typeof body === 'string' ? body.replace(/\\n/g, '\n') : String(body ?? '');
  }

  function formatVoiceInfo(talk) {
    const voices = Array.isArray(talk.Voices) ? talk.Voices : [];
    return voices.map(v => `Character2dId=${v.Character2dId}, VoiceId=${v.VoiceId}, Volume=${v.Volume}`).join('\n');
  }

  function renderTalks(scenario) {
    const talks = Array.isArray(scenario.TalkData) ? scenario.TalkData : [];
    talkCount.textContent = `${talks.length} TalkData`;
    talkList.innerHTML = '';

    talks.forEach((talk, idx) => {
      const speaker = talk.WindowDisplayName || (talk.TalkCharacters?.length ? `Character2dId ${talk.TalkCharacters[0].Character2dId}` : '—');
      const hasVoice = Array.isArray(talk.Voices) && talk.Voices.length > 0;
      const node = document.createElement('article');
      node.className = 'talk' + (hasVoice ? ' voice' : '');

      const technical = [
        `TalkTention: ${talk.TalkTention ?? ''}`,
        `LipSync: ${talk.LipSync ?? ''}`,
        `Speed: ${talk.Speed ?? ''}`,
        `FontSize: ${talk.FontSize ?? ''}`,
        `WhenFinishCloseWindow: ${talk.WhenFinishCloseWindow ?? ''}`,
        `RequirePlayEffect: ${talk.RequirePlayEffect ?? ''}`,
        `EffectReferenceIdx: ${talk.EffectReferenceIdx ?? ''}`,
        `RequirePlaySound: ${talk.RequirePlaySound ?? ''}`,
        `SoundReferenceIdx: ${talk.SoundReferenceIdx ?? ''}`,
        `Motions: ${Array.isArray(talk.Motions) ? talk.Motions.length : 0}`,
        `Voices: ${Array.isArray(talk.Voices) ? talk.Voices.length : 0}`,
      ].join('\n');

      node.innerHTML = `
        <div class="talk-head"><span class="speaker">${esc(speaker)}</span><span class="talk-index">#${idx + 1}</span></div>
        <div class="talk-body">${esc(textFromBody(talk.Body))}</div>
        <div class="talk-technical${state.showTechnical ? '' : ' hidden'}">${esc(technical)}${hasVoice ? `\n\nVoiceData:\n${esc(formatVoiceInfo(talk))}` : ''}</div>
      `;
      talkList.appendChild(node);
    });

    rawJson.textContent = JSON.stringify(scenario, null, 2);
  }

  async function fetchAsset(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // Some servers may prepend a BOM.
      return JSON.parse(text.replace(/^\uFEFF/, ''));
    }
  }

  function makeAssetUrl(ev, episode) {
    const chapter = state.selectedChapter;
    if (!chapter) return '';
    const bundle = chapter.assetbundleName || ev.assetbundleName;
    const episodeBundle = episode.assetbundleName;
    return `${ASSET_BASE}/${encodeURIComponent(bundle)}/scenario/${encodeURIComponent(episodeBundle)}.asset`;
  }

  async function selectEpisode(ep) {
    state.selectedEpisode = ep;
    state.currentScenario = null;
    renderEpisodeList(state.selectedChapter);
    episodeView.classList.remove('hidden');
    setLoading(true);
    setVisible(errorBox, false);
    talkList.innerHTML = '';
    rawDetails.classList.add('hidden');

    const url = makeAssetUrl(state.selectedEvent, ep);
    episodeTitle.textContent = ep.title || `第${ep.episodeNo}話`;
    episodeSub.textContent = `episodeId=${ep.id} / episodeNo=${ep.episodeNo}`;
    assetLink.href = url;
    history.replaceState(null, '', `?event=${encodeURIComponent(state.selectedEvent.id)}&episode=${encodeURIComponent(ep.episodeNo)}`);

    try {
      const raw = await fetchAsset(url);
      const scenario = normalizeScenario(raw);
      state.currentScenario = scenario;
      renderTalks(scenario);
      setLoading(false);
      rawDetails.classList.remove('hidden');
      footerStatus.textContent = `TalkData ${scenario.TalkData.length} 件取得`;
    } catch (err) {
      setError(`TalkData の取得に失敗しました。\n\nURL:\n${url}\n\n原因:\n${err.message}\n\n※ このサイトは storage.sekai.best の .asset をブラウザから直接取得します。ブラウザ側でCORSや配信側の仕様が変わった場合は取得できないことがあります。`);
      footerStatus.textContent = '取得エラー';
    }
  }

  function applyQuery() {
    const params = new URLSearchParams(location.search);
    const eventId = params.get('event');
    const episodeNo = params.get('episode');
    if (!eventId) return;
    const ev = state.events.find(x => Number(x.id) === Number(eventId));
    if (!ev) return;
    selectEvent(ev);
    if (episodeNo && state.selectedChapter) {
      const ep = state.selectedChapter.eventStoryEpisodes.find(x => Number(x.episodeNo) === Number(episodeNo));
      if (ep) selectEpisode(ep);
    }
  }

  async function init() {
    setLoading(false);
    try {
      const [events, eventStories] = await Promise.all([getJson(EVENTS_URL), getJson(EVENT_STORIES_URL)]);
      state.events = sortEvents(Array.isArray(events) ? events : []);
      state.eventStories = Array.isArray(eventStories) ? eventStories : [];
      renderEventList();
      footerStatus.textContent = `${state.events.length} イベント`;
      applyQuery();
    } catch (err) {
      eventStatus.textContent = `読み込みに失敗しました: ${err.message}`;
      footerStatus.textContent = 'マスターデータ取得エラー';
    }
  }

  eventSearch.addEventListener('input', renderEventList);
  $('backToEvents').addEventListener('click', () => {
    storyView.classList.add('hidden');
    emptyState.classList.remove('hidden');
    history.replaceState(null, '', location.pathname);
    state.selectedEvent = null;
    renderEventList();
  });
  $('reloadBtn').addEventListener('click', () => location.reload());
  $('showTechnical').addEventListener('change', (e) => {
    state.showTechnical = e.target.checked;
    document.querySelectorAll('.talk-technical').forEach(el => el.classList.toggle('hidden', !state.showTechnical));
  });
  $('compactMode').addEventListener('change', (e) => {
    state.compact = e.target.checked;
    talkList.classList.toggle('compact', state.compact);
  });
  $('copyAllBtn').addEventListener('click', async () => {
    if (!state.currentScenario?.TalkData) return;
    const text = state.currentScenario.TalkData.map((talk, i) => {
      const speaker = talk.WindowDisplayName || '—';
      return `${i + 1}. ${speaker}\n${textFromBody(talk.Body)}`;
    }).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      $('copyAllBtn').textContent = 'コピーしました';
      setTimeout(() => $('copyAllBtn').textContent = '本文をコピー', 1400);
    } catch {
      alert('クリップボードへのコピーに失敗しました。');
    }
  });

  init();
})();
