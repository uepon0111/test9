const DATA_PATH = './data/event_39_01.talk.json';

const els = {
  sourceUrl: document.getElementById('sourceUrl'),
  scenarioId: document.getElementById('scenarioId'),
  talkCount: document.getElementById('talkCount'),
  fetchedAt: document.getElementById('fetchedAt'),
  searchInput: document.getElementById('searchInput'),
  reloadBtn: document.getElementById('reloadBtn'),
  copyAllBtn: document.getElementById('copyAllBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  summary: document.getElementById('summary'),
  talkList: document.getElementById('talkList'),
  template: document.getElementById('talkTemplate'),
};

let state = { payload: null, filtered: [] };

function formatDate(value) {
  if (!value) return '-';
  try {
    const d = new Date(value);
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(d);
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function talkToSearchText(t) {
  return [t.index, t.speaker, t.body, JSON.stringify(t.motions ?? []), JSON.stringify(t.voices ?? [])].join(' ').toLowerCase();
}

function renderSummary(payload, filteredCount) {
  const total = payload.talks.length;
  els.summary.innerHTML = `
    <strong>${filteredCount}</strong> / ${total} 件を表示中。
    話者 <strong>${new Set(payload.talks.map(t => t.speaker || '（無名）')).size}</strong> 種類、
    音声付き <strong>${payload.talks.filter(t => (t.voices || []).length).length}</strong> 件。
  `;
}

function renderTalks() {
  const payload = state.payload;
  if (!payload) return;

  const keyword = els.searchInput.value.trim().toLowerCase();
  const filtered = !keyword
    ? payload.talks
    : payload.talks.filter(t => talkToSearchText(t).includes(keyword));

  state.filtered = filtered;
  els.talkList.innerHTML = '';
  if (!filtered.length) {
    els.talkList.innerHTML = '<div class="empty">該当するトークデータがありません。</div>';
    renderSummary(payload, 0);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const talk of filtered) {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector('.talk-card');
    const head = node.querySelector('.talk-head');
    const bodyWrap = node.querySelector('.talk-body');
    const bodyEl = node.querySelector('.body');
    const detailsEl = node.querySelector('.details');
    const indexEl = node.querySelector('.talk-index');
    const speakerEl = node.querySelector('.speaker');
    const previewEl = node.querySelector('.body-preview');
    const copyBtn = node.querySelector('.copy-line');

    indexEl.textContent = `#${talk.index}`;
    speakerEl.textContent = talk.speaker || '（無名）';
    bodyEl.textContent = talk.body || '';
    previewEl.textContent = (talk.body || '').replace(/\s+/g, ' ').slice(0, 120) || '（本文なし）';

    const details = [
      ['ボイス', (talk.voices || []).map(v => `${v.Character2dId ?? ''} / ${v.VoiceId ?? ''}`).join('<br>') || 'なし'],
      ['モーション', (talk.motions || []).map(m => `${m.Character2dId ?? ''} / ${m.MotionName ?? ''} / ${m.FacialName ?? ''}`).join('<br>') || 'なし'],
      ['LipSync', talk.lip_sync ?? '-'],
      ['Speed', talk.speed ?? '-'],
      ['FontSize', talk.font_size ?? '-'],
      ['Tention', talk.talk_tention ?? '-'],
    ];
    detailsEl.innerHTML = details.map(([label, value]) => `
      <div class="detail-row">
        <div class="label">${label}</div>
        <div>${value}</div>
      </div>
    `).join('');

    head.addEventListener('click', () => bodyWrap.classList.toggle('hidden'));
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(talk.body || '');
      copyBtn.textContent = 'コピーしました';
      setTimeout(() => copyBtn.textContent = 'この本文をコピー', 1200);
    });

    fragment.appendChild(node);
  }
  els.talkList.appendChild(fragment);
  renderSummary(payload, filtered.length);
}

function updateHeader(payload) {
  els.sourceUrl.textContent = payload.source_url || DATA_PATH;
  els.scenarioId.textContent = payload.scenario_id || payload.name || '-';
  els.talkCount.textContent = `${payload.talks.length}`;
  els.fetchedAt.textContent = formatDate(payload.fetched_at);
}

async function loadData() {
  const res = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`読み込み失敗: ${res.status}`);
  const payload = await res.json();
  state.payload = payload;
  updateHeader(payload);
  renderTalks();
}

async function copyAll() {
  if (!state.payload) return;
  const text = state.filtered.map(t => `#${t.index} ${t.speaker || '（無名）'}\n${t.body || ''}`).join('\n\n');
  await navigator.clipboard.writeText(text);
  els.copyAllBtn.textContent = 'コピーしました';
  setTimeout(() => els.copyAllBtn.textContent = '本文をまとめてコピー', 1200);
}

function downloadJson() {
  if (!state.payload) return;
  const blob = new Blob([JSON.stringify(state.payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.payload.scenario_id || 'talk'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

els.searchInput.addEventListener('input', renderTalks);
els.reloadBtn.addEventListener('click', loadData);
els.copyAllBtn.addEventListener('click', copyAll);
els.downloadBtn.addEventListener('click', downloadJson);

loadData().catch(err => {
  els.summary.innerHTML = `<strong>読み込みに失敗しました。</strong> ${escapeHtml(err.message)}<br>GitHub Actionsで data/event_39_01.talk.json が生成されているか確認してください。`;
  els.talkList.innerHTML = '<div class="empty">データがありません。</div>';
});
