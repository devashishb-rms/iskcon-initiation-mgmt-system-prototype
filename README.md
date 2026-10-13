# Initiation management: working prototype (ISKCON Newtown)

A working prototype of the seven MVP screens in the PRD, running on a real database and a real rule engine.
**Everything in it is invented sample data.** It is for the president, mentors and candidates to react to before the real build.

## Run it

Needs Node 22.13 or newer (the database is built into Node, so there is nothing native to compile).

```bash
npm install
npm start            # http://localhost:3000, loads the sample data on first run
```

Sign in by choosing a person (a real system would send a one-time code instead). The seven people are:

| Person | Role | Opens on |
| --- | --- | --- |
| Ananya Sen, Rahul Das | Candidate | My path |
| Mohan Biswas, Kalyan Dutta | Mentor | My candidates |
| Temple president | Temple president | Review queue |
| Committee member | Committee member | Candidates |
| Administrator | Administrator | Rule sets (has "Reset sample data") |

`npm run seed` reloads the sample data. `npm test` runs the rule-engine tests and an API walkthrough. `npm run e2e` drives the real browser UI (needs Python with Playwright and the server on port 3100: `PORT=3100 npm start`).

## Things worth trying

1. **Debashis Lahiri** (sign in as the president, Review queue): the approve option is greyed out and says why. Sign in as the committee member, record an exception for each unmet item, then return as the president: approval is now allowed and the checklist shows "Exception recorded".
2. **Priya Ghosh** (mentor Mohan Biswas): submit the readiness note. As the president, approve and open the generated letter (PDF). As the committee member, record that the guru's office accepted. As the administrator, attach her to the planned ceremony, mark attendance, enter spiritual names and complete: she appears in the register.
3. **Ananya Sen** (candidate): upload the Disciples Course certificate from the phone-sized page and watch the checklist and "next step" change. Switch to বাংলা.
4. **Rule sets** (administrator): lower a month count below the GBC floor and try to save; the server refuses. Raise it and publish: a new version is created and old recommendations keep the version they used.
5. **Export** a candidate package for the guru's office from the candidate file; with a required document missing it warns first and logs what was missing.

## What it does

| Screen | Role | Covers |
| --- | --- | --- |
| My path (+ Documents, Message mentor) | Candidate | FR-4, FR-5, FR-9, FR-10, NFR-4 |
| My candidates (+ Notes, Help) and the mentor's candidate file | Mentor | FR-3, FR-11, FR-21 |
| Review queue | President | FR-12, FR-21 |
| Candidate file and recommendation | President, committee | FR-3, FR-5, FR-6, FR-8, FR-12 to FR-16, FR-20 |
| Rule sets | Administrator | FR-7, R-1 to R-8 as configuration, versions, GBC floor |
| Ceremony planner | Administrator | FR-17, FR-18 |
| Register | President, administrator | FR-18, FR-22 (CSV and PDF) |

Also built: add a candidate with consent recorded (FR-1), the six stages with a second-initiation track (FR-2), a dated timeline and change log with the rule set version used (FR-3, NFR-6), a candidates list with filters and CSV export (FR-21, FR-22), role-based access enforced on the server (NFR-4), and a draft Bengali interface for the candidate and mentor screens (FR-24, partly).

## Rules the code enforces

- **The system never approves.** It shows a checklist. The president recommends; the guru's office answers; the committee records the answer.
- **Unknown is not failed.** Each item is Met, Needs confirming, Not met, Later or Exception recorded. A word, a shape and a colour show each one.
- **Approval is blocked** while any item is unmet or unconfirmed unless a committee member has recorded a written exception (the server refuses it too, not only the screen).
- **Rule values are data.** Month counts, required documents and on/off rules live in versioned rule sets. A guru's set can raise the GBC floor but never lower it.
- **A recommendation is pinned to the rule set version** used on the day.
- No Aadhaar, caste, varna, race, ethnicity or marital-status fields exist anywhere.

## Differences from the PRD and the drawings (decisions to confirm)

- **Who submits the application.** The PRD says the candidate applies; the drawings show the mentor's readiness note feeding the president's queue. The prototype follows the drawings: the mentor submits the readiness note and the file moves to Applied.
- **Guru names and rule values.** The four gurus' names are sample data you asked for. The rule values shown for each office are **illustrative and not their real requirements** (one office is shown with a 12-month shelter rule purely to demonstrate an override). The temple must enter each office's real rules.
- **Sign-in** is a person picker, not a one-time code. No second factor.
- **Documents** are stored on local disk in `data/uploads`. A real system needs private cloud storage in an Indian region.
- **Not built:** notifications (FR-19), spreadsheet import (FR-23), the Hindi interface, the consent text reviewed by counsel (NFR-2, NFR-3), backups, and hosting.

## How it is built

- `src/rules.js`: the rule engine, pure functions, no database. `test/rules.test.js` has 14 tests.
- `src/db.js`, `src/seed.js`: SQLite schema (candidates, mentors, gurus, rule sets and versions, documents, notes, exceptions, recommendations, guru responses, ceremonies, register, audit log) and the fabricated data.
- `src/server.js`: Express API with role checks. `src/pdf.js`: letter, package and register PDFs.
- `public/`: plain HTML, CSS and JavaScript, no build step.

When this becomes the real build, keep `src/rules.js` and its tests, replace the sign-in, storage and hosting, and treat everything in `seed.js` as throwaway.
