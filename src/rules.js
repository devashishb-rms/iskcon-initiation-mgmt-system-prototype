// Rule engine. Pure functions: no database access, so it can be tested alone.
// The engine only reports what the record shows. It never approves anyone.

const STATUS = { MET: 'met', UNKNOWN: 'unknown', NOT_MET: 'not_met', LATER: 'later', EXCEPTION: 'exception' };

const today = () => process.env.PROTO_TODAY || new Date().toISOString().slice(0, 10);

function addMonths(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// Time-based rule: has `months` months passed since `since`?
function timeRule(since, months, now) {
  if (!since) return { status: STATUS.UNKNOWN };
  const due = addMonths(since, months);
  return due <= now ? { status: STATUS.MET, due } : { status: STATUS.NOT_MET, due };
}

/**
 * Build the checklist for one candidate against one published rule version.
 * ctx = { docs: [{doc_type}], exceptions: [{rule_id, reason}], approved: bool, now?: 'YYYY-MM-DD' }
 */
function evaluate(c, rv, ctx = {}) {
  const now = ctx.now || today();
  const docs = ctx.docs || [];
  const exc = ctx.exceptions || [];
  const hasDoc = (t) => docs.some((d) => d.doc_type === t);
  const items = [];

  const add = (id, label, res) => {
    const item = { id, label, status: res.status, detail: res.detail || '', source: res.source || '', due: res.due || null };
    const e = exc.find((x) => x.rule_id === id);
    if (e && (item.status === STATUS.NOT_MET || item.status === STATUS.UNKNOWN)) {
      item.original_status = item.status;
      item.status = STATUS.EXCEPTION;
      item.detail = 'Exception recorded: ' + e.reason;
      item.source = 'Committee exception';
    }
    items.push(item);
  };

  const second = c.track === 'second';

  // R-1: practice standard, confirmed by the mentor with a start date
  {
    const r = timeRule(c.practice_since, rv.practice_months, now);
    const label = second
      ? `Practice standard kept (${rv.practice_months} months)`
      : `Chanting and four regulative principles, previous ${rv.practice_months} months`;
    if (r.status === STATUS.UNKNOWN) r.detail = 'Mentor has not confirmed a start date';
    else if (r.status === STATUS.MET) { r.detail = `Confirmed by mentor since ${c.practice_since}`; r.source = 'Mentor confirmation'; }
    else r.detail = `Confirmed since ${c.practice_since}; reaches ${rv.practice_months} months on ${r.due}`;
    add('R-1', label, r);
  }

  if (!second) {
    // R-2: accepted in shelter for longer than N months
    {
      const r = timeRule(c.shelter_date, rv.shelter_months, now);
      const label = `Accepted in shelter, more than ${rv.shelter_months} months`;
      if (r.status === STATUS.UNKNOWN) r.detail = 'Shelter date not recorded';
      else if (r.status === STATUS.MET) { r.detail = `Shelter date ${c.shelter_date} recorded by the temple`; r.source = 'Temple record'; }
      else r.detail = `Shelter since ${c.shelter_date}; reaches ${rv.shelter_months} months on ${r.due}`;
      add('R-2', label, r);
    }
    // R-3: prescribed examination
    if (rv.exam_required) {
      let r;
      if (c.exam_status === 'passed') r = { status: STATUS.MET, detail: 'Pass recorded', source: 'Temple record' };
      else if (c.exam_status === 'not_taken') r = { status: STATUS.NOT_MET, detail: 'Not taken yet' };
      else if (c.exam_status === 'failed') r = { status: STATUS.NOT_MET, detail: 'Not passed yet' };
      else r = { status: STATUS.UNKNOWN, detail: 'No result recorded yet' };
      add('R-3', 'Prescribed examination passed', r);
    }
  } else {
    // R-6: more than N months since first initiation
    const r = timeRule(c.first_initiation_date, rv.second_gap_months, now);
    if (r.status === STATUS.UNKNOWN) r.detail = 'First initiation date not recorded';
    else if (r.status === STATUS.MET) { r.detail = `First initiated ${c.first_initiation_date}`; r.source = 'Register'; }
    else r.detail = `First initiated ${c.first_initiation_date}; reaches ${rv.second_gap_months} months on ${r.due}`;
    add('R-6', `More than ${rv.second_gap_months} months since first initiation`, r);
  }

  // R-4: Disciples Course (certificate on file)
  if (rv.course_required) {
    let r;
    if (c.course_complete === 1 && hasDoc('course_certificate')) r = { status: STATUS.MET, detail: 'Certificate on file', source: 'Uploaded certificate' };
    else if (c.course_complete === 1) r = { status: STATUS.UNKNOWN, detail: 'Marked complete; certificate not uploaded' };
    else if (c.course_complete === 0) r = { status: STATUS.NOT_MET, detail: 'Course not complete' };
    else r = { status: STATUS.UNKNOWN, detail: 'Nobody has recorded this yet' };
    add('R-4', 'Disciples Course complete', r);
  }

  // R-5: temple president's written recommendation, produced by the system on approval
  if (rv.letter_required) {
    add('R-5', 'Temple president recommendation',
      ctx.approved
        ? { status: STATUS.MET, detail: 'Letter generated', source: 'Recommendation record' }
        : { status: STATUS.LATER, detail: 'Letter is generated when the president approves' });
  }

  // Only R-5 is produced by the approval itself; everything else must hold before approving.
  const blockers = items.filter((i) => i.id !== 'R-5' && i.status !== STATUS.MET && i.status !== STATUS.EXCEPTION);
  const required = JSON.parse(rv.required_docs || '[]');
  const missingDocs = required.filter((t) => !hasDoc(t));

  const counts = { met: 0, unknown: 0, not_met: 0, later: 0, exception: 0 };
  items.forEach((i) => counts[i.status]++);
  // Worst status shown on lists: a failed item outranks an unchecked one.
  const worst = counts.not_met ? 'not_met' : counts.unknown ? 'unknown' : 'met';
  const checkable = items.filter((i) => i.id !== 'R-5');
  const metCount = checkable.filter((i) => i.status === STATUS.MET || i.status === STATUS.EXCEPTION).length;

  return {
    items,
    blockers,
    canApprove: blockers.length === 0,
    missingDocs,
    counts,
    worst,
    summary: { met: metCount, total: checkable.length },
  };
}

const DOC_LABELS = {
  shelter_acceptance: 'Shelter acceptance',
  exam_result: 'Examination result',
  course_certificate: 'Disciples Course certificate',
  other: 'Other document',
};

// Rule-set validation: a guru's office may raise the floor, never lower it.
const NUMERIC = ['practice_months', 'shelter_months', 'second_gap_months', 'change_guru_months'];
const FLAGS = ['exam_required', 'course_required', 'letter_required'];

function checkAgainstFloor(draft, floor) {
  const errors = [];
  NUMERIC.forEach((k) => {
    const v = Number(draft[k]);
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) errors.push(`${k.replace(/_/g, ' ')} must be a whole number of months`);
    else if (v < floor[k]) errors.push(`${k.replace(/_/g, ' ')} is ${v}; the GBC baseline needs at least ${floor[k]}`);
  });
  FLAGS.forEach((k) => {
    if (floor[k] && !draft[k]) errors.push(`${k.replace(/_/g, ' ')} cannot be turned off; the GBC baseline requires it`);
  });
  return errors;
}

module.exports = { evaluate, addMonths, today, checkAgainstFloor, STATUS, DOC_LABELS, NUMERIC, FLAGS };
