const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+; no native install step

const DATA_DIR = process.env.PROTO_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

function open(file) {
  const db = new DatabaseSync(file || path.join(DATA_DIR, 'initiation.db'));
  // Small compatibility layer so the rest of the code reads like a typical SQLite API.
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const st = prepare(sql);
    const run = st.run.bind(st);
    st.run = (...a) => { const r = run(...a); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; };
    return st;
  };
  db.pragma = (s) => db.exec('PRAGMA ' + s);
  db.transaction = (fn) => () => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
CREATE TABLE IF NOT EXISTS mentors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT);
CREATE TABLE IF NOT EXISTS gurus (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, group_name TEXT,
  mentor_id INTEGER REFERENCES mentors(id), guru_id INTEGER REFERENCES gurus(id),
  track TEXT NOT NULL DEFAULT 'first',                 -- first | second
  stage TEXT NOT NULL DEFAULT 'Aspiring',              -- Aspiring Shelter Preparing Applied Recommended Initiated
  status TEXT NOT NULL DEFAULT 'active',               -- active | declined
  shelter_date TEXT, practice_since TEXT,
  exam_status TEXT,                                    -- passed | failed | not_taken | NULL (unknown)
  course_complete INTEGER,                             -- 1 | 0 | NULL (unknown)
  first_initiation_date TEXT, spiritual_name TEXT,
  consent_at TEXT, created_at TEXT NOT NULL, stage_since TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,   -- candidate mentor president committee admin
  candidate_id INTEGER REFERENCES candidates(id), mentor_id INTEGER REFERENCES mentors(id)
);
CREATE TABLE IF NOT EXISTS rule_sets (id INTEGER PRIMARY KEY, guru_id INTEGER REFERENCES gurus(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rule_versions (
  id INTEGER PRIMARY KEY, rule_set_id INTEGER NOT NULL REFERENCES rule_sets(id), version INTEGER NOT NULL,
  status TEXT NOT NULL,                                -- draft | published
  practice_months INTEGER NOT NULL, shelter_months INTEGER NOT NULL,
  exam_required INTEGER NOT NULL, course_required INTEGER NOT NULL, letter_required INTEGER NOT NULL,
  second_gap_months INTEGER NOT NULL, change_guru_months INTEGER NOT NULL,
  required_docs TEXT NOT NULL, note TEXT, created_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id), doc_type TEXT NOT NULL,
  filename TEXT NOT NULL, mime TEXT, size INTEGER, uploaded_by TEXT, uploaded_at TEXT NOT NULL, path TEXT
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  kind TEXT NOT NULL,                                  -- monthly | readiness | message
  body TEXT NOT NULL, author TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exceptions (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  rule_id TEXT NOT NULL, reason TEXT NOT NULL, by_name TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  decision TEXT NOT NULL,                              -- approve | sendback | decline
  reason TEXT, by_name TEXT, rule_version_id INTEGER REFERENCES rule_versions(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guru_responses (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  response TEXT NOT NULL,                              -- accepted | wait | declined
  reason TEXT, by_name TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ceremonies (
  id INTEGER PRIMARY KEY, guru_id INTEGER NOT NULL REFERENCES gurus(id), track TEXT NOT NULL,
  venue TEXT, date TEXT, status TEXT NOT NULL DEFAULT 'planned'
);
CREATE TABLE IF NOT EXISTS ceremony_candidates (
  ceremony_id INTEGER NOT NULL REFERENCES ceremonies(id), candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  present INTEGER NOT NULL DEFAULT 0, spiritual_name TEXT, PRIMARY KEY (ceremony_id, candidate_id)
);
CREATE TABLE IF NOT EXISTS register (
  id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id), name TEXT NOT NULL,
  spiritual_name TEXT NOT NULL, track TEXT NOT NULL, guru_id INTEGER NOT NULL REFERENCES gurus(id),
  ceremony_id INTEGER REFERENCES ceremonies(id), date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, candidate_id INTEGER,
  action TEXT NOT NULL, detail TEXT, rule_version_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_audit_candidate ON audit(candidate_id);
`);
  return db;
}

module.exports = { open, DATA_DIR };
