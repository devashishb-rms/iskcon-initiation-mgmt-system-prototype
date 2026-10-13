/* Core: helpers, language, sign-in, shells, and the two phone screens (candidate and mentor). */
const $app = document.getElementById('app');
let ME = null, META = null, LANG = (function () { try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; } })();
const UI = { tab: 'review', filter: 'all', ruleTab: null }; // small view state that survives re-renders

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => { if (!iso) return ''; const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

// Draft Bengali labels for the candidate and mentor screens. The temple should review these before use.
const BN = {
  'Met': 'পূর্ণ হয়েছে', 'Needs confirming': 'নিশ্চিত করা বাকি', 'Not met': 'পূর্ণ হয়নি', 'Later': 'পরে', 'Exception recorded': 'ব্যতিক্রম নথিভুক্ত',
  'My path': 'আমার পথ', 'Documents': 'নথি', 'Message mentor': 'মেন্টরকে বার্তা', 'Your next step': 'আপনার পরবর্তী ধাপ',
  'Upload certificate': 'সার্টিফিকেট আপলোড করুন', 'What is done and what is missing': 'কী সম্পন্ন এবং কী বাকি',
  'Your path to first initiation': 'প্রথম দীক্ষার পথে আপনার যাত্রা', 'Hare Krishna': 'হরে কৃষ্ণ',
  'Aspiring': 'আগ্রহী', 'Shelter': 'আশ্রয়', 'Preparing': 'প্রস্তুতি', 'Applied': 'আবেদন', 'Recommended': 'সুপারিশকৃত', 'Initiated': 'দীক্ষিত',
  'Stage': 'ধাপ', 'of': 'এর', 'My candidates': 'আমার প্রার্থীরা', 'Candidates': 'প্রার্থী', 'Notes': 'নোট', 'Help': 'সাহায্য',
  'Switch person': 'অন্য ব্যক্তি', 'Send': 'পাঠান', 'Upload': 'আপলোড', 'On file': 'জমা আছে', 'Missing': 'জমা নেই',
  'Add a monthly note': 'মাসিক নোট যোগ করুন', 'Write a message': 'বার্তা লিখুন',
  'Needs confirming means nobody has checked it yet. It is not a fail.': '"নিশ্চিত করা বাকি" মানে এখনও কেউ যাচাই করেননি। এটি অপূর্ণ নয়।',
  'All': 'সব', 'Waiting on me': 'আমার অপেক্ষায়', 'Ready to submit': 'জমা দেওয়ার জন্য প্রস্তুত',
  'Sent back by the temple president': 'মন্দির সভাপতি ফেরত পাঠিয়েছেন',
  'Draft translation. The temple should review it.': 'অনুবাদ খসড়া। মন্দির যাচাই করবে।',
};
const t = (s) => (LANG === 'bn' && BN[s]) || s;
const STATUS_WORD = { met: 'Met', unknown: 'Needs confirming', not_met: 'Not met', later: 'Later', exception: 'Exception recorded' };
const chip = (st, text) => `<span class="chip ${st}"><i></i>${esc(text || t(STATUS_WORD[st]))}</span>`;
const dot = (st) => `<span class="dot ${st}"></span>`;

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) { const e = new Error((data && data.error) || 'Something went wrong'); e.status = r.status; throw e; }
  return data;
}
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body || {}) });
function toast(msg, err) {
  const box = document.getElementById('toast');
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  box.appendChild(d); setTimeout(() => d.remove(), err ? 7000 : 3500);
}

const ROLE_NAME = { candidate: 'Candidate', mentor: 'Mentor', president: 'Temple president', committee: 'Committee member', admin: 'Administrator' };
const ROLE_HOME = { candidate: '#/path', mentor: '#/candidates', president: '#/queue', committee: '#/candidates', admin: '#/rulesets' };
const MOBILE = (r) => r === 'candidate' || r === 'mentor';

// ---------- routing ----------
function route() { const h = (location.hash || '').replace(/^#\/?/, ''); const [name, ...rest] = h.split('/'); return { name: name || '', args: rest }; }
async function render() {
  document.documentElement.lang = LANG === 'bn' ? 'bn' : 'en';
  try {
    if (!META) META = await api('/api/meta');
    if (!ME) ME = await api('/api/me');
    if (!ME) return renderLogin();
    const r = route();
    const R = (window.Screens || {});
    const screens = {
      path: renderPath, documents: renderCandDocs, messages: renderMessages,
      candidates: MOBILE(ME.role) ? renderMentorList : R.candidates, notes: renderMentorNotes, help: renderHelp,
      candidate: R.candidateFile, queue: R.queue, rulesets: R.rulesets, ceremonies: R.ceremonies, register: R.register,
    };
    const fn = screens[r.name];
    if (!fn) { location.hash = ROLE_HOME[ME.role]; return; }
    await fn(r.args);
  } catch (e) {
    if (e.status === 401) { ME = null; return renderLogin(); }
    $app.innerHTML = `<div class="login"><div class="note-box bad">${esc(e.message)}</div><a href="${ROLE_HOME[ME ? ME.role : 'candidate']}">Go back</a></div>`;
  }
}
window.addEventListener('hashchange', () => { UI.tab = 'review'; render(); });

// ---------- sign-in (prototype: choose a person) ----------
async function renderLogin() {
  const users = await api('/api/users');
  const blurb = { candidate: 'Sees only their own path', mentor: 'Sees only assigned candidates', president: 'Reviews and recommends', committee: 'Keeps the candidate files', admin: 'Rule sets, ceremonies, register' };
  $app.innerHTML = `<div class="login">
    <div><div class="brand" style="padding:0;color:var(--ink)"><b></b>ISKCON Newtown, Kolkata</div>
    <h1 style="font-size:28px;margin-top:8px">Initiation management</h1>
    <p class="lead">Prototype. Every person, date and note here is invented sample data. Choose who to sign in as; a real system would send a one-time code instead.</p></div>
    <div class="grid">${users.map((u) => `<button class="who-btn" data-act="login" data-id="${u.id}"><b>${esc(u.name)}</b><span class="sub">${esc(ROLE_NAME[u.role])} · ${esc(blurb[u.role])}</span></button>`).join('')}</div>
  </div>`;
}

// ---------- shells ----------
const NAV = {
  president: [['queue', 'Review queue'], ['candidates', 'Candidates'], ['ceremonies', 'Ceremonies'], ['register', 'Register']],
  committee: [['candidates', 'Candidates'], ['queue', 'Review queue'], ['register', 'Register']],
  admin: [['candidates', 'Candidates'], ['ceremonies', 'Ceremonies'], ['register', 'Register'], ['rulesets', 'Rule sets']],
};
function shell(active, inner) {
  const items = NAV[ME.role] || [];
  $app.innerHTML = `<div class="shell"><nav class="side" aria-label="Main"><div class="brand"><b></b>ISKCON Newtown</div>
    ${items.map(([k, l]) => `<a class="nav ${active === k ? 'on' : ''}" href="#/${k}">${l}</a>`).join('')}
    <div class="who">Signed in as<br><b>${esc(ME.name)}</b><br>Sample data<br><button class="btn small" data-act="logout">Switch person</button>
    ${ME.role === 'admin' ? '<br><button class="btn small" data-act="reset" style="margin-top:6px">Reset sample data</button>' : ''}</div></nav>
    <main class="main">${inner}</main></div>`;
}
function phone(active, inner, tabs) {
  const lang = `<div class="lang" role="group" aria-label="Language"><button class="${LANG === 'en' ? 'on' : ''}" data-act="lang" data-lang="en">EN</button><button class="${LANG === 'bn' ? 'on' : ''}" data-act="lang" data-lang="bn">বাংলা</button></div>`;
  $app.innerHTML = `<div class="phonewrap"><div class="phone">
    <div class="top"><div class="brand" style="padding:0;color:var(--ink);font-size:14px"><b></b>ISKCON Newtown</div>${lang}</div>
    <div class="body">${inner}
      <div class="sub" style="margin-top:auto;padding-top:8px">${esc(ME.name)} · sample data · <button class="link" data-act="logout">${t('Switch person')}</button>${LANG === 'bn' ? '<br>' + t('Draft translation. The temple should review it.') : ''}</div></div>
    <nav class="tabbar" aria-label="Main">${tabs.map(([k, l]) => `<a class="${active === k ? 'on' : ''}" href="#/${k}">${t(l)}</a>`).join('')}</nav></div></div>`;
}
const CAND_TABS = [['path', 'My path'], ['documents', 'Documents'], ['messages', 'Message mentor']];
const MENTOR_TABS = [['candidates', 'Candidates'], ['notes', 'Notes'], ['help', 'Help']];

function countsText(c) {
  const n = c.counts; const parts = [];
  const met = n.met + n.exception;
  if (met) parts.push(`${met} ${LANG === 'bn' ? t('Met') : 'met'}`);
  if (n.not_met) parts.push(`${n.not_met} ${LANG === 'bn' ? t('Not met') : 'not met'}`);
  if (n.unknown) parts.push(`${n.unknown} ${LANG === 'bn' ? t('Needs confirming') : 'needs confirming'}`);
  if (n.later) parts.push(`${n.later} ${LANG === 'bn' ? t('Later') : 'later'}`);
  return parts.join(' · ');
}

// ---------- candidate screens ----------
function stageBar(stage) {
  const names = META.stages; const idx = names.indexOf(stage);
  const bars = names.map((_, i) => `<i class="${i < idx || stage === 'Initiated' ? 'done' : i === idx ? 'now' : ''}"></i>`).join('');
  const labels = names.map((n, i) => `<span class="${i === idx ? 'now' : ''}">${n === 'Recommended' ? 'Recom&shy;mended' : esc(t(n))}</span>`).join('');
  return `<div class="stagebar">${bars}</div><div class="stagelabels">${labels}</div>`;
}
async function myData() { return api('/api/candidates/' + ME.candidate_id); }

async function renderPath() {
  if (ME.role !== 'candidate') { location.hash = ROLE_HOME[ME.role]; return; }
  const d = await myData(); const c = d.candidate;
  const idx = META.stages.indexOf(c.stage) + 1;
  const first = c.name.split(' ')[0];
  const sb = d.send_back ? `<div class="note-box warn"><b>${t('Sent back by the temple president')}</b><br>${esc(d.send_back.reason)}</div>` : '';
  const next = d.next;
  const act = next.key === 'upload_certificate' ? `<button class="btn" data-act="pick-file" data-type="course_certificate">${t('Upload certificate')}</button>` : '';
  phone('path', `
    <div><h1 style="font-size:22px">${t('Hare Krishna')}, ${esc(first)}</h1><div class="muted" style="font-size:14px">${t('Your path to first initiation')}</div></div>
    <div class="card pad" style="display:flex;flex-direction:column;gap:12px">
      <div class="row" style="justify-content:space-between"><b>${t('Stage')} ${idx} ${t('of')} 6: ${esc(t(c.stage))}</b><span class="sub">${esc(c.guru_name)}</span></div>${stageBar(c.stage)}</div>
    ${sb}
    <div class="next"><div class="k">${t('Your next step')}</div><div class="t">${esc(next.text)}</div>${next.why ? `<div style="font-size:14px">${esc(next.why)}</div>` : ''}${act}</div>
    <div style="display:flex;flex-direction:column;gap:8px"><b>${t('What is done and what is missing')}</b>
      ${d.check.items.map((i) => `<div class="item">${dot(i.status)}<div class="m"><div style="font-size:14px;font-weight:500">${esc(i.label)}</div><div class="sub">${esc(i.detail)}</div></div>${chip(i.status)}</div>`).join('')}
      <div class="sub">${t('Needs confirming means nobody has checked it yet. It is not a fail.')}</div></div>`, CAND_TABS);
}
async function renderCandDocs() {
  const d = await myData();
  phone('documents', `<h1 style="font-size:22px">${t('Documents')}</h1>
    ${d.docRows.map((r) => `<div class="item"><div class="m"><div style="font-weight:500">${esc(r.label)}</div><div class="sub">${r.present ? esc(r.doc.filename) + ' · ' + fmt(r.doc.uploaded_at) : ''}</div></div>
      ${chip(r.present ? 'met' : 'not_met', t(r.present ? 'On file' : 'Missing'))}
      ${r.present ? `<a class="btn small" href="/api/documents/${r.doc.id}" target="_blank">View</a>` : ''}
      <button class="btn small" data-act="pick-file" data-type="${r.type}">${t('Upload')}</button></div>`).join('')}
    <div class="sub">PDF or a photo from your phone camera. Only you, your mentor and the temple committee can open these.</div>`, CAND_TABS);
}
async function renderMessages() {
  const d = await myData();
  const msgs = d.notes.slice().reverse();
  phone('messages', `<h1 style="font-size:22px">${t('Message mentor')}</h1>
    <div class="sub">Your mentor: ${esc(d.candidate.mentor_name)}</div>
    ${msgs.length ? msgs.map((m) => `<div class="msg ${m.author === ME.name ? 'mine' : ''}"><div class="sub">${esc(m.author)} · ${fmt(m.created_at)}</div>${esc(m.body)}</div>`).join('') : '<div class="muted">No messages yet.</div>'}
    <label class="field">${t('Write a message')}<textarea id="msg-body"></textarea></label>
    <button class="btn primary" data-act="send-msg" data-id="${d.candidate.id}">${t('Send')}</button>`, CAND_TABS);
}

// ---------- mentor screens ----------
async function renderMentorList() {
  const rows = await api('/api/candidates');
  const waiting = (c) => c.status === 'active' && (c.stage === 'Shelter' || (c.stage === 'Preparing' && c.counts.unknown > 0));
  const ready = (c) => c.status === 'active' && c.stage === 'Preparing' && c.canApprove;
  const f = UI.filter;
  const list = rows.filter((c) => f === 'all' || (f === 'waiting' && waiting(c)) || (f === 'ready' && ready(c)));
  const chipBtn = (k, label, n) => `<button class="btn small" style="border-radius:22px;${f === k ? 'background:var(--teal);color:#fff' : ''}" data-act="filter" data-f="${k}">${t(label)}${n === undefined ? '' : ' ' + n}</button>`;
  phone('candidates', `<div><h1 style="font-size:22px">${t('My candidates')}</h1><div class="muted" style="font-size:14px">${rows.length} people you mentor. You confirm what you have seen; the president and the guru decide.</div></div>
    <div class="row">${chipBtn('all', 'All', rows.length)}${chipBtn('waiting', 'Waiting on me', rows.filter(waiting).length)}${chipBtn('ready', 'Ready to submit', rows.filter(ready).length)}</div>
    <div style="display:flex;flex-direction:column;gap:8px">${list.map((c) => `<a class="cardlink" href="#/candidate/${c.id}"><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(c.name)}</b><span class="sub">${esc(t(c.stage))}${c.status === 'declined' ? ' · declined' : ''}</span></div>
      <div class="row" style="flex-wrap:nowrap;gap:8px">${dot(c.worst)}<span style="font-size:13px">${esc(c.next_due)}</span></div><div class="sub">${esc(countsText(c))}</div></div>›</a>`).join('') || '<div class="muted">Nobody matches this filter.</div>'}</div>
    <a class="btn" href="#/notes">${t('Add a monthly note')}</a>`, MENTOR_TABS);
}
async function renderMentorNotes() {
  const [feed, cands] = await Promise.all([api('/api/notes'), api('/api/candidates')]);
  phone('notes', `<h1 style="font-size:22px">${t('Notes')}</h1>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px"><b>${t('Add a monthly note')}</b>
      <label class="field">Candidate<select id="note-cand">${cands.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field">Note<textarea id="note-body"></textarea></label>
      <button class="btn primary" data-act="add-note">${t('Send')}</button></div>
    ${feed.map((n) => `<div class="msg"><div class="sub">${esc(n.candidate_name)} · ${esc(n.kind)} · ${esc(n.author)} · ${fmt(n.created_at)}</div>${esc(n.body)}</div>`).join('')}`, MENTOR_TABS);
}
async function renderHelp() {
  phone('help', `<h1 style="font-size:22px">${t('Help')}</h1>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px">
      <div>${chip('met')} The rule is satisfied and the source is recorded.</div>
      <div>${chip('unknown')} Nobody has recorded this yet. It is not a failure.</div>
      <div>${chip('not_met')} The rule is not satisfied, or a document is missing.</div>
      <div>${chip('later')} Opens at a later stage.</div>
      <div>${chip('exception')} The committee recorded a written reason to go ahead.</div></div>
    <div class="note-box info">You confirm what you have seen. The temple president recommends, and the guru decides. This system never approves anyone.</div>`, MENTOR_TABS);
}

// ---------- delegated actions ----------
const ACT = {
  async login(b) { ME = await post('/api/login', { user_id: Number(b.dataset.id) }); location.hash = ROLE_HOME[ME.role]; render(); },
  async logout() { await post('/api/logout'); ME = null; location.hash = ''; render(); },
  async reset() { if (confirm('Reload the fabricated sample data? Your changes will be lost.')) { await post('/api/reset-sample-data'); toast('Sample data reloaded'); render(); } },
  lang(b) { LANG = b.dataset.lang; try { localStorage.setItem('lang', LANG); } catch {} render(); },
  filter(b) { UI.filter = b.dataset.f; render(); },
  'pick-file'(b) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/pdf,image/*'; i.onchange = () => uploadFile(i.files[0], b.dataset.type, b.dataset.cid || ME.candidate_id); i.click(); },
  async 'send-msg'(b) { const body = document.getElementById('msg-body').value; await post(`/api/candidates/${b.dataset.id}/notes`, { body }); toast('Message sent'); render(); },
  async 'add-note'() { const id = document.getElementById('note-cand').value; await post(`/api/candidates/${id}/notes`, { kind: 'monthly', body: document.getElementById('note-body').value }); toast('Note added'); render(); },
};
async function uploadFile(file, type, cid) {
  if (!file) return;
  try {
    const r = await fetch(`/api/candidates/${cid}/documents?type=${encodeURIComponent(type)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
    const data = await r.json(); if (!r.ok) throw new Error(data.error);
    toast('Uploaded ' + file.name); render();
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const fn = ACT[b.dataset.act] || (window.ACT2 || {})[b.dataset.act]; if (!fn) return;
  e.preventDefault();
  try { await fn(b, e); } catch (err) { toast(err.message, true); }
});
document.addEventListener('change', (e) => { const f = (window.ACT2 || {})._change; if (f) f(e); });
document.addEventListener('input', (e) => { const f = (window.ACT2 || {})._input; if (f) f(e); });

render();
