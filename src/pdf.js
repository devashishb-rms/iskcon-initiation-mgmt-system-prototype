const PDFDocument = require('pdfkit');
const { DOC_LABELS } = require('./rules');

const STATUS_WORD = { met: 'Met', unknown: 'Needs confirming', not_met: 'Not met', later: 'Later', exception: 'Exception recorded' };

function render(build) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'ISKCON Newtown initiation system (prototype)' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    build(doc);
    doc.end();
  });
}

function banner(doc, title) {
  doc.fontSize(9).fillColor('#8A1D10').text('PROTOTYPE · sample data · not a real recommendation', { align: 'right' });
  doc.moveDown(0.5).fontSize(18).fillColor('#16213A').text(title);
  doc.moveDown(0.3).moveTo(56, doc.y).lineTo(539, doc.y).strokeColor('#0B6E6E').lineWidth(1.5).stroke();
  doc.moveDown(0.8).fillColor('#16213A');
}

function checklistLines(doc, check) {
  check.items.forEach((i) => {
    doc.fontSize(10).fillColor('#16213A').text(`${i.id}  ${i.label}  [${STATUS_WORD[i.status]}]`);
    if (i.detail) doc.fontSize(9).fillColor('#4F5B73').text('      ' + i.detail);
  });
  doc.fillColor('#16213A');
}

// FR-13: recommendation letter generated from the record
function letter({ candidate, guru, version, check, rec, president, mentorNote }) {
  return render((doc) => {
    banner(doc, 'Recommendation for initiation');
    doc.fontSize(11);
    doc.text(`Date: ${rec.created_at.slice(0, 10)}`);
    doc.text(`To: Office of ${guru.name}`);
    doc.moveDown();
    doc.text(`The temple president of ISKCON Newtown, Kolkata, recommends ${candidate.name} for ${candidate.track === 'second' ? 'second' : 'first'} initiation.`);
    doc.moveDown(0.5);
    doc.text(`This recommendation was made against the ${version.rule_name}, version ${version.version}. The checklist below shows what the record held on the day. The decision to accept the candidate rests with the guru.`);
    doc.moveDown();
    doc.fontSize(12).text('Checklist at the time of recommendation');
    doc.moveDown(0.3);
    checklistLines(doc, check);
    if (mentorNote) {
      doc.moveDown();
      doc.fontSize(12).fillColor('#16213A').text("Mentor's readiness note");
      doc.fontSize(10).fillColor('#16213A').text(`${mentorNote.author}: ${mentorNote.body}`);
    }
    doc.moveDown(2);
    doc.fontSize(11).text('______________________________');
    doc.text(`${president}, Temple president, ISKCON Newtown`);
  });
}

// FR-15: package for the guru's office, as one PDF
function packagePdf({ candidate, guru, version, check, docs, notes, exceptions, timeline, missingDocs, letterRec }) {
  return render((doc) => {
    banner(doc, `Candidate package: ${candidate.name}`);
    doc.fontSize(10).fillColor('#16213A');
    doc.text(`For: ${guru.name}   ·   Track: ${candidate.track === 'second' ? 'Second initiation' : 'First initiation'}   ·   Stage: ${candidate.stage}`);
    doc.text(`Rule set: ${version.rule_name}, version ${version.version}`);
    doc.text(`Mentor: ${candidate.mentor_name}   ·   Group: ${candidate.group_name || '-'}`);
    doc.moveDown();
    if (missingDocs.length) {
      doc.fontSize(11).fillColor('#8A1D10').text('Required documents missing: ' + missingDocs.map((t) => DOC_LABELS[t]).join(', '));
      doc.fillColor('#16213A').moveDown(0.5);
    }
    doc.fontSize(12).text('Checklist');
    doc.moveDown(0.3);
    checklistLines(doc, check);
    doc.moveDown();
    doc.fontSize(12).fillColor('#16213A').text('Documents on file');
    doc.fontSize(10);
    if (!docs.length) doc.text('None');
    docs.forEach((d) => doc.text(`${DOC_LABELS[d.doc_type] || d.doc_type}: ${d.filename} (uploaded ${d.uploaded_at.slice(0, 10)} by ${d.uploaded_by})`));
    if (exceptions.length) {
      doc.moveDown().fontSize(12).text('Exceptions recorded by the committee');
      doc.fontSize(10);
      exceptions.forEach((e) => doc.text(`${e.rule_id}: ${e.reason} (${e.by_name}, ${e.created_at.slice(0, 10)})`));
    }
    const readiness = notes.filter((n) => n.kind === 'readiness');
    if (readiness.length) {
      doc.moveDown().fontSize(12).text("Mentor's readiness note");
      doc.fontSize(10);
      readiness.forEach((n) => doc.text(`${n.author}, ${n.created_at.slice(0, 10)}: ${n.body}`));
    }
    if (letterRec) {
      doc.moveDown().fontSize(12).text('Recommendation');
      doc.fontSize(10).text(`Approved by the temple president on ${letterRec.created_at.slice(0, 10)} (rule set version ${version.version}).`);
    }
    doc.moveDown().fontSize(12).text('Timeline');
    doc.fontSize(9);
    timeline.forEach((t) => doc.fillColor('#4F5B73').text(`${t.at.slice(0, 10)}  ${t.detail}`));
  });
}

function registerPdf(rows) {
  return render((doc) => {
    banner(doc, 'Initiation register');
    doc.fontSize(10);
    rows.forEach((r) => doc.text(`${r.date}   ${r.name}   ·   ${r.spiritual_name}   ·   ${r.track === 'second' ? 'Second' : 'First'}   ·   ${r.guru_name}   ·   Ceremony ${r.ceremony_id}`).moveDown(0.2));
    if (!rows.length) doc.text('No entries.');
  });
}

module.exports = { letter, packagePdf, registerPdf };
