import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayback } from '../../src/components/editor/audio/playback.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { chordText } from '../../src/components/editor/notation/harmony.ts';
import { insertNote } from '../../src/components/editor/notes/durations.ts';
import { removeStaff } from '../../src/components/editor/structure/staves.ts';
import { quarters, score } from './support/score.mjs';

const H = (root, extra = '') =>
  `<harmony><root><root-step>${root}</root-step></root><kind>major</kind>${extra}</harmony>`;
const dyn = '<direction placement="below"><direction-type><dynamics><p/></dynamics></direction-type></direction>';

/** Lúc các hợp âm ghi trên bản được đánh (giây ở 60 BPM = phách), đệm kiểu ngân (bỏ phần rải vài mili giây). */
const chordTimes = (doc) => {
  const seen = new Map();
  for (const c of buildPlayback(doc, 60, { chordStyle: 'sustain' }).chords)
    if (!c.carried) seen.set(`${c.measure + 1}@${Math.floor(c.time * 10) / 10}`, true);
  return [...seen.keys()];
};

test('inserting a note keeps the chord symbol and dynamic with the note they were written on', () => {
  const doc = ScoreDocument.parse(
    score([`${H('C')}${quarters('C5', 'D5')}${H('F')}${dyn}${quarters('E5', 'F5')}`, quarters('G5', 'A5', 'B5', 'C6')]),
  );
  const result = insertNote(
    doc,
    { partIndex: 0, measureIndex: 0, staff: 1, voice: 1, step: 'G', octave: 4, beforeEntry: 2, restEntry: null },
    { type: 'quarter', dots: 0 },
  );
  assert.ok(result.ok);
  const kids = Array.from(doc.getMeasures(0)[0].children);
  const f = kids.findIndex((c) => c.tagName === 'harmony' && chordText(c) === 'F');
  // ngay sau hợp âm F là dấu p rồi tới nốt E5 (không phải nốt G4 mới chèn)
  assert.equal(kids[f + 1].tagName, 'direction');
  assert.equal(kids[f + 2].getElementsByTagName('step')[0].textContent, 'E');
  assert.deepEqual(chordTimes(doc), ['1@0', '1@3']);
});

test('removing the bass staff moves its chord symbols to the remaining staff at the same time', () => {
  const n = (step, octave, staff, dur = 1, type = 'quarter') =>
    `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${dur}</duration>` +
    `<voice>${staff === 1 ? 1 : 5}</voice><type>${type}</type><staff>${staff}</staff></note>`;
  const back = '<backup><duration>4</duration></backup>';
  const attrs =
    '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>' +
    '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>';
  const m1 = `${attrs}${H('C')}${n('C', 5, 1)}${n('D', 5, 1)}${n('E', 5, 1)}${n('F', 5, 1)}${back}${n('C', 3, 2, 4, 'whole')}`;
  // ô 2: G dưới khuông Fa ở phách 1, A dưới khuông Fa ở phách 2,5 (giữa hai nốt khuông trên), C trùng chỗ hợp âm khuông trên
  const m2 =
    `${H('C')}${n('G', 5, 1)}${n('A', 5, 1)}${n('B', 5, 1)}${n('C', 6, 1)}${back}` +
    `${H('C', '<staff>2</staff>')}${H('G', '<offset>1</offset><staff>2</staff>')}` +
    `<note><pitch><step>G</step><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>whole</type><staff>2</staff></note>`;
  const xml =
    '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name>' +
    `</score-part></part-list><part id="P1"><measure number="1">${m1}</measure><measure number="2">${m2}</measure></part></score-partwise>`;
  const doc = ScoreDocument.parse(xml);
  assert.ok(removeStaff(doc, 0, 2).ok);
  const harmonies = Array.from(doc.getMeasures(0)[1].getElementsByTagName('harmony'));
  // C trùng chỗ bị bỏ, G chuyển lên trước nốt A5 (phách 2)
  assert.deepEqual(
    harmonies.map((h) => chordText(h)),
    ['C', 'G'],
  );
  assert.equal(harmonies[1].getElementsByTagName('staff').length, 0);
  assert.equal(harmonies[1].nextElementSibling.getElementsByTagName('step')[0].textContent, 'A');
  assert.deepEqual(chordTimes(doc), ['1@0', '2@4', '2@5']);
});
