const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/rules');

const rv = { practice_months: 12, shelter_months: 6, exam_required: 1, course_required: 1, letter_required: 1, second_gap_months: 12, change_guru_months: 6, required_docs: '["shelter_acceptance","exam_result","course_certificate"]' };
const NOW = '2026-10-11';
const base = { track: 'first', practice_since: '2025-09-01', shelter_date: '2026-01-01', exam_status: 'passed', course_complete: 1 };
const docs = [{ doc_type: 'course_certificate' }];
const ev = (c, o = {}) => R.evaluate({ ...base, ...c }, rv, { now: NOW, docs, exceptions: [], ...o });
const st = (r, id) => r.items.find((i) => i.id === id).status;

test('addMonths clamps to the end of a short month', () => {
  assert.equal(R.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(R.addMonths('2026-10-11', -12), '2025-10-11');
});
test('a complete record has every item met and can be approved', () => {
  const r = ev({});
  assert.deepEqual(r.items.map((i) => i.status), ['met', 'met', 'met', 'met', 'later']);
  assert.equal(r.canApprove, true);
});
test('unknown is not failed: a missing exam result is unknown and still blocks approval', () => {
  const r = ev({ exam_status: null });
  assert.equal(st(r, 'R-3'), 'unknown');
  assert.equal(r.canApprove, false);
  assert.equal(r.worst, 'unknown');
});
test('a failed item outranks an unknown one on lists', () => {
  const r = ev({ exam_status: null, practice_since: '2026-06-01' });
  assert.equal(st(r, 'R-1'), 'not_met');
  assert.equal(r.worst, 'not_met');
});
test('time rule reports the date it will be met', () => {
  const r = ev({ practice_since: '2026-03-11' });
  assert.equal(r.items[0].status, 'not_met');
  assert.equal(r.items[0].due, '2027-03-11');
});
test('exactly 12 months counts as met', () => {
  assert.equal(st(ev({ practice_since: '2025-10-11' }), 'R-1'), 'met');
  assert.equal(st(ev({ practice_since: '2025-10-12' }), 'R-1'), 'not_met');
});
test('course marked complete but no certificate is unknown, not failed', () => {
  const r = ev({}, { docs: [] });
  assert.equal(st(r, 'R-4'), 'unknown');
});
test('an exception turns a failed or unknown item into an exception and unblocks approval', () => {
  const r = ev({ course_complete: 0 }, { exceptions: [{ rule_id: 'R-4', reason: 'Waived for illness' }] });
  assert.equal(st(r, 'R-4'), 'exception');
  assert.equal(r.canApprove, true);
});
test('an exception never hides a rule that is already met', () => {
  const r = ev({}, { exceptions: [{ rule_id: 'R-1', reason: 'x' }] });
  assert.equal(st(r, 'R-1'), 'met');
});
test('a stricter guru rule set changes the result without code changes', () => {
  const strict = { ...rv, shelter_months: 12 };
  const r = R.evaluate({ ...base, shelter_date: '2026-01-01' }, strict, { now: NOW, docs, exceptions: [] });
  assert.equal(st(r, 'R-2'), 'not_met');
});
test('second initiation uses the gap since first initiation', () => {
  const second = { track: 'second', practice_since: '2025-01-01', first_initiation_date: '2026-01-01', course_complete: 1 };
  const r = R.evaluate(second, rv, { now: NOW, docs, exceptions: [] });
  assert.deepEqual(r.items.map((i) => i.id), ['R-1', 'R-6', 'R-4', 'R-5']);
  assert.equal(st(r, 'R-6'), 'not_met');
});
test('missing required documents are listed', () => {
  const r = ev({}, { docs: [] });
  assert.deepEqual(r.missingDocs, ['shelter_acceptance', 'exam_result', 'course_certificate']);
});
test('the approval itself satisfies R-5', () => {
  assert.equal(st(ev({}, { approved: true }), 'R-5'), 'met');
});
test('a guru rule set cannot go below the GBC floor', () => {
  const floor = { practice_months: 12, shelter_months: 6, second_gap_months: 12, change_guru_months: 6, exam_required: 1, course_required: 1, letter_required: 1 };
  assert.deepEqual(R.checkAgainstFloor({ ...floor, shelter_months: 12 }, floor), []);
  assert.equal(R.checkAgainstFloor({ ...floor, shelter_months: 3 }, floor).length, 1);
  assert.equal(R.checkAgainstFloor({ ...floor, exam_required: 0 }, floor).length, 1);
  assert.equal(R.checkAgainstFloor({ ...floor, practice_months: 'abc' }, floor).length, 1);
});
