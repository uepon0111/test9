const $ = (s) => document.querySelector(s);
let story = null;
let talks = [];

function initials(name){
  const chars = [...name].filter(c => /[\p{L}\p{N}]/u.test(c));
  return (chars.slice(0,2).join('') || '?').toUpperCase();
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function highlight(text, query){
  const safe = escapeHtml(text);
  if (!query) return safe;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi');
  return safe.replace(re,'<mark class="highlight">$1</mark>');
}
function renderCharacters(){
  $('#characters').innerHTML = story.characters.map(c => `
    <div class="character" title="Character ID: ${c.id}">
      <div class="avatar">${escapeHtml(initials(c.name))}</div>
      <div><div class="name">${escapeHtml(c.name)}</div><div class="costume">#${c.id} · ${escapeHtml(c.costume || 'no costume metadata')}</div></div>
    </div>`).join('');
  const select = $('#speaker-filter');
  [...new Set(story.characters.map(c=>c.name).filter(Boolean))].sort().forEach(name=>{
    const o=document.createElement('option'); o.value=name; o.textContent=name; select.appendChild(o);
  });
}
function apply(){
  const q = $('#search').value.trim();
  const speaker = $('#speaker-filter').value;
  talks = story.talks.filter(t => (!speaker || t.name===speaker) && (!q || `${t.name} ${t.body}`.toLowerCase().includes(q.toLowerCase())));
  $('#count-label').textContent = `${talks.length} / ${story.talks.length} lines`;
  $('#filter-label').textContent = q || speaker ? 'filtered' : '';
  $('#talks').innerHTML = talks.length ? talks.map(t => `
    <article class="talk" id="line-${t.index}">
      <div class="num">${t.index}</div>
      <div><div class="speaker">${escapeHtml(t.name)}</div>
      <div class="body">${highlight(t.body,q)}</div>
      ${t.voiceIds.length || t.motionNames.length ? `<div class="badges">${t.voiceIds.map(v=>`<span class="badge">voice: ${escapeHtml(v)}</span>`).join('')}${t.motionNames.map(m=>`<span class="badge">motion: ${escapeHtml(m)}</span>`).join('')}</div>` : ''}</div>
    </article>`).join('') : '<div class="empty">No matching lines.</div>';
}
async function main(){
  try{
    const res=await fetch('data/story.json',{cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    story=await res.json();
    $('#story-title').textContent=story.scenarioId;
    $('#story-meta').textContent=`${story.meta.talkCount} lines · ${story.characters.length} characters · background ${story.background || '—'} · BGM ${story.bgm || '—'}`;
    renderCharacters(); apply();
    $('#search').addEventListener('input',apply); $('#speaker-filter').addEventListener('change',apply);
    $('#reset').addEventListener('click',()=>{ $('#search').value=''; $('#speaker-filter').value=''; apply(); });
    const dark=localStorage.getItem('theme')==='dark'; document.documentElement.classList.toggle('dark',dark);
    $('#theme-toggle').addEventListener('click',()=>{ const on=document.documentElement.classList.toggle('dark'); localStorage.setItem('theme',on?'dark':'light'); });
  }catch(err){
    $('#story-title').textContent='Failed to load story'; $('#story-meta').textContent=err.message;
    $('#talks').innerHTML='<div class="empty">The generated story data is missing. Run the build script or GitHub Actions workflow.</div>';
  }
}
main();
