(() => {
  'use strict';

  const DATA_ROOT = './data';
  const state = {
    index: null,
    selectedEvent: null,
    selectedEpisode: null,
    story: null,
    events: [],
    filteredEvents: [],
  };

  const $ = (selector) => document.querySelector(selector);
  const eventListEl = $('#eventList');
  const episodeListEl = $('#episodeList');
  const dialogueListEl = $('#dialogueList');
  const speakerFilterEl = $('#speakerFilter');
  const talkSearchEl = $('#talkSearch');
  const eventSearchEl = $('#eventSearch');
  const toastEl = $('#toast');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;', "'":'&#39;' })[c]);
  }

  function stripOuterBody(value) {
    const text = String(value ?? '');
    if (text.length >= 2 && text.startsWith('<') && text.endsWith('>')) return text.slice(1, -1);
    return text;
  }

  function notify(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  async function fetchJson(url) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.json();
  }

  function normalizeIndex(raw) {
    const events = Array.isArray(raw.events) ? raw.events : [];
    return {
      generatedAt: raw.generatedAt || '',
      source: raw.source || '',
      totalEvents: raw.totalEvents || events.length,
      totalEpisodes: raw.totalEpisodes || events.reduce((sum, e) => sum + (e.episodes?.length || 0), 0),
      events: events.map(event => ({
        ...event,
        episodes: Array.isArray(event.episodes) ? event.episodes : []
      }))
    };
  }

  function renderEventList() {
    const query = eventSearchEl.value.trim().toLowerCase();
    state.filteredEvents = state.events.filter(event => {
      const haystack = `${event.id} ${event.name || ''} ${event.assetbundleName || ''}`.toLowerCase();
      return haystack.includes(query);
    });

    if (!state.filteredEvents.length) {
      eventListEl.innerHTML = '<div class="empty">該当するイベントがありません。</div>';
      return;
    }

    eventListEl.innerHTML = state.filteredEvents.map(event => `
      <button type="button" class="event-item ${state.selectedEvent?.id === event.id ? 'active' : ''}" data-event-id="${event.id}">
        <div class="event-item-title">${escapeHtml(event.name || `Event ${event.id}`)}</div>
        <div class="event-item-meta">EVENT ${escapeHtml(String(event.id))} · ${event.episodes.length}話</div>
      </button>
    `).join('');
  }

  function renderEpisodes() {
    const episodes = state.selectedEvent?.episodes || [];
    episodeListEl.innerHTML = episodes.map(ep => `
      <button type="button" class="episode-btn ${state.selectedEpisode?.episodeNo === ep.episodeNo ? 'active' : ''}" data-episode-no="${ep.episodeNo}">
        第${ep.episodeNo}話
      </button>
    `).join('');
  }

  function buildSpeakerOptions(talks) {
    const speakers = new Map();
    (talks || []).forEach(talk => {
      const name = talk.speaker || talk.WindowDisplayName || '';
      if (!name) return;
      const ids = (talk.TalkCharacters || []).map(c => c.Character2dId).filter(v => v !== undefined);
      if (!speakers.has(name)) speakers.set(name, ids[0]);
    });
    speakerFilterEl.innerHTML = '<option value="">すべて</option>' + [...speakers.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([name, id]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}${id != null ? ` (#${id})` : ''}</option>`).join('');
  }

  function renderStory() {
    const story = state.story;
    if (!story) return;
    $('#storyEventId').textContent = story.scenarioId || state.selectedEpisode?.scenarioId || 'SCENARIO';
    $('#storyTitle').textContent = state.selectedEpisode?.title || story.scenarioId || 'ストーリー';
    $('#storyOutline').textContent = state.selectedEvent?.outline || '';
    $('#storyMeta').innerHTML = [
      state.selectedEvent?.assetbundleName && `Asset ${state.selectedEvent.assetbundleName}`,
      state.selectedEpisode?.assetbundleName && `Bundle ${state.selectedEpisode.assetbundleName}`,
      `${story.talks.length} トーク`,
      `${story.appearCharacters?.length || 0} 登場キャラクター`
    ].filter(Boolean).map(x => `<span class="meta-chip">${escapeHtml(x)}</span>`).join('');

    buildSpeakerOptions(story.talks);
    renderDialogue();
  }

  function renderDialogue() {
    const talks = state.story?.talks || [];
    const query = talkSearchEl.value.trim().toLowerCase();
    const speaker = speakerFilterEl.value;
    const filtered = talks.filter(talk => {
      const body = String(talk.body || '').toLowerCase();
      const name = String(talk.speaker || '').toLowerCase();
      return (!query || body.includes(query) || name.includes(query)) && (!speaker || talk.speaker === speaker);
    });
    $('#talkCount').textContent = `${filtered.length} / ${talks.length} 件`;

    if (!filtered.length) {
      dialogueListEl.innerHTML = '<div class="empty">条件に一致する会話がありません。</div>';
      return;
    }

    dialogueListEl.innerHTML = filtered.map((talk, filteredIndex) => {
      const charIds = (talk.characters || []).map(c => c.Character2dId).filter(v => v !== undefined);
      const motions = (talk.motions || []).map(m => `${m.Character2dId ?? ''}: ${m.MotionName ?? ''}${m.FacialName ? ` / ${m.FacialName}` : ''}`).join('\n');
      const voices = (talk.voices || []).map(v => `${v.Character2dId ?? ''}: ${v.VoiceId ?? ''}`).join('\n');
      return `
        <article class="dialogue-card">
          <div class="dialogue-main">
            <div class="dialogue-speaker">
              <span class="speaker-dot" aria-hidden="true"></span>
              <span class="speaker-name">${escapeHtml(talk.speaker || '—')}</span>
              ${charIds.length ? `<span class="speaker-id">#${escapeHtml(charIds.join(', #'))}</span>` : ''}
              <span class="dialogue-index">#${escapeHtml(String(talk.index ?? filteredIndex + 1))}</span>
            </div>
            <p class="dialogue-body">${escapeHtml(talk.body || '')}</p>
          </div>
          <details class="dialogue-details">
            <summary>詳細データ</summary>
            <div class="detail-grid">
              <div class="detail-row"><span class="detail-label">Characters</span><span class="detail-value">${escapeHtml(charIds.join(', ')) || '—'}</span></div>
              <div class="detail-row"><span class="detail-label">Voice ID</span><span class="detail-value">${escapeHtml(voices) || '—'}</span></div>
              <div class="detail-row"><span class="detail-label">Motions</span><span class="detail-value">${escapeHtml(motions) || '—'}</span></div>
              <div class="detail-row"><span class="detail-label">Tension / LipSync / Speed</span><span class="detail-value">${escapeHtml(`${talk.talkTention ?? 0} / ${talk.lipSync ?? 0} / ${talk.speed ?? 0}`)}</span></div>
            </div>
          </details>
        </article>`;
    }).join('');
  }

  async function selectEvent(eventId, episodeNo) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;
    state.selectedEvent = event;
    state.selectedEpisode = event.episodes.find(ep => ep.episodeNo === episodeNo) || event.episodes[0] || null;
    state.story = null;
    renderEventList();
    renderEpisodes();
    $('#reader').classList.remove('hidden');
    $('#loadingState').classList.remove('hidden');
    $('#errorState').classList.add('hidden');
    $('#dialogueList').innerHTML = '';
    try {
      if (!state.selectedEpisode) throw new Error('このイベントにエピソードがありません。');
      const file = state.selectedEpisode.file || `${state.selectedEpisode.scenarioId}.json`;
      state.story = await fetchJson(`${DATA_ROOT}/stories/${encodeURIComponent(file)}`);
      $('#loadingState').classList.add('hidden');
      renderStory();
      const url = new URL(location.href);
      url.searchParams.set('event', String(eventId));
      url.searchParams.set('episode', String(state.selectedEpisode.episodeNo));
      history.replaceState(null, '', url.toString());
    } catch (error) {
      $('#loadingState').classList.add('hidden');
      $('#errorState').classList.remove('hidden');
      $('#errorMessage').textContent = error.message || String(error);
    }
  }

  function getVisibleText() {
    const talks = state.story?.talks || [];
    const query = talkSearchEl.value.trim().toLowerCase();
    const speaker = speakerFilterEl.value;
    return talks.filter(talk => {
      const body = String(talk.body || '').toLowerCase();
      const name = String(talk.speaker || '').toLowerCase();
      return (!query || body.includes(query) || name.includes(query)) && (!speaker || talk.speaker === speaker);
    }).map(talk => `${talk.speaker || '—'}\n${talk.body || ''}`).join('\n\n');
  }

  async function copyVisible() {
    const text = getVisibleText();
    if (!text) return notify('コピーする会話がありません。');
    try { await navigator.clipboard.writeText(text); notify('表示中の会話をコピーしました。'); }
    catch { notify('クリップボードへのコピーに失敗しました。'); }
  }

  function downloadTxt() {
    const text = getVisibleText();
    if (!text) return notify('保存する会話がありません。');
    const fileBase = state.selectedEpisode?.scenarioId || 'story';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function loadIndex() {
    $('#reader').classList.add('hidden');
    $('#errorState').classList.add('hidden');
    $('#loadingState').classList.remove('hidden');
    try {
      state.index = normalizeIndex(await fetchJson(`${DATA_ROOT}/index.json`));
      state.events = state.index.events;
      renderEventList();
      const params = new URLSearchParams(location.search);
      const eventId = Number(params.get('event'));
      const episodeNo = Number(params.get('episode'));
      const initialEvent = state.events.find(e => e.id === eventId) || state.events[0];
      $('#loadingState').classList.add('hidden');
      if (initialEvent) await selectEvent(initialEvent.id, episodeNo || initialEvent.episodes[0]?.episodeNo);
      else {
        $('#reader').classList.remove('hidden');
        dialogueListEl.innerHTML = '<div class="empty">ストーリーデータがありません。</div>';
      }
    } catch (error) {
      $('#loadingState').classList.add('hidden');
      $('#errorState').classList.remove('hidden');
      $('#errorMessage').textContent = error.message || String(error);
    }
  }

  eventListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-event-id]');
    if (button) selectEvent(Number(button.dataset.eventId));
  });
  episodeListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-episode-no]');
    if (button && state.selectedEvent) selectEvent(state.selectedEvent.id, Number(button.dataset.episodeNo));
  });
  eventSearchEl.addEventListener('input', renderEventList);
  talkSearchEl.addEventListener('input', renderDialogue);
  speakerFilterEl.addEventListener('change', renderDialogue);
  $('#copyVisibleBtn').addEventListener('click', copyVisible);
  $('#downloadTxtBtn').addEventListener('click', downloadTxt);
  $('#refreshDataBtn').addEventListener('click', loadIndex);
  $('#retryBtn').addEventListener('click', loadIndex);
  window.addEventListener('popstate', loadIndex);

  loadIndex();
})();
