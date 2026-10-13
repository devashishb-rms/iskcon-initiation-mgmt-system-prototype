const express = require('express');
const path = require('path');
const fs = require('fs');
const { open, DATA_DIR } = require('./db');
const { seed } = require('./seed');
const R = require('./rules');
const pdf = require('./pdf');

const STAGES = ['Aspiring', 'Shelter', 'Preparing', 'Applied', 'Recommended', 'Initiated'];

function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const nowIso = () => new Date().toISOString();

  // ---------- sign-in (prototype: pick a person, no password) ----------
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).filter((x) => x[0]));
  app.use((req, _res, next) => {
    const uid = Number(cookies(req).uid);
    req.user = uid ? one('SELECT * FROM users WHERE id=?', uid) : null;
    next();
  });
  const need = (...roles) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in first' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Your role cannot do this' });
    next();
  };
  const fail = (res, msg, code = 400) => res.status(code).json({ error: msg });

  app.get('/api/users', (_req, res) => res.json(q('SELECT id, name, role, candidate_id, mentor_id FROM users ORDER BY id')));
  app.post('/api/login', (req, res) => {
    const u = one('SELECT * FROM users WHERE id=?', Number(req.body.user_id));
    if (!u) return fail(res, 'Unknown person', 404);
    res.setHeader('Set-Cookie', `uid=${u.id}; Path=/; SameSite=Lax`);
    res.json({ id: u.id, name: u.name, role: u.role });
  });
  app.post('/api/logout', (_req, res) => { res.setHeader('Set-Cookie', 'uid=; Path=/; Max-Age=0'); res.json({ ok: true }); });
  app.get('/api/me', (req, res) => {
    if (!req.user) return res.json(null);
    res.json({ id: req.user.id, name: req.user.name, role: req.user.role, candidate_id: req.user.candidate_id, mentor_id: req.user.mentor_id });
  });
  app.post('/api/reset-sample-data', need('admin'), (req, res) => { seed(db); res.json({ ok: true }); });

  // ---------- helpers ----------
  const audit = (req, cid, action, detail, rvId) =>
    run('INSERT INTO audit (at, actor, candidate_id, action, detail, rule_version_id) VALUES (?,?,?,?,?,?)', nowIso(), req.user.name, cid || null, action, detail, rvId || null);

  const canSee = (u, c) => u.role === 'candidate' ? u.candidate_id === c.id : u.role === 'mentor' ? u.mentor_id === c.mentor_id : true;
  const getCand = (req, res) => {
    const c = one(`SELECT c.*, m.name AS mentor_name, g.name AS guru_name FROM candidates c
      LEFT JOIN mentors m ON m.id=c.mentor_id LEFT JOIN gurus g ON g.id=c.guru_id WHERE c.id=?`, Number(req.params.id));
    if (!c || !canSee(req.user, c)) { fail(res, 'Not found', 404); return null; }
    return c;
  };

  const versionRow = (id) => one(`SELECT v.*, s.name AS rule_name, s.guru_id FROM rule_versions v JOIN rule_sets s ON s.id=v.rule_set_id WHERE v.id=?`, id);
  const latestPublished = (ruleSetId) => one(`SELECT v.*, s.name AS rule_name, s.guru_id FROM rule_versions v JOIN rule_sets s ON s.id=v.rule_set_id
      WHERE v.rule_set_id=? AND v.status='published' ORDER BY v.version DESC LIMIT 1`, ruleSetId);
  const baseline = () => latestPublished(one('SELECT id FROM rule_sets WHERE guru_id IS NULL').id);
  const lastApproval = (cid) => one(`SELECT * FROM recommendations WHERE candidate_id=? AND decision='approve' ORDER BY id DESC LIMIT 1`, cid);
  const lastGuruResponse = (cid) => one('SELECT * FROM guru_responses WHERE candidate_id=? ORDER BY id DESC LIMIT 1', cid);

  function versionFor(c) {
    if (['Recommended', 'Initiated'].includes(c.stage)) {
      const a = lastApproval(c.id);
      if (a && a.rule_version_id) return versionRow(a.rule_version_id);
    }
    const set = one('SELECT id FROM rule_sets WHERE guru_id=?', c.guru_id);
    return (set && latestPublished(set.id)) || baseline();
  }

  function checkFor(c, version) {
    const docs = q('SELECT * FROM documents WHERE candidate_id=?', c.id);
    const exceptions = q('SELECT * FROM exceptions WHERE candidate_id=?', c.id);
    const approved = ['Recommended', 'Initiated'].includes(c.stage) && !!lastApproval(c.id);
    return { docs, exceptions, check: R.evaluate(c, version, { docs, exceptions, approved }) };
  }

  function nextStep(c, check, docs) {
    const open = check.items.filter((i) => i.id !== 'R-5' && (i.status === 'not_met' || i.status === 'unknown'));
    // Things the candidate can do alone (upload the certificate) come before things the temple records.
    const first = open.find((i) => i.id === 'R-4') || open[0];
    const resp = lastGuruResponse(c.id);
    if (c.status === 'declined') return { key: 'declined', text: 'This application was declined. Please talk to your mentor.' };
    switch (c.stage) {
      case 'Aspiring': return { key: 'aspiring', text: 'Keep attending the programme. Your mentor will arrange for you to be accepted in shelter by your guru.' };
      case 'Shelter': return { key: 'shelter', text: 'Keep your practice steady. Your mentor will tell you when preparation for initiation begins.' };
      case 'Preparing': {
        if (first && first.id === 'R-4') return { key: 'upload_certificate', text: 'Upload your Disciples Course certificate', why: 'Your mentor cannot confirm this item until the certificate is on file.' };
        if (first && first.id === 'R-3') return { key: 'exam', text: 'Take the prescribed examination', why: 'The temple records the result once you have taken it.' };
        if (first && first.due) return { key: 'wait', text: `Keep your practice steady until ${first.due}`, why: first.label };
        if (first) return { key: 'confirm', text: 'Ask your mentor to confirm: ' + first.label, why: first.detail };
        return { key: 'ready', text: 'Everything is in place. Your mentor will submit your readiness note.', why: '' };
      }
      case 'Applied': return { key: 'applied', text: 'Your file is with the temple president for review.' };
      case 'Recommended':
        if (!resp) return { key: 'with_guru', text: "Your file is with the guru's office." };
        if (resp.response === 'accepted') return { key: 'accepted', text: 'The guru has accepted you. The temple will tell you the ceremony date.' };
        return { key: 'with_guru', text: "Your file is with the guru's office." };
      default: return { key: 'initiated', text: 'Hare Krishna. You are initiated.' };
    }
  }

  function summary(c) {
    const v = versionFor(c);
    const { check, docs } = checkFor(c, v);
    const lastRec = one('SELECT * FROM recommendations WHERE candidate_id=? ORDER BY id DESC LIMIT 1', c.id);
    const waitingSince = c.stage_since;
    const days = Math.max(0, Math.round((new Date(R.today()) - new Date(waitingSince || R.today())) / 86400000));
    const resp = lastGuruResponse(c.id);
    const attached = one(`SELECT cc.ceremony_id FROM ceremony_candidates cc JOIN ceremonies e ON e.id=cc.ceremony_id WHERE cc.candidate_id=? AND e.status='planned'`, c.id);
    return {
      id: c.id, name: c.name, stage: c.stage, status: c.status, track: c.track, mentor_name: c.mentor_name, mentor_id: c.mentor_id,
      guru_id: c.guru_id, guru_name: c.guru_name, rule_name: v.rule_name, rule_version: v.version,
      counts: check.counts, worst: check.worst, summary: check.summary, canApprove: check.canApprove,
      waiting_days: days, last_decision: lastRec ? lastRec.decision : null,
      guru_response: resp ? resp.response : null, ceremony_id: attached ? attached.ceremony_id : null,
      next_due: nextStep(c, check, docs).text,
    };
  }

  const candSelect = `SELECT c.*, m.name AS mentor_name, g.name AS guru_name FROM candidates c
    LEFT JOIN mentors m ON m.id=c.mentor_id LEFT JOIN gurus g ON g.id=c.guru_id`;

  // ---------- candidates ----------
  app.get('/api/candidates', need('mentor', 'president', 'committee', 'admin'), (req, res) => {
    let rows = q(candSelect + ' ORDER BY c.id').filter((c) => canSee(req.user, c));
    const { stage, mentor, guru, qtext } = req.query;
    if (stage) rows = rows.filter((c) => c.stage === stage);
    if (mentor) rows = rows.filter((c) => String(c.mentor_id) === String(mentor));
    if (guru) rows = rows.filter((c) => String(c.guru_id) === String(guru));
    if (qtext) rows = rows.filter((c) => c.name.toLowerCase().includes(String(qtext).toLowerCase()));
    res.json(rows.map(summary));
  });

  app.get('/api/queue', need('president', 'committee', 'admin'), (req, res) => {
    const all = q(candSelect + ' ORDER BY c.stage_since, c.id').map(summary);
    const waiting = all.filter((c) => c.stage === 'Applied' && c.status === 'active');
    const sentBack = all.filter((c) => c.stage === 'Preparing' && c.status === 'active' && c.last_decision === 'sendback');
    const withGuru = all.filter((c) => c.stage === 'Recommended' && c.status === 'active' && (!c.guru_response || c.guru_response === 'wait'));
    res.json({ waiting: waiting.sort((a, b) => b.waiting_days - a.waiting_days), counts: { waiting: waiting.length, sent_back: sentBack.length, with_guru: withGuru.length } });
  });

  app.get('/api/candidates/:id', need(), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const v = versionFor(c);
    const { check, docs, exceptions } = checkFor(c, v);
    const isCand = req.user.role === 'candidate';
    let notes = q('SELECT * FROM notes WHERE candidate_id=? ORDER BY id DESC', c.id);
    if (isCand) notes = notes.filter((n) => n.kind === 'message');
    const decisions = q('SELECT * FROM recommendations WHERE candidate_id=? ORDER BY id DESC', c.id);
    const resp = q('SELECT * FROM guru_responses WHERE candidate_id=? ORDER BY id DESC', c.id);
    const timeline = q('SELECT at, actor, action, detail, rule_version_id FROM audit WHERE candidate_id=? ORDER BY at DESC, id DESC', c.id);
    const required = JSON.parse(v.required_docs || '[]');
    const docRows = required.map((t) => {
      const d = docs.filter((x) => x.doc_type === t).sort((a, b) => b.id - a.id)[0];
      return { type: t, label: R.DOC_LABELS[t], present: !!d, doc: d || null };
    });
    docs.filter((d) => !required.includes(d.doc_type)).forEach((d) => docRows.push({ type: d.doc_type, label: R.DOC_LABELS[d.doc_type] || d.doc_type, present: true, doc: d, extra: true }));
    const ns = nextStep(c, check, docs);
    const lastRec = decisions[0] || null;
    const sendBack = c.stage === 'Preparing' && lastRec && lastRec.decision === 'sendback' ? lastRec : null;
    const guruList = q('SELECT * FROM gurus ORDER BY id');
    const out = {
      candidate: { ...c, ...{ mentor_phone: one('SELECT phone FROM mentors WHERE id=?', c.mentor_id)?.phone } },
      stages: STAGES, version: { id: v.id, version: v.version, rule_name: v.rule_name, status: v.status },
      check, docRows, notes, next: ns, send_back: sendBack,
      can: {
        approve: ['president'].includes(req.user.role) && c.stage === 'Applied' && c.status === 'active',
        record: ['committee', 'admin'].includes(req.user.role),
        mentor: req.user.role === 'mentor' || ['committee', 'admin'].includes(req.user.role),
        upload: true,
        submit: (req.user.role === 'mentor') && c.stage === 'Preparing' && c.status === 'active',
        package: ['president', 'committee', 'admin'].includes(req.user.role) && ['Applied', 'Recommended', 'Initiated'].includes(c.stage),
      },
    };
    if (!isCand) {
      out.exceptions = exceptions; out.decisions = decisions; out.guru_responses = resp; out.timeline = timeline; out.gurus = guruList;
      out.letter = !!lastApproval(c.id);
    } else {
      out.decisions = decisions.filter((d) => d.decision === 'sendback');
    }
    res.json(out);
  });

  app.post('/api/candidates', need('committee', 'admin', 'mentor'), (req, res) => {
    const b = req.body;
    if (!b.name || !String(b.name).trim()) return fail(res, 'Name is required');
    if (!b.consent) return fail(res, 'Record the candidate\'s consent to store these details first');
    const mentor = req.user.role === 'mentor' ? req.user.mentor_id : Number(b.mentor_id);
    if (!mentor || !one('SELECT id FROM mentors WHERE id=?', mentor)) return fail(res, 'Choose a mentor');
    if (!b.guru_id || !one('SELECT id FROM gurus WHERE id=?', Number(b.guru_id))) return fail(res, 'Choose the guru the candidate intends to approach');
    const id = run(`INSERT INTO candidates (name, phone, group_name, mentor_id, guru_id, track, stage, consent_at, created_at, stage_since)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, String(b.name).trim(), b.phone || null, b.group_name || null, mentor, Number(b.guru_id), 'first', 'Aspiring', nowIso(), nowIso(), R.today()).lastInsertRowid;
    audit(req, id, 'created', 'Profile created and consent recorded');
    res.json({ id });
  });

  // Record facts. Each is a small, logged change; the rule engine reads them afterwards.
  const date = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : null;

  app.post('/api/candidates/:id/practice', need('mentor', 'committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const d = date(req.body.since); if (!d) return fail(res, 'Give a date as YYYY-MM-DD');
    if (d > R.today()) return fail(res, 'The start date cannot be in the future');
    run('UPDATE candidates SET practice_since=? WHERE id=?', d, c.id);
    audit(req, c.id, 'practice', `Practice confirmed since ${d}`);
    res.json({ ok: true });
  });
  app.post('/api/candidates/:id/shelter', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const d = date(req.body.date); if (!d) return fail(res, 'Give a date as YYYY-MM-DD');
    run('UPDATE candidates SET shelter_date=? WHERE id=?', d, c.id);
    if (c.stage === 'Aspiring') run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Shelter', R.today(), c.id);
    audit(req, c.id, 'shelter', `Shelter date recorded: ${d}`);
    res.json({ ok: true });
  });
  app.post('/api/candidates/:id/exam', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    if (!['passed', 'failed', 'not_taken'].includes(req.body.status)) return fail(res, 'Choose passed, not passed or not taken');
    run('UPDATE candidates SET exam_status=? WHERE id=?', req.body.status, c.id);
    audit(req, c.id, 'exam', `Examination recorded: ${req.body.status.replace('_', ' ')}`);
    res.json({ ok: true });
  });
  app.post('/api/candidates/:id/course', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    run('UPDATE candidates SET course_complete=? WHERE id=?', req.body.complete ? 1 : 0, c.id);
    audit(req, c.id, 'course', `Disciples Course marked ${req.body.complete ? 'complete' : 'not complete'}`);
    res.json({ ok: true });
  });
  app.post('/api/candidates/:id/guru', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const g = one('SELECT * FROM gurus WHERE id=?', Number(req.body.guru_id));
    if (!g) return fail(res, 'Unknown guru');
    run('UPDATE candidates SET guru_id=? WHERE id=?', g.id, c.id);
    audit(req, c.id, 'guru_changed', `Chosen guru changed to ${g.name}. The checklist now follows ${g.name}'s rule set.`);
    res.json({ ok: true });
  });
  app.post('/api/candidates/:id/advance', need('mentor', 'committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    if (c.stage === 'Aspiring') {
      if (!c.shelter_date) return fail(res, 'Record the shelter date first');
      run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Shelter', R.today(), c.id);
    } else if (c.stage === 'Shelter') {
      run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Preparing', R.today(), c.id);
    } else return fail(res, 'This stage moves on through the review, not by hand');
    audit(req, c.id, 'stage', `Stage changed to ${c.stage === 'Aspiring' ? 'Shelter' : 'Preparing'}`);
    res.json({ ok: true });
  });

  app.post('/api/candidates/:id/notes', need('candidate', 'mentor', 'committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const kind = req.user.role === 'candidate' ? 'message' : (req.body.kind === 'message' ? 'message' : 'monthly');
    const body = String(req.body.body || '').trim();
    if (!body) return fail(res, 'Write something first');
    run('INSERT INTO notes (candidate_id, kind, body, author, created_at) VALUES (?,?,?,?,?)', c.id, kind, body, req.user.name, nowIso());
    audit(req, c.id, 'note', kind === 'message' ? 'Message to mentor' : 'Monthly note added');
    res.json({ ok: true });
  });

  // Mentor submits a readiness note and the file moves to the president (stage Applied)
  app.post('/api/candidates/:id/submit', need('mentor'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    if (c.stage !== 'Preparing' || c.status !== 'active') return fail(res, 'Only a candidate in Preparing can be submitted');
    const body = String(req.body.body || '').trim();
    if (!body) return fail(res, 'Write the readiness note first');
    run('INSERT INTO notes (candidate_id, kind, body, author, created_at) VALUES (?,?,?,?,?)', c.id, 'readiness', body, req.user.name, nowIso());
    run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Applied', R.today(), c.id);
    audit(req, c.id, 'applied', 'Mentor submitted the readiness note; file sent to the temple president');
    res.json({ ok: true });
  });

  // ---------- documents ----------
  app.post('/api/candidates/:id/documents', need(), express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const type = String(req.query.type || 'other');
    if (!R.DOC_LABELS[type]) return fail(res, 'Unknown document type');
    const name = decodeURIComponent(String(req.query.name || 'document')).replace(/[^\w.\- ]/g, '_').slice(0, 120);
    if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(res, 'The file was empty');
    const id = run('INSERT INTO documents (candidate_id, doc_type, filename, mime, size, uploaded_by, uploaded_at, path) VALUES (?,?,?,?,?,?,?,?)',
      c.id, type, name, req.headers['content-type'] || 'application/octet-stream', req.body.length, req.user.name, nowIso(), '').lastInsertRowid;
    const rel = path.join('uploads', `${id}${path.extname(name)}`);
    fs.writeFileSync(path.join(DATA_DIR, rel), req.body);
    run('UPDATE documents SET path=? WHERE id=?', rel, id);
    audit(req, c.id, 'document', `${R.DOC_LABELS[type]} uploaded (${name})`);
    res.json({ id });
  });
  app.get('/api/documents/:id', need(), (req, res) => {
    const d = one('SELECT * FROM documents WHERE id=?', Number(req.params.id));
    const c = d && one('SELECT * FROM candidates WHERE id=?', d.candidate_id);
    if (!d || !canSee(req.user, c)) return fail(res, 'Not found', 404);
    res.setHeader('Content-Type', d.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${d.filename}"`);
    res.send(fs.readFileSync(path.join(DATA_DIR, d.path)));
  });

  // ---------- exceptions, recommendation, letter, package, guru answer ----------
  app.post('/api/candidates/:id/exceptions', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const reason = String(req.body.reason || '').trim();
    if (!reason) return fail(res, 'An exception needs a written reason');
    const v = versionFor(c);
    const { check } = checkFor(c, v);
    const item = check.items.find((i) => i.id === req.body.rule_id);
    if (!item || item.id === 'R-5' || ![R.STATUS.NOT_MET, R.STATUS.UNKNOWN].includes(item.status)) return fail(res, 'That item does not need an exception');
    run('INSERT INTO exceptions (candidate_id, rule_id, reason, by_name, created_at) VALUES (?,?,?,?,?)', c.id, item.id, reason, req.user.name, nowIso());
    audit(req, c.id, 'exception', `Exception for ${item.id}: ${reason}`, v.id);
    res.json({ ok: true });
  });

  app.post('/api/candidates/:id/recommendation', need('president'), async (req, res) => {
    const c = getCand(req, res); if (!c) return;
    if (c.stage !== 'Applied' || c.status !== 'active') return fail(res, 'This file is not waiting for review');
    const v = versionFor(c);
    const { check } = checkFor(c, v);
    const decision = req.body.decision;
    const reason = String(req.body.reason || '').trim();
    if (!['approve', 'sendback', 'decline'].includes(decision)) return fail(res, 'Choose approve, send back or decline');
    if (decision === 'approve' && !check.canApprove) {
      return fail(res, 'This file cannot be approved yet: ' + check.blockers.map((b) => b.id).join(', ') + ' still need an answer or a recorded exception.', 409);
    }
    if (decision !== 'approve' && !reason) return fail(res, 'Give a written reason; the candidate and mentor will see it');
    run('INSERT INTO recommendations (candidate_id, decision, reason, by_name, rule_version_id, created_at) VALUES (?,?,?,?,?,?)', c.id, decision, reason || null, req.user.name, v.id, nowIso());
    if (decision === 'approve') run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Recommended', R.today(), c.id);
    if (decision === 'sendback') run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Preparing', R.today(), c.id);
    if (decision === 'decline') run('UPDATE candidates SET status=? WHERE id=?', 'declined', c.id);
    const word = { approve: 'approved and generated the recommendation letter', sendback: 'sent the file back: ' + reason, decline: 'declined: ' + reason }[decision];
    audit(req, c.id, 'recommended_' + decision, `Temple president ${word} (rule set ${v.rule_name} v${v.version})`, v.id);
    res.json({ ok: true });
  });

  app.get('/api/candidates/:id/letter', need('president', 'committee', 'admin'), async (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const rec = lastApproval(c.id);
    if (!rec) return fail(res, 'No approved recommendation yet', 404);
    const v = versionRow(rec.rule_version_id);
    const { check } = checkFor({ ...c, stage: 'Recommended' }, v);
    const note = one(`SELECT * FROM notes WHERE candidate_id=? AND kind='readiness' ORDER BY id DESC LIMIT 1`, c.id);
    const buf = await pdf.letter({ candidate: c, guru: { name: c.guru_name }, version: v, check, rec, president: rec.by_name, mentorNote: note });
    res.type('pdf').setHeader('Content-Disposition', `inline; filename="recommendation-${c.id}.pdf"`).send(buf);
  });

  app.get('/api/candidates/:id/package', need('president', 'committee', 'admin'), async (req, res) => {
    const c = getCand(req, res); if (!c) return;
    const v = versionFor(c);
    const { check, docs, exceptions } = checkFor(c, v);
    const notes = q('SELECT * FROM notes WHERE candidate_id=? ORDER BY id', c.id);
    const timeline = q('SELECT at, detail FROM audit WHERE candidate_id=? ORDER BY at, id', c.id);
    if (req.query.log) audit(req, c.id, 'package_exported', check.missingDocs.length ? `Package exported with missing documents: ${check.missingDocs.map((t) => R.DOC_LABELS[t]).join(', ')}` : 'Package for the guru\'s office exported');
    const buf = await pdf.packagePdf({ candidate: c, guru: { name: c.guru_name }, version: v, check, docs, notes, exceptions, timeline, missingDocs: check.missingDocs, letterRec: lastApproval(c.id) });
    res.type('pdf').setHeader('Content-Disposition', `inline; filename="package-${c.id}.pdf"`).send(buf);
  });

  app.post('/api/candidates/:id/guru-response', need('committee', 'admin'), (req, res) => {
    const c = getCand(req, res); if (!c) return;
    if (c.stage !== 'Recommended') return fail(res, 'Only a recommended candidate has an answer from the guru\'s office');
    const response = req.body.response;
    if (!['accepted', 'wait', 'declined'].includes(response)) return fail(res, 'Choose accepted, asked to wait or declined');
    const reason = String(req.body.reason || '').trim();
    if (response !== 'accepted' && !reason) return fail(res, 'Record the reason the office gave');
    run('INSERT INTO guru_responses (candidate_id, response, reason, by_name, created_at) VALUES (?,?,?,?,?)', c.id, response, reason || null, req.user.name, nowIso());
    if (response === 'wait') run('UPDATE candidates SET stage=?, stage_since=? WHERE id=?', 'Preparing', R.today(), c.id);
    if (response === 'declined') run('UPDATE candidates SET status=? WHERE id=?', 'declined', c.id);
    audit(req, c.id, 'guru_response', `Guru's office answered: ${response}${reason ? ' (' + reason + ')' : ''}`);
    res.json({ ok: true });
  });

  // ---------- rule sets ----------
  const publicVersion = (v) => ({ ...v, required_docs: JSON.parse(v.required_docs) });
  app.get('/api/rulesets', need('admin', 'president', 'committee'), (req, res) => {
    const floor = baseline();
    const sets = q('SELECT * FROM rule_sets ORDER BY guru_id IS NOT NULL, id').map((s) => {
      const versions = q('SELECT * FROM rule_versions WHERE rule_set_id=? ORDER BY version DESC', s.id).map(publicVersion);
      const guru = s.guru_id ? one('SELECT name FROM gurus WHERE id=?', s.guru_id) : null;
      return { ...s, guru_name: guru ? guru.name : null, published: versions.find((v) => v.status === 'published') || null, draft: versions.find((v) => v.status === 'draft') || null, versions };
    });
    res.json({ sets, floor: publicVersion(floor), doc_labels: R.DOC_LABELS });
  });

  function readDraft(b) {
    const o = {};
    R.NUMERIC.forEach((k) => { o[k] = Number(b[k]); });
    R.FLAGS.forEach((k) => { o[k] = b[k] ? 1 : 0; });
    o.required_docs = (Array.isArray(b.required_docs) ? b.required_docs : []).filter((t) => R.DOC_LABELS[t] && t !== 'other');
    return o;
  }
  function validate(set, o) {
    return set.guru_id ? R.checkAgainstFloor(o, baseline()) : R.checkAgainstFloor(o, { practice_months: 0, shelter_months: 0, second_gap_months: 0, change_guru_months: 0, exam_required: 0, course_required: 0, letter_required: 0 });
  }
  app.post('/api/rulesets/:id/draft', need('admin'), (req, res) => {
    const set = one('SELECT * FROM rule_sets WHERE id=?', Number(req.params.id));
    if (!set) return fail(res, 'Not found', 404);
    const o = readDraft(req.body);
    const errors = validate(set, o);
    if (errors.length) return res.status(422).json({ error: 'Cannot save: ' + errors.join('; '), errors });
    const existing = one(`SELECT * FROM rule_versions WHERE rule_set_id=? AND status='draft'`, set.id);
    if (existing) {
      run(`UPDATE rule_versions SET practice_months=?, shelter_months=?, exam_required=?, course_required=?, letter_required=?, second_gap_months=?,
        change_guru_months=?, required_docs=?, note=? WHERE id=?`, o.practice_months, o.shelter_months, o.exam_required, o.course_required, o.letter_required,
      o.second_gap_months, o.change_guru_months, JSON.stringify(o.required_docs), String(req.body.note || existing.note || ''), existing.id);
    } else {
      const last = one('SELECT MAX(version) v FROM rule_versions WHERE rule_set_id=?', set.id).v;
      run(`INSERT INTO rule_versions (rule_set_id, version, status, practice_months, shelter_months, exam_required, course_required, letter_required,
        second_gap_months, change_guru_months, required_docs, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      set.id, last + 1, 'draft', o.practice_months, o.shelter_months, o.exam_required, o.course_required, o.letter_required, o.second_gap_months,
      o.change_guru_months, JSON.stringify(o.required_docs), String(req.body.note || ''), req.user.name, nowIso());
    }
    res.json({ ok: true });
  });
  app.post('/api/rulesets/:id/publish', need('admin'), (req, res) => {
    const set = one('SELECT * FROM rule_sets WHERE id=?', Number(req.params.id));
    const d = set && one(`SELECT * FROM rule_versions WHERE rule_set_id=? AND status='draft'`, set.id);
    if (!d) return fail(res, 'There is no draft to publish');
    const errors = validate(set, { ...d, required_docs: JSON.parse(d.required_docs) });
    if (errors.length) return res.status(422).json({ error: 'Cannot publish: ' + errors.join('; '), errors });
    const note = String(req.body.note || d.note || '').trim() || 'Published';
    run(`UPDATE rule_versions SET status='published', note=?, created_by=?, created_at=? WHERE id=?`, note, req.user.name, nowIso(), d.id);
    audit(req, null, 'ruleset_published', `${set.name} version ${d.version} published: ${note}`, d.id);
    res.json({ ok: true, version: d.version });
  });
  app.post('/api/rulesets', need('admin'), (req, res) => {
    const name = String(req.body.guru_name || '').trim();
    if (!name) return fail(res, 'Give the guru\'s name');
    if (one('SELECT id FROM gurus WHERE name=?', name)) return fail(res, 'That guru already has a rule set');
    const g = run('INSERT INTO gurus (name) VALUES (?)', name).lastInsertRowid;
    const s = run('INSERT INTO rule_sets (guru_id, name) VALUES (?,?)', g, `${name} rules`).lastInsertRowid;
    const b = baseline();
    run(`INSERT INTO rule_versions (rule_set_id, version, status, practice_months, shelter_months, exam_required, course_required, letter_required,
      second_gap_months, change_guru_months, required_docs, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    s, 1, 'published', b.practice_months, b.shelter_months, b.exam_required, b.course_required, b.letter_required, b.second_gap_months, b.change_guru_months,
    b.required_docs, 'Created from the GBC baseline', req.user.name, nowIso());
    audit(req, null, 'ruleset_created', `${name} rules created from the GBC baseline`);
    res.json({ id: s });
  });

  // ---------- ceremonies ----------
  function ceremonyView(e) {
    const guru = one('SELECT name FROM gurus WHERE id=?', e.guru_id);
    const people = q(`SELECT cc.*, c.name FROM ceremony_candidates cc JOIN candidates c ON c.id=cc.candidate_id WHERE cc.ceremony_id=? ORDER BY c.name`, e.id);
    return { ...e, guru_name: guru.name, people: people.map((p) => ({ ...p, answer: (lastGuruResponse(p.candidate_id) || {}).response || null })) };
  }
  app.get('/api/ceremonies', need('admin', 'committee', 'president'), (req, res) => {
    const list = q(`SELECT * FROM ceremonies ORDER BY status='completed', date IS NULL, date DESC, id`).map(ceremonyView);
    const attachedIds = q(`SELECT cc.candidate_id FROM ceremony_candidates cc JOIN ceremonies e ON e.id=cc.ceremony_id WHERE e.status='planned'`).map((r) => r.candidate_id);
    const pool = q(candSelect + ` WHERE c.stage='Recommended' AND c.status='active'`).filter((c) => {
      const r = lastGuruResponse(c.id);
      return r && r.response === 'accepted' && !attachedIds.includes(c.id);
    }).map((c) => ({ id: c.id, name: c.name, guru_id: c.guru_id, guru_name: c.guru_name, track: c.track }));
    res.json({ ceremonies: list, pool, gurus: q('SELECT * FROM gurus ORDER BY id') });
  });
  app.post('/api/ceremonies', need('admin'), (req, res) => {
    const g = one('SELECT id FROM gurus WHERE id=?', Number(req.body.guru_id));
    if (!g) return fail(res, 'Choose a guru');
    const track = req.body.track === 'second' ? 'second' : 'first';
    const id = run('INSERT INTO ceremonies (guru_id, track, venue, date, status) VALUES (?,?,?,?,?)', g.id, track, req.body.venue || 'Temple hall', date(req.body.date), 'planned').lastInsertRowid;
    audit(req, null, 'ceremony_created', `Ceremony ${id} planned`);
    res.json({ id });
  });
  app.post('/api/ceremonies/:id/update', need('admin'), (req, res) => {
    const e = one(`SELECT * FROM ceremonies WHERE id=? AND status='planned'`, Number(req.params.id));
    if (!e) return fail(res, 'Not found', 404);
    const d = req.body.date ? date(req.body.date) : null;
    if (req.body.date && !d) return fail(res, 'Give the date as YYYY-MM-DD');
    run('UPDATE ceremonies SET date=?, venue=? WHERE id=?', d, req.body.venue || e.venue, e.id);
    res.json({ ok: true });
  });
  app.post('/api/ceremonies/:id/attach', need('admin'), (req, res) => {
    const e = one(`SELECT * FROM ceremonies WHERE id=? AND status='planned'`, Number(req.params.id));
    const c = one('SELECT * FROM candidates WHERE id=?', Number(req.body.candidate_id));
    if (!e || !c) return fail(res, 'Not found', 404);
    const r = lastGuruResponse(c.id);
    if (c.stage !== 'Recommended' || !r || r.response !== 'accepted') return fail(res, "Only candidates the guru's office has accepted can be attached");
    if (c.guru_id !== e.guru_id) return fail(res, 'This candidate is accepted by a different guru');
    if (c.track !== e.track) return fail(res, 'This ceremony is for a different kind of initiation');
    if (one(`SELECT 1 FROM ceremony_candidates cc JOIN ceremonies x ON x.id=cc.ceremony_id WHERE cc.candidate_id=? AND x.status='planned'`, c.id)) return fail(res, 'Already attached to another ceremony');
    run('INSERT INTO ceremony_candidates (ceremony_id, candidate_id) VALUES (?,?)', e.id, c.id);
    audit(req, c.id, 'ceremony', `Attached to ceremony ${e.id}`);
    res.json({ ok: true });
  });
  app.post('/api/ceremonies/:id/detach', need('admin'), (req, res) => {
    const e = one(`SELECT * FROM ceremonies WHERE id=? AND status='planned'`, Number(req.params.id));
    if (!e) return fail(res, 'Not found', 404);
    run('DELETE FROM ceremony_candidates WHERE ceremony_id=? AND candidate_id=?', e.id, Number(req.body.candidate_id));
    audit(req, Number(req.body.candidate_id), 'ceremony', `Removed from ceremony ${e.id}`);
    res.json({ ok: true });
  });
  app.post('/api/ceremonies/:id/attendance', need('admin'), (req, res) => {
    const e = one(`SELECT * FROM ceremonies WHERE id=? AND status='planned'`, Number(req.params.id));
    if (!e) return fail(res, 'Not found', 404);
    run('UPDATE ceremony_candidates SET present=?, spiritual_name=COALESCE(?, spiritual_name) WHERE ceremony_id=? AND candidate_id=?',
      req.body.present ? 1 : 0, req.body.spiritual_name === undefined ? null : String(req.body.spiritual_name).trim() || null, e.id, Number(req.body.candidate_id));
    res.json({ ok: true });
  });
  app.post('/api/ceremonies/:id/complete', need('admin'), (req, res) => {
    const e = one(`SELECT * FROM ceremonies WHERE id=? AND status='planned'`, Number(req.params.id));
    if (!e) return fail(res, 'Not found', 404);
    if (!e.date) return fail(res, 'Set the ceremony date first');
    const present = q('SELECT cc.*, c.name FROM ceremony_candidates cc JOIN candidates c ON c.id=cc.candidate_id WHERE cc.ceremony_id=? AND cc.present=1', e.id);
    if (!present.length) return fail(res, 'Mark who attended first');
    const missing = present.filter((p) => !p.spiritual_name);
    if (missing.length) return fail(res, 'Enter a spiritual name for: ' + missing.map((m) => m.name).join(', '));
    const tx = db.transaction(() => {
      present.forEach((p) => {
        const c = one('SELECT * FROM candidates WHERE id=?', p.candidate_id);
        run('INSERT INTO register (candidate_id, name, spiritual_name, track, guru_id, ceremony_id, date) VALUES (?,?,?,?,?,?,?)', c.id, c.name, p.spiritual_name, e.track, e.guru_id, e.id, e.date);
        run(`UPDATE candidates SET stage='Initiated', stage_since=?, spiritual_name=?, first_initiation_date=COALESCE(first_initiation_date, ?) WHERE id=?`, R.today(), p.spiritual_name, e.date, c.id);
        audit(req, c.id, 'initiated', 'Ceremony completed; register entry written');
      });
      run('DELETE FROM ceremony_candidates WHERE ceremony_id=? AND present=0', e.id);
      run(`UPDATE ceremonies SET status='completed' WHERE id=?`, e.id);
    });
    tx();
    res.json({ ok: true, written: present.length });
  });

  // ---------- register ----------
  function registerRows(query) {
    let rows = q(`SELECT r.*, g.name AS guru_name FROM register r JOIN gurus g ON g.id=r.guru_id ORDER BY r.date DESC, r.id DESC`);
    if (query.q) rows = rows.filter((r) => (r.name + ' ' + r.spiritual_name).toLowerCase().includes(String(query.q).toLowerCase()));
    if (query.guru) rows = rows.filter((r) => String(r.guru_id) === String(query.guru));
    if (query.track) rows = rows.filter((r) => r.track === query.track);
    return rows;
  }
  app.get('/api/register', need('president', 'admin', 'committee'), (req, res) => res.json({ rows: registerRows(req.query), gurus: q('SELECT * FROM gurus ORDER BY id') }));
  app.get('/api/register.csv', need('president', 'admin', 'committee'), (req, res) => {
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = ['Date,Name,Spiritual name,Initiation,Guru,Ceremony'];
    registerRows(req.query).forEach((r) => lines.push([r.date, r.name, r.spiritual_name, r.track, r.guru_name, r.ceremony_id].map(esc).join(',')));
    res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="register.csv"').send(lines.join('\n'));
  });
  app.get('/api/register.pdf', need('president', 'admin', 'committee'), async (req, res) => {
    const buf = await pdf.registerPdf(registerRows(req.query));
    res.type('pdf').setHeader('Content-Disposition', 'inline; filename="register.pdf"').send(buf);
  });

  // ---------- mentor notes feed ----------
  app.get('/api/notes', need('mentor'), (req, res) => {
    const rows = q(`SELECT n.*, c.name AS candidate_name, c.id AS cid FROM notes n JOIN candidates c ON c.id=n.candidate_id
      WHERE c.mentor_id=? ORDER BY n.id DESC LIMIT 40`, req.user.mentor_id);
    res.json(rows);
  });
  app.get('/api/meta', (_req, res) => res.json({ today: R.today(), stages: STAGES, gurus: q('SELECT * FROM gurus ORDER BY id'), mentors: q('SELECT * FROM mentors ORDER BY id'), doc_labels: R.DOC_LABELS }));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const db = open();
  if (!db.prepare('SELECT COUNT(*) n FROM users').get().n) { seed(db); console.log('Loaded fabricated sample data.'); }
  const port = Number(process.env.PORT) || 3000;
  createApp(db).listen(port, () => console.log(`Prototype running at http://localhost:${port}`));
}
