/* Desktop screens (president, committee, administrator) and the shared candidate file view. */
const $ = (id) => document.getElementById(id);
const val = (id) => { const e = $(id); return e ? e.value : ''; };
const Screens = {};
const ACT2 = {};
window.Screens = Screens; window.ACT2 = ACT2;

const checklistText = (c) => {
  const n = c.counts; const met = n.met + n.exception;
  if (!n.not_met && !n.unknown) return `${c.summary.met} of ${c.summary.total} met`;
  const p = [`${met} met`]; if (n.not_met) p.push(`${n.not_met} not met`); if (n.unknown) p.push(`${n.unknown} needs confirming`);
  return p.join(', ');
};
const chk = (c) => `<span class="chip ${c.worst}"><i></i>${esc(checklistText(c))}</span>`;
const trackName = (t_) => (t_ === 'second' ? 'Second initiation' : 'First initiation');
const gurusOptions = (gs, sel, all) => (all ? '<option value="">All gurus</option>' : '') + gs.map((g) => `<option value="${g.id}" ${String(sel) === String(g.id) ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

// ================= Review queue (president, committee) =================
Screens.queue = async function () {
  const q = await api('/api/queue');
  const gurus = META.gurus;
  const guruF = UI.queueGuru || '', text = (UI.queueText || '').toLowerCase();
  const rows = q.waiting.filter((c) => (!guruF || String(c.guru_id) === guruF) && (!text || c.name.toLowerCase().includes(text)));
  shell('queue', `<div class="row" style="justify-content:space-between;align-items:flex-end">
    <div><h1>Review queue</h1><p class="lead">Candidates whose mentors have submitted a readiness note. You recommend or send back. The guru's office makes the decision.</p></div>
    <div class="row"><label class="sr" for="qq">Search candidates</label><input id="qq" type="search" placeholder="Search by name" value="${esc(UI.queueText || '')}" style="width:200px" data-filter="queueText">
    <label class="sr" for="qg">Filter by guru</label><select id="qg" style="width:auto;max-width:260px" data-filter="queueGuru">${gurusOptions(gurus, guruF, true)}</select></div></div>
    <div class="tiles"><div class="tile"><div class="n">${q.counts.waiting}</div><div class="muted">Waiting for your review</div></div>
      <div class="tile"><div class="n">${q.counts.sent_back}</div><div class="muted">Sent back, waiting on the candidate</div></div>
      <div class="tile"><div class="n">${q.counts.with_guru}</div><div class="muted">With the guru's office</div></div></div>
    <div class="card tablewrap"><table style="min-width:760px"><thead><tr><th>Candidate</th><th>Guru and rule set</th><th>Checklist</th><th>Waiting</th><th><span class="sr">Action</span></th></tr></thead><tbody>
    ${rows.map((c) => `<tr><td><b>${esc(c.name)}</b><div class="sub">${trackName(c.track)}</div></td><td>${esc(c.guru_name)}<div class="sub">${esc(c.rule_name)} v${c.rule_version}</div></td>
      <td>${chk(c)}</td><td class="muted">${c.waiting_days} days</td><td style="text-align:right"><a class="btn primary" href="#/candidate/${c.id}">Review</a></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing is waiting for review.</td></tr>'}
    </tbody></table></div>
    <div class="sub">Each status is a word as well as a shape: a filled circle is met, a hollow circle needs confirming, a square is not met.</div>`);
};
ACT2._input = (e) => {
  const k = e.target.dataset && e.target.dataset.filter;
  if (k && e.target.tagName === 'INPUT') { UI[k] = e.target.value; clearTimeout(ACT2._t); ACT2._t = setTimeout(async () => { const pos = e.target.selectionStart; await render(); const n = $(e.target.id); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); }
};
ACT2._change = (e) => {
  const k = e.target.dataset && e.target.dataset.filter;
  if (k && e.target.tagName === 'SELECT') { UI[k] = e.target.value; render(); return; }
  if (e.target.name === 'decision') updateDecision();
  if (e.target.matches && e.target.matches('[data-rsfield]')) updateRuleBadges();
};

// ================= Candidates list (president, committee, admin) =================
Screens.candidates = async function () {
  const rows = await api('/api/candidates');
  const stage = UI.cStage || '', guru = UI.cGuru || '', text = (UI.cText || '').toLowerCase();
  const list = rows.filter((c) => (!stage || c.stage === stage) && (!guru || String(c.guru_id) === guru) && (!text || c.name.toLowerCase().includes(text)));
  const canAdd = ['committee', 'admin'].includes(ME.role);
  shell('candidates', `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Candidates</h1><p class="lead">Everyone in the process, from first contact to initiation.</p></div>
    <div class="row"><input id="cq" type="search" aria-label="Search candidates" placeholder="Search by name" value="${esc(UI.cText || '')}" style="width:200px" data-filter="cText">
    <select aria-label="Filter by stage" style="width:auto" data-filter="cStage"><option value="">All stages</option>${META.stages.map((s) => `<option ${stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select aria-label="Filter by guru" style="width:auto;max-width:240px" data-filter="cGuru">${gurusOptions(META.gurus, guru, true)}</select>
    <button class="btn" data-act="export-list">Export CSV</button></div></div>
    ${canAdd ? `<details class="card pad"><summary style="min-height:44px;cursor:pointer;font-weight:600">Add a candidate</summary>
      <div class="row" style="margin-top:12px;align-items:flex-end"><label class="field grow">Name<input type="text" id="nc-name"></label><label class="field grow">Phone<input type="text" id="nc-phone"></label>
      <label class="field grow">Group<input type="text" id="nc-group" placeholder="Bhakti vriksha or sanga"></label>
      <label class="field grow">Mentor<select id="nc-mentor">${META.mentors.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
      <label class="field grow">Guru the candidate intends to approach<select id="nc-guru">${gurusOptions(META.gurus)}</select></label></div>
      <label class="radio" style="margin-top:8px"><input type="checkbox" id="nc-consent"> The candidate has been told what is stored and why, and agrees</label>
      <button class="btn primary" data-act="add-candidate" style="margin-top:8px">Add candidate</button></details>` : ''}
    <div class="card tablewrap"><table style="min-width:820px"><thead><tr><th>Candidate</th><th>Stage</th><th>Guru</th><th>Mentor</th><th>Checklist</th><th><span class="sr">Open</span></th></tr></thead><tbody>
    ${list.map((c) => `<tr><td><b>${esc(c.name)}</b><div class="sub">${trackName(c.track)}${c.status === 'declined' ? ' · declined' : ''}</div></td><td>${c.stage}</td><td>${esc(c.guru_name)}</td><td>${esc(c.mentor_name)}</td>
      <td>${c.stage === 'Initiated' ? '<span class="muted">Complete</span>' : chk(c)}</td><td style="text-align:right"><a class="btn small" href="#/candidate/${c.id}">Open</a></td></tr>`).join('')}
    </tbody></table></div>`);
  window.__list = list;
};
Object.assign(ACT2, {
  'export-list'() {
    const esc2 = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = ['Name,Stage,Initiation,Guru,Mentor,Status'];
    (window.__list || []).forEach((c) => lines.push([c.name, c.stage, c.track, c.guru_name, c.mentor_name, c.status].map(esc2).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'candidates.csv'; a.click();
  },
  async 'add-candidate'() {
    const r = await post('/api/candidates', { name: val('nc-name'), phone: val('nc-phone'), group_name: val('nc-group'), mentor_id: val('nc-mentor'), guru_id: val('nc-guru'), consent: $('nc-consent').checked });
    toast('Candidate added'); location.hash = '#/candidate/' + r.id;
  },
});

// ================= Candidate file (all staff roles) =================
Screens.candidateFile = async function (args) {
  const id = args[0];
  const d = await api('/api/candidates/' + id);
  const c = d.candidate;
  const mobile = MOBILE(ME.role);
  const back = ME.role === 'president' ? ['#/queue', 'Back to review queue'] : ['#/candidates', 'Back to candidates'];
  const tabs = ['review', 'timeline', 'documents', 'notes', 'changelog'];
  const tabName = { review: 'Review', timeline: 'Timeline', documents: 'Documents', notes: 'Notes', changelog: 'Change log' };
  const waiting = c.stage === 'Applied' ? ` · Applied ${Math.max(0, Math.round((new Date(META.today) - new Date(c.stage_since)) / 86400000))} days ago` : '';
  const head = `<div><a href="${mobile ? '#/candidates' : back[0]}" style="display:inline-flex;align-items:center;min-height:44px;font-size:14px;font-weight:500">${mobile ? 'Back to my candidates' : back[1]}</a>
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h1 style="${mobile ? 'font-size:22px' : ''}">${esc(c.name)}</h1>
    <div class="muted">${trackName(c.track)} · Mentor: ${esc(c.mentor_name)} · Stage: ${c.stage}${waiting}${c.status === 'declined' ? ' · Declined' : ''}</div></div>
    <div class="row"><span class="chip plain">${esc(c.guru_name)}</span><span class="chip plain">Rule set: ${esc(d.version.rule_name)} v${d.version.version}</span></div></div></div>
    <div class="tabs" role="tablist">${tabs.map((k) => `<button role="tab" aria-selected="${UI.tab === k}" class="${UI.tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${tabName[k]}</button>`).join('')}</div>`;
  let body = '';
  if (UI.tab === 'review') body = reviewTab(d);
  else if (UI.tab === 'timeline') body = `<div class="card pad" style="display:flex;flex-direction:column;gap:10px">${d.timeline.map((t_) => `<div class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:12px"><span class="sub" style="width:92px;flex:none">${fmt(t_.at)}</span><span>${esc(t_.detail)}</span></div>`).join('')}</div>`;
  else if (UI.tab === 'documents') body = docsTab(d);
  else if (UI.tab === 'notes') body = notesTab(d);
  else body = `<div class="card tablewrap"><table style="min-width:640px"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Rule set</th></tr></thead><tbody>${d.timeline.map((t_) => `<tr><td>${fmt(t_.at)}</td><td>${esc(t_.actor)}</td><td>${esc(t_.detail)}</td><td class="sub">${t_.rule_version_id ? 'v' + t_.rule_version_id : ''}</td></tr>`).join('')}</tbody></table></div><div class="sub">Every change is recorded with who made it and when. Recommendations also record the rule set version used.</div>`;
  const inner = head + body;
  if (mobile) phone('candidates', inner, MENTOR_TABS); else shell(ME.role === 'president' ? 'queue' : 'candidates', inner);
};
ACT2.tab = (b) => { UI.tab = b.dataset.tab; render(); };

function reviewTab(d) {
  const c = d.candidate;
  const mentorNotes = d.notes.filter((n) => n.kind === 'readiness');
  const left = `
    <section class="card"><h2>Checklist against ${esc(d.version.rule_name)} v${d.version.version}</h2><div class="tablewrap"><table style="min-width:520px"><tbody>
      ${d.check.items.map((i) => `<tr><td style="width:44px">${dot(i.status)}</td><td><div style="font-weight:500">${i.id}: ${esc(i.label)}</div><div class="sub">${esc(i.detail)}${i.source ? ' · ' + esc(i.source) : ''}</div></td><td style="text-align:right">${chip(i.status)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px"><h3 style="font-size:16px">Documents</h3>
      ${d.docRows.map((r) => `<div class="row sep" style="justify-content:space-between"><div><div style="font-weight:500">${esc(r.label)}</div><div class="sub">${r.present ? esc(r.doc.filename) + ' · ' + esc(r.doc.uploaded_by) : 'Required by ' + esc(d.version.rule_name)}</div></div>
      <div class="row">${chip(r.present ? 'met' : 'not_met', r.present ? 'On file' : 'Missing')}${r.present ? `<a class="btn small" href="/api/documents/${r.doc.id}" target="_blank">View</a>` : ''}</div></div>`).join('')}</section>
    <section class="card pad" style="display:flex;flex-direction:column;gap:8px"><h3 style="font-size:16px">Mentor's readiness note</h3>
      ${mentorNotes.length ? mentorNotes.slice(0, 1).map((n) => `<div class="sub">${esc(n.author)} · submitted ${fmt(n.created_at)}</div><p style="margin:0">${esc(n.body)}</p>`).join('') : '<div class="muted">No readiness note yet.</div>'}</section>`;
  let right = '';
  if (ME.role === 'president') right = presidentPanel(d);
  if (['committee', 'admin'].includes(ME.role)) right = recordPanel(d);
  if (ME.role === 'mentor') right = mentorPanel(d);
  const extra = ['committee', 'admin'].includes(ME.role) && d.can.approve === false ? '' : '';
  return `<div class="cols"><div class="l">${left}${extra}</div><aside class="r">${right}</aside></div>`;
}

function presidentPanel(d) {
  const c = d.candidate;
  if (c.stage === 'Applied' && c.status === 'active') {
    const can = d.check.canApprove;
    const blockers = d.check.blockers;
    return `<div class="panel"><h3 style="font-size:16px">Your recommendation</h3>
      ${can ? '<div class="note-box info">Every item that the approval depends on is met or has a recorded exception. The guru, not this system, decides.</div>'
        : `<div class="note-box bad">${blockers.map((b) => b.id).join(' and ')} ${blockers.length > 1 ? 'are' : 'is'} not met or not yet confirmed, and no exception is recorded. You cannot approve until a committee member records one. You can still send the file back or decline.</div>`}
      <fieldset style="border:0;margin:0;padding:0"><legend style="font-size:13px;font-weight:600;padding:0">Decision</legend>
        <label class="radio" style="${can ? '' : 'color:#7C88A1'}"><input type="radio" name="decision" value="approve" ${can ? 'checked' : 'disabled'}> Approve and generate the letter</label>
        <label class="radio"><input type="radio" name="decision" value="sendback" ${can ? '' : 'checked'}> Send back with a reason</label>
        <label class="radio"><input type="radio" name="decision" value="decline"> Decline with a reason</label></fieldset>
      <label class="field" id="reason-wrap" style="${can ? 'display:none' : ''}">Reason (the candidate and mentor will see it)<textarea id="reason">${can ? '' : esc(defaultReason(d))}</textarea></label>
      <button class="btn primary" id="decide-btn" data-act="decide" data-id="${c.id}" style="min-height:48px">${can ? 'Approve and generate the letter' : 'Send back to candidate'}</button>
      <div class="sub">Every decision is logged with your name, the time and the rule set version used.</div></div>`;
  }
  const resp = (d.guru_responses || [])[0];
  return `<div class="panel plain"><h3 style="font-size:16px">Status</h3>
    <div>${c.status === 'declined' ? 'This application was declined.' : `Stage: <b>${c.stage}</b>.`}</div>
    ${resp ? `<div>Guru's office: <b>${resp.response === 'wait' ? 'asked to wait' : resp.response}</b>${resp.reason ? ' · ' + esc(resp.reason) : ''}</div>` : ''}
    ${d.letter ? `<a class="btn" href="/api/candidates/${c.id}/letter" target="_blank">Open recommendation letter (PDF)</a>` : ''}
    ${d.can.package ? `<button class="btn" data-act="package" data-id="${c.id}" data-missing="${d.check.missingDocs.length}">Export package for the guru's office</button>` : ''}</div>`;
}
function defaultReason(d) {
  const miss = d.check.blockers.map((b) => `${b.id} ${b.label} (${b.detail.toLowerCase()})`);
  return miss.length ? 'Please resolve: ' + miss.join('; ') + '.' : '';
}
function updateDecision() {
  const sel = document.querySelector('input[name=decision]:checked'); const btn = $('decide-btn'); if (!sel || !btn) return;
  const labels = { approve: 'Approve and generate the letter', sendback: 'Send back to candidate', decline: 'Decline' };
  btn.textContent = labels[sel.value]; $('reason-wrap').style.display = sel.value === 'approve' ? 'none' : 'flex';
}

function recordPanel(d) {
  const c = d.candidate;
  const blockers = d.check.blockers;
  const resp = (d.guru_responses || [])[0];
  return `<div class="panel plain"><h3 style="font-size:16px">Keep this file</h3>
    <div class="sep" style="border:0;padding:0"><b style="font-size:13px">Record facts</b>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="field grow">Shelter date<input type="date" id="f-shelter" value="${esc(c.shelter_date || '')}"></label><button class="btn small" data-act="rec-shelter" data-id="${c.id}" style="align-self:flex-end">Save</button></div>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="field grow">Mentor confirms practice since<input type="date" id="f-practice" value="${esc(c.practice_since || '')}"></label><button class="btn small" data-act="rec-practice" data-id="${c.id}" style="align-self:flex-end">Save</button></div>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><label class="field grow">Examination<select id="f-exam"><option value="">Not recorded</option><option value="passed" ${c.exam_status === 'passed' ? 'selected' : ''}>Passed</option><option value="failed" ${c.exam_status === 'failed' ? 'selected' : ''}>Not passed</option><option value="not_taken" ${c.exam_status === 'not_taken' ? 'selected' : ''}>Not taken yet</option></select></label><button class="btn small" data-act="rec-exam" data-id="${c.id}" style="align-self:flex-end">Save</button></div>
      <div class="row" style="margin-top:6px"><span class="sub" style="width:100%">Disciples Course: ${c.course_complete === 1 ? 'complete' : c.course_complete === 0 ? 'not complete' : 'not recorded'}</span>
        <button class="btn small" data-act="rec-course" data-id="${c.id}" data-v="1">Mark complete</button><button class="btn small" data-act="rec-course" data-id="${c.id}" data-v="0">Mark not complete</button></div></div>
    ${blockers.length && ['Applied', 'Preparing'].includes(c.stage) ? `<div class="sep"><b style="font-size:13px">Record an exception</b><div class="sub">A written reason lets the president approve despite an unmet item.</div>
      ${blockers.map((b) => `<div style="margin-top:8px"><div style="font-size:13px"><b>${b.id}</b> ${esc(b.label)}</div><div class="row" style="flex-wrap:nowrap"><input type="text" id="exc-${b.id}" placeholder="Reason" aria-label="Reason for ${b.id}"><button class="btn small" data-act="exception" data-id="${c.id}" data-rule="${b.id}">Record</button></div></div>`).join('')}</div>` : ''}
    <div class="sep"><label class="field">Chosen guru<select id="f-guru">${gurusOptions(d.gurus, c.guru_id)}</select></label><button class="btn small" style="margin-top:6px" data-act="rec-guru" data-id="${c.id}">Change guru</button><div class="sub">The checklist then follows that guru's rule set.</div></div>
    ${d.can.package ? `<div class="sep"><button class="btn" data-act="package" data-id="${c.id}" data-missing="${d.check.missingDocs.length}">Export package for the guru's office</button>${d.check.missingDocs.length ? `<div class="sub">Missing: ${d.check.missingDocs.map((t_) => esc(META.doc_labels[t_])).join(', ')}</div>` : ''}${d.letter ? `<div style="margin-top:6px"><a href="/api/candidates/${c.id}/letter" target="_blank">Recommendation letter (PDF)</a></div>` : ''}</div>` : ''}
    ${c.stage === 'Recommended' && c.status === 'active' ? `<div class="sep"><b style="font-size:13px">Guru's office answer</b>${resp ? `<div class="sub">Last: ${resp.response}${resp.reason ? ' · ' + esc(resp.reason) : ''}</div>` : ''}
      <select id="g-resp" style="margin-top:6px"><option value="accepted">Accepted</option><option value="wait">Asked to wait</option><option value="declined">Declined</option></select>
      <input type="text" id="g-reason" placeholder="Reason (needed if waiting or declined)" style="margin-top:6px"><button class="btn small" style="margin-top:6px" data-act="guru-answer" data-id="${c.id}">Record answer</button></div>` : ''}
    ${['Aspiring', 'Shelter'].includes(c.stage) ? `<div class="sep"><button class="btn" data-act="advance" data-id="${c.id}">Move to ${c.stage === 'Aspiring' ? 'Shelter' : 'Preparing'}</button></div>` : ''}</div>`;
}
function mentorPanel(d) {
  const c = d.candidate;
  return `<div class="panel plain"><h3 style="font-size:16px">What you can do</h3>
    <div class="row" style="flex-wrap:nowrap"><label class="field grow">I confirm practice since<input type="date" id="f-practice" value="${esc(c.practice_since || '')}"></label><button class="btn small" data-act="rec-practice" data-id="${c.id}" style="align-self:flex-end">Save</button></div>
    <label class="field sep">Monthly note<textarea id="m-note"></textarea></label><button class="btn small" data-act="mentor-note" data-id="${c.id}">Add note</button>
    ${c.stage === 'Shelter' ? `<div class="sep"><button class="btn primary" data-act="advance" data-id="${c.id}">Start preparation</button></div>` : ''}
    ${c.stage === 'Preparing' && c.status === 'active' ? `<div class="sep"><label class="field">Readiness note for the temple president<textarea id="m-ready"></textarea></label>
      ${d.check.canApprove ? '' : '<div class="note-box warn" style="margin-top:8px">Some items are not yet met or confirmed. You can still submit; the president will see the checklist.</div>'}
      <button class="btn primary" style="margin-top:8px" data-act="mentor-submit" data-id="${c.id}">Submit to the temple president</button></div>` : ''}</div>`;
}
function docsTab(d) {
  const c = d.candidate;
  return `<div class="card tablewrap"><table style="min-width:560px"><thead><tr><th>Document</th><th>File</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead><tbody>
    ${d.docRows.map((r) => `<tr><td>${esc(r.label)}</td><td class="sub">${r.present ? esc(r.doc.filename) + ' · ' + fmt(r.doc.uploaded_at) + ' · ' + esc(r.doc.uploaded_by) : ''}</td><td>${chip(r.present ? 'met' : 'not_met', r.present ? 'On file' : 'Missing')}</td>
      <td style="text-align:right">${r.present ? `<a class="btn small" href="/api/documents/${r.doc.id}" target="_blank">View</a> ` : ''}<button class="btn small" data-act="pick-file" data-type="${r.type}" data-cid="${c.id}">Upload</button></td></tr>`).join('')}
    </tbody></table></div><div class="sub">Stored privately. Only the candidate, the mentor and the temple office can open a file.</div>`;
}
function notesTab(d) {
  const canNote = ['mentor', 'committee', 'admin'].includes(ME.role);
  return `<div class="card pad" style="display:flex;flex-direction:column;gap:10px">${d.notes.map((n) => `<div class="msg"><div class="sub">${esc(n.kind)} · ${esc(n.author)} · ${fmt(n.created_at)}</div>${esc(n.body)}</div>`).join('') || '<div class="muted">No notes yet.</div>'}</div>
    ${canNote ? `<div class="card pad" style="display:flex;flex-direction:column;gap:8px"><label class="field">Add a monthly note<textarea id="m-note"></textarea></label><button class="btn primary" data-act="mentor-note" data-id="${d.candidate.id}">Add note</button></div>` : ''}`;
}

Object.assign(ACT2, {
  async decide(b) {
    const sel = document.querySelector('input[name=decision]:checked'); if (!sel) return;
    if (sel.value === 'decline' && !confirm('Decline this application? The candidate and mentor will see your reason.')) return;
    await post(`/api/candidates/${b.dataset.id}/recommendation`, { decision: sel.value, reason: val('reason') });
    toast(sel.value === 'approve' ? 'Approved. The recommendation letter was generated.' : sel.value === 'sendback' ? 'Sent back to the candidate and mentor.' : 'Declined.');
    location.hash = '#/queue'; render();
  },
  async 'rec-shelter'(b) { await post(`/api/candidates/${b.dataset.id}/shelter`, { date: val('f-shelter') }); toast('Shelter date saved'); render(); },
  async 'rec-practice'(b) { await post(`/api/candidates/${b.dataset.id}/practice`, { since: val('f-practice') }); toast('Practice start date saved'); render(); },
  async 'rec-exam'(b) { await post(`/api/candidates/${b.dataset.id}/exam`, { status: val('f-exam') }); toast('Examination recorded'); render(); },
  async 'rec-course'(b) { await post(`/api/candidates/${b.dataset.id}/course`, { complete: b.dataset.v === '1' }); toast('Disciples Course recorded'); render(); },
  async 'rec-guru'(b) { await post(`/api/candidates/${b.dataset.id}/guru`, { guru_id: val('f-guru') }); toast('Guru changed'); render(); },
  async exception(b) { await post(`/api/candidates/${b.dataset.id}/exceptions`, { rule_id: b.dataset.rule, reason: val('exc-' + b.dataset.rule) }); toast('Exception recorded. The president will see it.'); render(); },
  async advance(b) { await post(`/api/candidates/${b.dataset.id}/advance`); toast('Stage updated'); render(); },
  async 'guru-answer'(b) { await post(`/api/candidates/${b.dataset.id}/guru-response`, { response: val('g-resp'), reason: val('g-reason') }); toast("Guru's answer recorded"); render(); },
  async 'mentor-note'(b) { await post(`/api/candidates/${b.dataset.id}/notes`, { kind: 'monthly', body: val('m-note') }); toast('Note added'); render(); },
  async 'mentor-submit'(b) { await post(`/api/candidates/${b.dataset.id}/submit`, { body: val('m-ready') }); toast('Submitted to the temple president'); location.hash = '#/candidates'; render(); },
  package(b) {
    const missing = Number(b.dataset.missing);
    if (missing && !confirm('Required documents are missing. Export the package anyway? The export will be logged with what was missing.')) return;
    window.open(`/api/candidates/${b.dataset.id}/package?log=1`, '_blank');
  },
});

// ================= Rule sets (administrator) =================
Screens.rulesets = async function (args) {
  const data = await api('/api/rulesets');
  const sets = data.sets; const floor = data.floor;
  const set = sets.find((s) => String(s.id) === String(args[0])) || sets.find((s) => s.guru_name) || sets[0];
  const isAdmin = ME.role === 'admin';
  const v = set.draft || set.published; const isDraft = !!set.draft;
  UI.rsFloor = floor;
  const num = [['practice_months', 'R-1', 'Practice period'], ['shelter_months', 'R-2', 'Time in shelter'], ['second_gap_months', 'R-6', 'Gap before second initiation'], ['change_guru_months', 'R-7', 'Wait after changing guru']];
  const flag = [['exam_required', 'R-3', 'Examination required'], ['course_required', 'R-4', 'Disciples Course required'], ['letter_required', 'R-5', 'President letter required']];
  const badge = (k, cur) => { const f = floor[k]; if (!set.guru_id) return { t: 'Baseline', c: 'plain' }; if (cur < f) return { t: 'Below floor', c: 'not_met' }; if (cur > f) return { t: 'Raised', c: 'met' }; return { t: 'Same as floor', c: 'plain' }; };
  const canEdit = isAdmin;
  shell('rulesets', `<div><h1>Rule sets</h1><p class="lead">The GBC baseline is the floor. Each guru's office can raise it. Changing a number needs no code change, and every published version is kept.</p></div>
    <div class="note-box warn">Sample values only. The rule values shown for each guru are illustrative and are not the actual requirements of any guru's office. The temple should enter each office's real rules.</div>
    <div class="cols"><div style="flex:1 1 260px;max-width:320px;min-width:0" class="listpick">
      ${sets.map((s) => `<a href="#/rulesets/${s.id}" class="${s.id === set.id ? 'on' : ''}"><b>${esc(s.name)}</b><span class="sub">${s.guru_id ? '' : 'applies to every guru · '}v${s.published.version} in use${s.draft ? ' · draft v' + s.draft.version : ''}</span></a>`).join('')}
      ${canEdit ? `<button class="btn" data-act="add-guru" style="border-style:dashed">Add a guru's rule set</button>` : ''}</div>
    <div class="l" style="flex:999 1 480px">
      <section class="card"><div class="hd"><h2 style="padding:0;border:0">${esc(set.name)}: ${isDraft ? 'draft of v' + v.version : 'version ' + v.version + ' (in use)'}</h2>${chip(isDraft ? 'unknown' : 'met', isDraft ? 'Draft, not yet used' : 'Published')}</div>
      <div class="tablewrap"><table style="min-width:640px"><thead><tr><th>Rule</th><th>GBC floor</th><th>This rule set</th><th>Change</th></tr></thead><tbody>
      ${num.map(([k, id, label]) => { const b = badge(k, v[k]); return `<tr><td>${id}: ${label}</td><td class="muted">${floor[k]} months</td><td><div class="row" style="flex-wrap:nowrap"><input type="text" inputmode="numeric" id="rs-${k}" data-rsfield="${k}" data-floor="${floor[k]}" value="${v[k]}" style="width:80px" ${canEdit ? '' : 'disabled'} aria-label="${label} for this rule set"><span class="sub">months</span></div></td><td id="rsb-${k}">${chip(b.c, b.t)}</td></tr>`; }).join('')}
      ${flag.map(([k, id, label]) => { const f = floor[k]; return `<tr><td>${id}: ${label}</td><td class="muted">${f ? 'Yes' : 'No'}</td><td><label class="radio"><input type="checkbox" id="rs-${k}" data-rsfield="${k}" data-floor="${f}" ${v[k] ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> ${'Required'}</label></td><td id="rsb-${k}"></td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="pad sep" style="border-top:1px solid var(--line)"><b style="font-size:13px">Documents this rule set requires</b>
        <div class="chips" style="margin-top:8px" id="rs-docs">${v.required_docs.map((t_) => `<span class="pill" data-doc="${t_}">${esc(data.doc_labels[t_])}${canEdit ? ` <button aria-label="Remove ${esc(data.doc_labels[t_])}" data-act="rs-remove-doc" data-doc="${t_}">×</button>` : ''}</span>`).join('')}
        ${canEdit ? `<select id="rs-adddoc" style="width:auto" aria-label="Add a document"><option value="">Add a document…</option>${Object.keys(data.doc_labels).filter((k) => k !== 'other' && !v.required_docs.includes(k)).map((k) => `<option value="${k}">${esc(data.doc_labels[k])}</option>`).join('')}</select>` : ''}</div></div>
      ${canEdit ? `<div class="pad row" style="justify-content:space-between;background:#F8F9FB;border-top:1px solid var(--line)"><div class="sub" style="max-width:440px">Values below the GBC floor are blocked. Recommendations already made keep the version they used.</div>
        <div class="row"><input type="text" id="rs-note" placeholder="What changed (for the history)" aria-label="What changed" style="width:240px" value="${esc(isDraft ? v.note || '' : '')}"><button class="btn" data-act="rs-save" data-id="${set.id}">Save draft</button><button class="btn primary" data-act="rs-publish" data-id="${set.id}">Publish v${isDraft ? v.version : v.version + 1}</button></div></div>` : ''}</section>
      <section class="card pad" style="display:flex;flex-direction:column;gap:8px"><h3 style="font-size:16px">Version history</h3>
        ${set.versions.map((x) => `<div class="row sep" style="justify-content:space-between"><b style="font-size:14px">${esc(set.name)} v${x.version}${x.status === 'draft' ? ' (draft)' : ''}</b><span class="muted" style="flex:1 1 240px">${esc(x.note || '')}</span><span class="sub">${esc(x.created_by || '')} · ${fmt(x.created_at)}</span></div>`).join('')}</section>
    </div></div>`);
  window.__rsDocs = v.required_docs.slice(); window.__rsData = data;
};
function updateRuleBadges() {
  const floor = UI.rsFloor; if (!floor) return;
  document.querySelectorAll('[data-rsfield]').forEach((el) => {
    const k = el.dataset.rsfield; const cell = $('rsb-' + k); if (!cell || el.type === 'checkbox' || !el.dataset.floor) return;
    const cur = Number(el.value); const f = Number(el.dataset.floor);
    const [c, t_] = cur < f ? ['not_met', 'Below floor'] : cur > f ? ['met', 'Raised'] : ['plain', 'Same as floor'];
    cell.innerHTML = chip(c, t_);
  });
}
function readRuleForm() {
  const o = { required_docs: window.__rsDocs, note: val('rs-note') };
  ['practice_months', 'shelter_months', 'second_gap_months', 'change_guru_months'].forEach((k) => { o[k] = val('rs-' + k); });
  ['exam_required', 'course_required', 'letter_required'].forEach((k) => { o[k] = $('rs-' + k).checked; });
  return o;
}
Object.assign(ACT2, {
  'rs-remove-doc'(b) { window.__rsDocs = window.__rsDocs.filter((x) => x !== b.dataset.doc); b.closest('.pill').remove(); },
  async 'rs-save'(b) { await post(`/api/rulesets/${b.dataset.id}/draft`, readRuleForm()); toast('Draft saved'); render(); },
  async 'rs-publish'(b) {
    await post(`/api/rulesets/${b.dataset.id}/draft`, readRuleForm());
    const r = await post(`/api/rulesets/${b.dataset.id}/publish`, { note: val('rs-note') }); toast(`Version ${r.version} published`); render();
  },
  async 'add-guru'() { const name = prompt("Guru's name (this creates a rule set copied from the GBC baseline)"); if (!name) return; const r = await post('/api/rulesets', { guru_name: name }); location.hash = '#/rulesets/' + r.id; },
});
const _oldChange = ACT2._change;
document.addEventListener('change', (e) => { if (e.target.id === 'rs-adddoc' && e.target.value) { window.__rsDocs.push(e.target.value); const keep = readRuleForm(); post(`/api/rulesets/${location.hash.split('/')[2] || ''}/draft`, keep).then(() => render()).catch((er) => toast(er.message, true)); } });

// ================= Ceremony planner (administrator; president and committee may view) =================
Screens.ceremonies = async function (args) {
  const data = await api('/api/ceremonies');
  const planned = data.ceremonies.filter((c) => c.status === 'planned'); const done = data.ceremonies.filter((c) => c.status === 'completed');
  const sel = data.ceremonies.find((c) => String(c.id) === String(args[0])) || planned[0] || done[0];
  const admin = ME.role === 'admin';
  const label = (c) => `${c.track === 'second' ? 'Second' : 'First'} initiation with ${c.guru_name}`;
  const pool = sel ? data.pool.filter((p) => p.guru_id === sel.guru_id && p.track === sel.track) : [];
  const answerChip = (a) => a === 'accepted' ? chip('met', 'Accepted') : a ? chip('unknown', a === 'wait' ? 'Asked to wait' : a) : chip('later', 'No answer');
  shell('ceremonies', `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Ceremony planner</h1><p class="lead">Attach candidates the guru's office has accepted, then mark attendance. Completing a ceremony writes each person into the register.</p></div>
    ${admin ? '<button class="btn primary" data-act="new-cer-toggle">New ceremony</button>' : ''}</div>
    ${admin ? `<div class="card pad" id="new-cer" style="display:none"><div class="row" style="align-items:flex-end"><label class="field grow">Guru<select id="nc-g">${gurusOptions(data.gurus)}</select></label><label class="field grow">Initiation<select id="nc-t"><option value="first">First</option><option value="second">Second</option></select></label>
      <label class="field grow">Venue<input type="text" id="nc-v" value="Temple hall"></label><label class="field grow">Date (optional)<input type="date" id="nc-d"></label><button class="btn primary" data-act="new-cer">Create</button></div></div>` : ''}
    <div class="cols"><div style="flex:1 1 260px;max-width:320px;min-width:0" class="listpick"><div class="sub" style="font-weight:600">Upcoming</div>
      ${planned.map((c) => `<a href="#/ceremonies/${c.id}" class="${sel && c.id === sel.id ? 'on' : ''}"><b>${esc(label(c))}</b><span class="sub">${c.people.length} candidate${c.people.length === 1 ? '' : 's'} · ${c.date ? fmt(c.date) : 'date to be confirmed'}</span></a>`).join('') || '<div class="muted">None planned.</div>'}
      <div class="sub" style="font-weight:600;margin-top:8px">Completed</div>
      ${done.map((c) => `<a href="#/ceremonies/${c.id}" class="${sel && c.id === sel.id ? 'on' : ''}"><b>${esc(label(c))}</b><span class="sub">${c.people.length} initiated · ${fmt(c.date)}</span></a>`).join('')}</div>
    <div class="l" style="flex:999 1 480px">${sel ? `<section class="card"><div class="hd"><div><h2 style="padding:0;border:0">${esc(label(sel))}</h2><div class="sub">Venue: ${esc(sel.venue || '')} · ${sel.date ? fmt(sel.date) : 'Date to be confirmed with the guru\'s office'}</div></div>${chip(sel.status === 'planned' ? 'unknown' : 'met', sel.status === 'planned' ? 'Planned' : 'Completed')}</div>
      ${sel.status === 'planned' && admin ? `<div class="pad row" style="align-items:flex-end;border-bottom:1px solid var(--line)"><label class="field grow">Date<input type="date" id="cer-date" value="${esc(sel.date || '')}"></label><label class="field grow">Venue<input type="text" id="cer-venue" value="${esc(sel.venue || '')}"></label><button class="btn small" data-act="cer-save" data-id="${sel.id}">Save</button></div>` : ''}
      <div class="tablewrap"><table style="min-width:600px"><thead><tr><th>Candidate</th><th>Guru's office answer</th><th>Attendance</th>${sel.status === 'planned' ? '<th>Spiritual name</th><th><span class="sr">Remove</span></th>' : '<th>Spiritual name</th>'}</tr></thead><tbody>
      ${sel.people.map((p) => `<tr><td><b>${esc(p.name)}</b></td><td>${answerChip(p.answer)}</td>
        <td>${sel.status === 'planned' ? `<label class="radio"><input type="checkbox" data-act="cer-present" data-id="${sel.id}" data-cid="${p.candidate_id}" ${p.present ? 'checked' : ''} ${admin ? '' : 'disabled'}> Present</label>` : 'Present'}</td>
        <td>${sel.status === 'planned' ? (p.present ? `<input type="text" aria-label="Spiritual name for ${esc(p.name)}" id="sn-${p.candidate_id}" value="${esc(p.spiritual_name || '')}" placeholder="Enter spiritual name" ${admin ? '' : 'disabled'} data-act="cer-name" data-id="${sel.id}" data-cid="${p.candidate_id}">` : '<span class="muted">After attendance</span>') : esc(p.spiritual_name || '')}</td>
        ${sel.status === 'planned' && admin ? `<td style="text-align:right"><button class="btn small" data-act="cer-detach" data-id="${sel.id}" data-cid="${p.candidate_id}">Remove</button></td>` : sel.status === 'planned' ? '<td></td>' : ''}</tr>`).join('') || '<tr><td colspan="5" class="muted">Nobody attached yet.</td></tr>'}
      </tbody></table></div>
      ${sel.status === 'planned' && admin ? `<div class="pad row" style="justify-content:space-between;background:#F8F9FB;border-top:1px solid var(--line)"><div class="sub" style="max-width:420px">Only candidates the guru's office has accepted can be attached. Completing the ceremony needs a spiritual name for each person present.</div>
        <div class="row"><select id="cer-pool" style="width:auto;max-width:240px" aria-label="Attach a candidate"><option value="">Attach a candidate…</option>${pool.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="btn" data-act="cer-attach" data-id="${sel.id}">Attach</button><button class="btn primary" data-act="cer-complete" data-id="${sel.id}">Complete ceremony</button></div></div>` : ''}</section>
      <section class="card pad"><h3 style="font-size:16px">Accepted but not yet attached</h3>${data.pool.length ? data.pool.map((p) => `<div class="sub" style="font-size:14px;margin-top:6px">${esc(p.name)} · ${esc(p.guru_name)} · ${p.track === 'second' ? 'second' : 'first'} initiation</div>`).join('') : '<div class="muted" style="margin-top:6px">Everyone accepted is attached to a ceremony.</div>'}</section>` : '<div class="muted">No ceremonies yet.</div>'}
    </div></div>`);
};
Object.assign(ACT2, {
  'new-cer-toggle'() { const e = $('new-cer'); e.style.display = e.style.display === 'none' ? 'block' : 'none'; },
  async 'new-cer'() { const r = await post('/api/ceremonies', { guru_id: val('nc-g'), track: val('nc-t'), venue: val('nc-v'), date: val('nc-d') }); toast('Ceremony planned'); location.hash = '#/ceremonies/' + r.id; },
  async 'cer-save'(b) { await post(`/api/ceremonies/${b.dataset.id}/update`, { date: val('cer-date'), venue: val('cer-venue') }); toast('Saved'); render(); },
  async 'cer-attach'(b) { const cid = val('cer-pool'); if (!cid) throw new Error('Choose a candidate to attach'); await post(`/api/ceremonies/${b.dataset.id}/attach`, { candidate_id: Number(cid) }); toast('Attached'); render(); },
  async 'cer-detach'(b) { await post(`/api/ceremonies/${b.dataset.id}/detach`, { candidate_id: Number(b.dataset.cid) }); render(); },
  async 'cer-complete'(b) {
    // save any typed names first
    const inputs = document.querySelectorAll('input[data-act=cer-name]');
    for (const i of inputs) await post(`/api/ceremonies/${i.dataset.id}/attendance`, { candidate_id: Number(i.dataset.cid), present: true, spiritual_name: i.value });
    const r = await post(`/api/ceremonies/${b.dataset.id}/complete`); toast(`Ceremony completed. ${r.written} register entries written.`); render();
  },
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.act === 'cer-present') { try { await post(`/api/ceremonies/${el.dataset.id}/attendance`, { candidate_id: Number(el.dataset.cid), present: el.checked }); render(); } catch (er) { toast(er.message, true); } }
});

// ================= Register =================
Screens.register = async function () {
  const params = new URLSearchParams(); if (UI.rText) params.set('q', UI.rText); if (UI.rGuru) params.set('guru', UI.rGuru); if (UI.rTrack) params.set('track', UI.rTrack);
  const data = await api('/api/register?' + params);
  const qs = params.toString();
  shell('register', `<div class="row" style="justify-content:space-between;align-items:flex-end"><div><h1>Register</h1><p class="lead">Every completed initiation, written when a ceremony is completed. Entries are kept permanently, and any later change is logged.</p></div>
    <div class="row"><a class="btn" href="/api/register.csv?${qs}">Export CSV</a><a class="btn" href="/api/register.pdf?${qs}" target="_blank">Export PDF</a></div></div>
    <div class="row"><input id="rq" type="search" aria-label="Search the register" placeholder="Search by name or spiritual name" value="${esc(UI.rText || '')}" style="width:280px" data-filter="rText">
      <select aria-label="Filter by guru" style="width:auto;max-width:260px" data-filter="rGuru">${gurusOptions(data.gurus, UI.rGuru || '', true)}</select>
      <select aria-label="Filter by initiation" style="width:auto" data-filter="rTrack"><option value="">First and second</option><option value="first" ${UI.rTrack === 'first' ? 'selected' : ''}>First initiation</option><option value="second" ${UI.rTrack === 'second' ? 'selected' : ''}>Second initiation</option></select></div>
    <div class="card tablewrap"><table style="min-width:760px"><thead><tr><th>Date</th><th>Name</th><th>Spiritual name</th><th>Initiation</th><th>Guru</th><th>Ceremony</th></tr></thead><tbody>
    ${data.rows.map((r) => `<tr><td style="white-space:nowrap">${fmt(r.date)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.spiritual_name)}</td><td>${r.track === 'second' ? 'Second' : 'First'}</td><td>${esc(r.guru_name)}</td><td class="muted">Ceremony ${r.ceremony_id}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No entries match.</td></tr>'}
    </tbody></table></div>
    <div class="sub">The register holds only what the ceremony records: date, guru, spiritual name and ceremony. It holds no identity numbers. Spiritual names shown here are placeholders.</div>`);
};
