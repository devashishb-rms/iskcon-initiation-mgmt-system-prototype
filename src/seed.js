// Fabricated sample data. Every name, date and note here is invented for the prototype.
// Dates are relative to "today" so the checklists always look realistic.
const { addMonths, today } = require('./rules');

function daysAgo(n) {
  const d = new Date(today() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const monthsAgo = (n) => addMonths(today(), -n);
const ts = (date) => date + 'T10:00:00.000Z';

function seed(db) {
  const tables = ['audit', 'register', 'ceremony_candidates', 'ceremonies', 'guru_responses', 'recommendations',
    'exceptions', 'notes', 'documents', 'users', 'candidates', 'rule_versions', 'rule_sets', 'gurus', 'mentors'];
  db.pragma('foreign_keys = OFF');
  tables.forEach((t) => db.exec(`DELETE FROM ${t}`));
  db.pragma('foreign_keys = ON');

  const run = (sql, ...p) => db.prepare(sql).run(...p).lastInsertRowid;

  // People who guide
  const gA = run('INSERT INTO gurus (name) VALUES (?)', 'HH Radhanath Swami Maharaj');
  const gB = run('INSERT INTO gurus (name) VALUES (?)', 'HH Lokanath Swami Maharaj');
  const gC = run('INSERT INTO gurus (name) VALUES (?)', 'HH Bhakti Ashray Vaishnav Swami Maharaj');
  const gD = run('INSERT INTO gurus (name) VALUES (?)', 'HH Jayapataka Swami Maharaj');
  const m1 = run('INSERT INTO mentors (name, phone) VALUES (?,?)', 'Mohan Biswas', '90000 10001');
  const m2 = run('INSERT INTO mentors (name, phone) VALUES (?,?)', 'Kalyan Dutta', '90000 10002');

  // Rule sets: GBC baseline + one per guru, with version history
  const rsBase = run('INSERT INTO rule_sets (guru_id, name) VALUES (NULL, ?)', 'GBC baseline');
  const rsA = run('INSERT INTO rule_sets (guru_id, name) VALUES (?, ?)', gA, 'Radhanath Swami rules');
  const rsB = run('INSERT INTO rule_sets (guru_id, name) VALUES (?, ?)', gB, 'Lokanath Swami rules');
  const rsC = run('INSERT INTO rule_sets (guru_id, name) VALUES (?, ?)', gC, 'Bhakti Ashray Vaishnav Swami rules');
  const rsD = run('INSERT INTO rule_sets (guru_id, name) VALUES (?, ?)', gD, 'Jayapataka Swami rules');
  const rv = (rs, version, status, o, note, by, when) => run(
    `INSERT INTO rule_versions (rule_set_id, version, status, practice_months, shelter_months, exam_required, course_required,
      letter_required, second_gap_months, change_guru_months, required_docs, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    rs, version, status, o.practice, o.shelter, 1, o.course ? 1 : 0, 1, 12, 6,
    JSON.stringify(o.docs), note, by, ts(when));
  const baseDocs1 = ['shelter_acceptance', 'exam_result'];
  const baseDocs3 = ['shelter_acceptance', 'exam_result', 'course_certificate'];
  rv(rsBase, 1, 'published', { practice: 12, shelter: 6, course: false, docs: baseDocs1 }, 'First version of the baseline from the 1993 GBC resolutions', 'Administrator', monthsAgo(14));
  rv(rsBase, 2, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs1 }, 'Added the Disciples Course rule', 'Administrator', monthsAgo(10));
  rv(rsBase, 3, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs3 }, 'Added the Disciples Course certificate to required documents', 'Administrator', monthsAgo(8));
  rv(rsA, 1, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs3 }, 'Created from the GBC baseline', 'Administrator', monthsAgo(8));
  rv(rsA, 2, 'published', { practice: 12, shelter: 12, course: true, docs: baseDocs3 }, 'Time in shelter raised from 6 to 12 months (illustrative sample value)', 'Administrator', monthsAgo(5));
  rv(rsA, 3, 'draft', { practice: 12, shelter: 12, course: true, docs: baseDocs3 }, 'Draft of the next version', 'Administrator', daysAgo(3));
  const rvB1 = rv(rsB, 1, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs3 }, 'Created from the GBC baseline', 'Administrator', monthsAgo(8));
  rv(rsC, 1, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs3 }, 'Created from the GBC baseline', 'Administrator', monthsAgo(8));
  rv(rsD, 1, 'published', { practice: 12, shelter: 6, course: true, docs: baseDocs3 }, 'Created from the GBC baseline', 'Administrator', monthsAgo(8));
  const rvA2 = db.prepare('SELECT id FROM rule_versions WHERE rule_set_id=? AND version=2').get(rsA).id;
  const rvBase3 = db.prepare('SELECT id FROM rule_versions WHERE rule_set_id=? AND version=3').get(rsBase).id;

  // Candidates
  const cand = (o) => run(
    `INSERT INTO candidates (name, phone, group_name, mentor_id, guru_id, track, stage, status, shelter_date, practice_since,
      exam_status, course_complete, first_initiation_date, spiritual_name, consent_at, created_at, stage_since)
     VALUES (@name,@phone,@group,@mentor,@guru,@track,@stage,@status,@shelter,@practice,@exam,@course,@first,@spiritual,@consent,@created,@since)`,
    {
      name: o.name, phone: o.phone || null, group: o.group || 'Newtown sanga', mentor: o.mentor, guru: o.guru,
      track: o.track || 'first', stage: o.stage, status: o.status || 'active',
      shelter: o.shelter ?? null, practice: o.practice ?? null, exam: o.exam ?? null, course: o.course ?? null,
      first: o.first ?? null, spiritual: o.spiritual ?? null,
      consent: ts(monthsAgo(o.age || 12)), created: ts(monthsAgo(o.age || 12)), since: o.since || daysAgo(10),
    });

  const C = {};
  // Mohan Biswas's candidates
  C.rahul = cand({ name: 'Rahul Das', mentor: m1, guru: gA, stage: 'Preparing', shelter: monthsAgo(13), practice: monthsAgo(11), exam: 'passed', course: 1, since: daysAgo(40), phone: '90000 20001' });
  C.priya = cand({ name: 'Priya Ghosh', mentor: m1, guru: gA, stage: 'Preparing', shelter: monthsAgo(15), practice: monthsAgo(14), exam: 'passed', course: 1, since: daysAgo(30), phone: '90000 20002' });
  C.subir = cand({ name: 'Subir Roy', mentor: m1, guru: gC, stage: 'Shelter', shelter: monthsAgo(3), practice: null, exam: null, course: null, since: daysAgo(90), phone: '90000 20003' });
  C.meera = cand({ name: 'Meera Nandi', mentor: m1, guru: gD, stage: 'Aspiring', age: 5, since: monthsAgo(5), phone: '90000 20004' });
  C.arjun = cand({ name: 'Arjun Paul', mentor: m1, guru: gA, stage: 'Applied', shelter: monthsAgo(16), practice: monthsAgo(15), exam: 'passed', course: 1, since: daysAgo(2), phone: '90000 20005' });
  C.ananya = cand({ name: 'Ananya Sen', mentor: m1, guru: gA, stage: 'Preparing', shelter: monthsAgo(14), practice: monthsAgo(14), exam: 'not_taken', course: 1, since: daysAgo(60), phone: '90000 20006' });
  // Kalyan Dutta's candidates
  C.sneha = cand({ name: 'Sneha Basu', mentor: m2, guru: gB, stage: 'Applied', shelter: monthsAgo(11), practice: monthsAgo(14), exam: 'passed', course: 1, since: daysAgo(4), phone: '90000 20007' });
  C.kavya = cand({ name: 'Kavya Mitra', mentor: m2, guru: gA, stage: 'Applied', shelter: monthsAgo(15), practice: monthsAgo(13), exam: null, course: 1, since: daysAgo(6), phone: '90000 20008' });
  C.tapan = cand({ name: 'Tapan Saha', mentor: m2, guru: gB, track: 'second', stage: 'Applied', first: monthsAgo(20), practice: monthsAgo(16), course: 1, since: daysAgo(9), phone: '90000 20009', age: 30 });
  C.debashis = cand({ name: 'Debashis Lahiri', mentor: m2, guru: gA, stage: 'Applied', shelter: monthsAgo(14), practice: monthsAgo(13), exam: null, course: 0, since: daysAgo(12), phone: '90000 20010' });
  C.nandini = cand({ name: 'Nandini Chaudhuri', mentor: m2, guru: gA, stage: 'Recommended', shelter: monthsAgo(18), practice: monthsAgo(17), exam: 'passed', course: 1, since: daysAgo(14), phone: '90000 20011' });
  C.pallab = cand({ name: 'Pallab Sarkar', mentor: m1, guru: gA, stage: 'Recommended', shelter: monthsAgo(20), practice: monthsAgo(18), exam: 'passed', course: 1, since: daysAgo(25), phone: '90000 20012' });
  C.isha = cand({ name: 'Isha Banerjee', mentor: m2, guru: gA, stage: 'Recommended', shelter: monthsAgo(19), practice: monthsAgo(16), exam: 'passed', course: 1, since: daysAgo(22), phone: '90000 20013' });
  C.rina = cand({ name: 'Rina Mondal', mentor: m2, guru: gB, stage: 'Recommended', shelter: monthsAgo(15), practice: monthsAgo(15), exam: 'passed', course: 1, since: daysAgo(20), phone: '90000 20014' });
  // Already initiated
  C.joydeep = cand({ name: 'Joydeep Ghosh', mentor: m1, guru: gA, stage: 'Initiated', first: monthsAgo(2), spiritual: 'Sample spiritual name 1', age: 30 });
  C.lakshmi = cand({ name: 'Lakshmi Kar', mentor: m2, guru: gA, stage: 'Initiated', first: monthsAgo(2), spiritual: 'Sample spiritual name 2', age: 30 });
  C.biswajit = cand({ name: 'Biswajit Roy', mentor: m2, guru: gB, stage: 'Initiated', first: monthsAgo(9), spiritual: 'Sample spiritual name 3', age: 36 });
  C.sourav = cand({ name: 'Sourav Dey', mentor: m1, guru: gB, stage: 'Initiated', first: monthsAgo(9), spiritual: 'Sample spiritual name 4', age: 36 });
  db.prepare('UPDATE candidates SET first_initiation_date=? WHERE id=?').run(monthsAgo(20), C.tapan);
  db.prepare('UPDATE candidates SET stage=?, stage_since=? WHERE id=?').run('Applied', daysAgo(9), C.tapan);

  // Sign-in users (prototype sign-in is a picker; there is no password)
  const user = (name, role, candidate_id, mentor_id) => run('INSERT INTO users (name, role, candidate_id, mentor_id) VALUES (?,?,?,?)', name, role, candidate_id || null, mentor_id || null);
  user('Ananya Sen', 'candidate', C.ananya);
  user('Rahul Das', 'candidate', C.rahul);
  user('Mohan Biswas', 'mentor', null, m1);
  user('Kalyan Dutta', 'mentor', null, m2);
  user('Temple president', 'president');
  user('Committee member', 'committee');
  user('Administrator', 'admin');

  // Documents (placeholder files: the prototype stores metadata and a small text stub)
  const fs = require('fs');
  const path = require('path');
  const { DATA_DIR } = require('./db');
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  const doc = (cid, type, name, when, by) => {
    const id = run('INSERT INTO documents (candidate_id, doc_type, filename, mime, size, uploaded_by, uploaded_at, path) VALUES (?,?,?,?,?,?,?,?)',
      cid, type, name, 'text/plain', 0, by, ts(when), '');
    const p = path.join('uploads', `${id}.txt`);
    const body = `Sample document (fabricated for the prototype)\nType: ${type}\nFile: ${name}\n`;
    fs.writeFileSync(path.join(DATA_DIR, p), body);
    db.prepare('UPDATE documents SET path=?, size=? WHERE id=?').run(p, body.length, id);
  };
  const fullSet = (cid, by, when) => {
    doc(cid, 'shelter_acceptance', 'shelter-acceptance.pdf', when, 'Temple office');
    doc(cid, 'exam_result', 'exam-result.pdf', when, 'Temple office');
    doc(cid, 'course_certificate', 'disciples-course-certificate.pdf', when, by);
  };
  [C.rahul, C.priya, C.arjun, C.sneha, C.nandini, C.pallab, C.isha, C.rina].forEach((id) => fullSet(id, 'Candidate', monthsAgo(1)));
  doc(C.ananya, 'shelter_acceptance', 'shelter-acceptance.pdf', monthsAgo(3), 'Temple office');
  doc(C.kavya, 'shelter_acceptance', 'shelter-acceptance.pdf', monthsAgo(3), 'Temple office');
  doc(C.kavya, 'course_certificate', 'disciples-course-certificate.pdf', monthsAgo(2), 'Candidate');
  doc(C.tapan, 'course_certificate', 'disciples-course-certificate.pdf', monthsAgo(2), 'Candidate');
  doc(C.debashis, 'shelter_acceptance', 'shelter-acceptance.pdf', monthsAgo(3), 'Temple office');

  // Notes
  const note = (cid, kind, body, author, when) => run('INSERT INTO notes (candidate_id, kind, body, author, created_at) VALUES (?,?,?,?,?)', cid, kind, body, author, ts(when));
  note(C.arjun, 'readiness', 'Steady chanting and regular attendance at the morning programme. Ready to apply.', 'Mohan Biswas', daysAgo(2));
  note(C.sneha, 'readiness', 'Completed everything asked and serves in the kitchen every Sunday.', 'Kalyan Dutta', daysAgo(4));
  note(C.kavya, 'readiness', 'Consistent practice. The examination result has not reached me yet.', 'Kalyan Dutta', daysAgo(6));
  note(C.tapan, 'readiness', 'Has kept the standards since first initiation and attends weekly classes.', 'Kalyan Dutta', daysAgo(9));
  note(C.debashis, 'readiness', 'Chants steadily and attends the morning programme. Has completed most of the Disciples Course but has not yet handed in the certificate.', 'Kalyan Dutta', daysAgo(12));
  note(C.meera, 'monthly', 'Met once this quarter. Wants to come to the weekly programme more often.', 'Mohan Biswas', monthsAgo(2));
  note(C.rahul, 'monthly', 'Chanting 16 rounds daily. Helping with the Sunday programme.', 'Mohan Biswas', daysAgo(40));
  note(C.ananya, 'monthly', 'Doing well. Needs to take the examination.', 'Mohan Biswas', daysAgo(25));
  note(C.ananya, 'message', 'Hare Krishna Prabhuji, I have the course certificate and will upload it today.', 'Ananya Sen', daysAgo(1));

  // Recommendations, guru answers, audit trail for people already past the president
  const audit = (cid, action, detail, actor, when, rvId) => run('INSERT INTO audit (at, actor, candidate_id, action, detail, rule_version_id) VALUES (?,?,?,?,?,?)', ts(when), actor, cid, action, detail, rvId || null);
  const approve = (cid, rvId, when) => run('INSERT INTO recommendations (candidate_id, decision, reason, by_name, rule_version_id, created_at) VALUES (?,?,?,?,?,?)', cid, 'approve', null, 'Temple president', rvId, ts(when));
  [[C.nandini, rvA2, 14], [C.pallab, rvA2, 25], [C.isha, rvA2, 22], [C.rina, rvB1, 20]].forEach(([cid, v, d]) => {
    approve(cid, v, daysAgo(d));
    audit(cid, 'recommended', 'Temple president approved and generated the recommendation letter', 'Temple president', daysAgo(d), v);
  });
  const sendBack = (cid, reason, when) => {
    run('INSERT INTO recommendations (candidate_id, decision, reason, by_name, rule_version_id, created_at) VALUES (?,?,?,?,?,?)', cid, 'sendback', reason, 'Temple president', rvA2, ts(when));
    audit(cid, 'recommended_sendback', `Temple president sent the file back: ${reason}`, 'Temple president', when, rvA2);
  };
  sendBack(C.ananya, 'Please upload the Disciples Course certificate and the examination result.', daysAgo(20));
  sendBack(C.rahul, 'Practice start date is 11 months ago. Please submit again once 12 months are complete.', daysAgo(15));
  const answer = (cid, resp, when) => {
    run('INSERT INTO guru_responses (candidate_id, response, reason, by_name, created_at) VALUES (?,?,?,?,?)', cid, resp, null, 'Committee member', ts(when));
    audit(cid, 'guru_response', `Guru's office answered: ${resp}`, 'Committee member', when);
  };
  answer(C.pallab, 'accepted', daysAgo(12));
  answer(C.isha, 'accepted', daysAgo(10));
  answer(C.rina, 'accepted', daysAgo(9));
  audit(C.nandini, 'package_exported', 'Package for the guru\'s office exported', 'Committee member', daysAgo(10));

  // General timeline for everyone
  Object.values(C).forEach((cid) => {
    const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(cid);
    audit(cid, 'created', 'Profile created and consent recorded', 'Committee member', c.created_at.slice(0, 10));
    if (c.shelter_date) audit(cid, 'shelter', `Shelter date recorded: ${c.shelter_date}`, 'Committee member', c.shelter_date);
    if (c.stage === 'Applied') audit(cid, 'applied', 'Mentor submitted the readiness note; file sent to the temple president', 'Mentor', c.stage_since);
  });
  audit(C.debashis, 'exception_note', 'File reviewed by the committee; waiting for the certificate and examination result', 'Committee member', daysAgo(8));

  // Ceremonies
  const cer = (guru, track, venue, date, status) => run('INSERT INTO ceremonies (guru_id, track, venue, date, status) VALUES (?,?,?,?,?)', guru, track, venue, date, status);
  const cerDone1 = cer(gA, 'first', 'Temple hall', monthsAgo(2), 'completed');
  const cerDone2 = cer(gB, 'first', 'Temple hall', monthsAgo(9), 'completed');
  const cerPlan1 = cer(gA, 'first', 'Temple hall', null, 'planned');
  cer(gB, 'second', 'Temple hall', null, 'planned');
  const regRow = (cid, name, sp, track, guru, cerId, date) => {
    run('INSERT INTO ceremony_candidates (ceremony_id, candidate_id, present, spiritual_name) VALUES (?,?,1,?)', cerId, cid, sp);
    run('INSERT INTO register (candidate_id, name, spiritual_name, track, guru_id, ceremony_id, date) VALUES (?,?,?,?,?,?,?)', cid, name, sp, track, guru, cerId, date);
    audit(cid, 'initiated', 'Ceremony completed; register entry written', 'Administrator', date);
  };
  regRow(C.joydeep, 'Joydeep Ghosh', 'Sample spiritual name 1', 'first', gA, cerDone1, monthsAgo(2));
  regRow(C.lakshmi, 'Lakshmi Kar', 'Sample spiritual name 2', 'first', gA, cerDone1, monthsAgo(2));
  regRow(C.biswajit, 'Biswajit Roy', 'Sample spiritual name 3', 'first', gB, cerDone2, monthsAgo(9));
  regRow(C.sourav, 'Sourav Dey', 'Sample spiritual name 4', 'first', gB, cerDone2, monthsAgo(9));
  // Tapan's first initiation, 20 months ago (an older ceremony)
  const cerOld = cer(gB, 'first', 'Temple hall', monthsAgo(20), 'completed');
  regRow(C.tapan, 'Tapan Saha', 'Sample spiritual name 5', 'first', gB, cerOld, monthsAgo(20));
  db.prepare('UPDATE candidates SET spiritual_name=? WHERE id=?').run('Sample spiritual name 5', C.tapan);
  // Two attached to the planned ceremony with Guru A
  run('INSERT INTO ceremony_candidates (ceremony_id, candidate_id, present, spiritual_name) VALUES (?,?,0,NULL)', cerPlan1, C.pallab);
  run('INSERT INTO ceremony_candidates (ceremony_id, candidate_id, present, spiritual_name) VALUES (?,?,0,NULL)', cerPlan1, C.isha);
  audit(C.pallab, 'ceremony', 'Attached to a planned first initiation', 'Administrator', daysAgo(8));
  audit(C.isha, 'ceremony', 'Attached to a planned first initiation', 'Administrator', daysAgo(8));

  return { candidates: Object.keys(C).length };
}

module.exports = { seed };

if (require.main === module) {
  const { open } = require('./db');
  const db = open();
  const r = seed(db);
  console.log(`Seeded ${r.candidates} sample candidates.`);
}
