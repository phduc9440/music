import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildHarmony, parseChord } from '../../src/components/editor/notation/harmony.ts';
import { chordNotes } from '../../src/components/editor/notation/chordNotes.ts';

/** Mọi hợp âm AutoHarmonizer có thể gợi ý, kèm chữ + <degree> music-ai ghi và các nốt phải vang (export_chord_fixture.py). */
const CHORDS = JSON.parse(readFileSync(new URL('./fixtures/autoharmonizer-chords.json', import.meta.url), 'utf8'));

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };
const owner = new DOMParser().parseFromString('<score-partwise/>', 'application/xml');
const pc = (step, alter) => (((STEP[step] + alter) % 12) + 12) % 12;
const name = ([step, alter]) => `${step}${ACC[alter]}`;

/** Lớp cao độ các nốt vang (tính từ gốc) và lớp cao độ của bass. */
const sounding = (harmony, rootPc) => {
  const notes = chordNotes(harmony);
  return {
    tones: [...new Set(notes.tones.map((m) => (((m - rootPc) % 12) + 12) % 12))].sort((a, b) => a - b),
    bass: notes.bass % 12,
  };
};

/** Thẻ <harmony> đúng như music-ai ghi (harmonize.harmony_element). */
const written = (row) =>
  buildHarmony(owner, {
    root: { step: row.root[0], alter: row.root[1] },
    kind: row.kind,
    text: row.text,
    bass: row.bass ? { step: row.bass[0], alter: row.bass[1] } : null,
    degrees: row.degrees.map(([type, value, alter]) => ({ type, value, alter })),
    noChord: false,
  });

test('có đủ hợp âm của AutoHarmonizer (24 loại, cả hợp âm có nốt thêm)', () => {
  assert.ok(CHORDS.length > 1400);
  assert.equal(new Set(CHORDS.map((c) => c.kind)).size, 24);
  assert.ok(CHORDS.filter((c) => c.degrees.length > 0).length > 400);
});

test('hợp âm AI ghi vào bản nhạc phát ra đúng các nốt (kể cả nốt thêm, biến hóa, bỏ bớt và bass)', () => {
  const wrong = [];
  for (const row of CHORDS) {
    const rootPc = pc(row.root[0], row.root[1]);
    const got = sounding(written(row), rootPc);
    const bass = row.bass ? pc(row.bass[0], row.bass[1]) : rootPc;
    if (JSON.stringify(got.tones) !== JSON.stringify(row.pitchClasses) || got.bass !== bass) {
      wrong.push(`${row.figure}: ${got.tones} != ${row.pitchClasses}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('gõ lại đúng chữ hiển thị của hợp âm AI thì ra đúng hợp âm đó (gốc, nốt, bass)', () => {
  const wrong = [];
  for (const row of CHORDS) {
    const typed = `${name(row.root)}${row.text}${row.bass ? `/${name(row.bass)}` : ''}`;
    const spec = parseChord(typed);
    if (!spec || spec.kind === 'other') {
      wrong.push(`${typed}: không đọc được`);
      continue;
    }
    const rootPc = pc(row.root[0], row.root[1]);
    const got = sounding(buildHarmony(owner, spec), rootPc);
    const bass = row.bass ? pc(row.bass[0], row.bass[1]) : rootPc;
    if (pc(spec.root.step, spec.root.alter) !== rootPc || got.bass !== bass) wrong.push(`${typed}: sai gốc/bass`);
    else if (JSON.stringify(got.tones) !== JSON.stringify(row.pitchClasses))
      wrong.push(`${typed}: ${got.tones} != ${row.pitchClasses}`);
  }
  assert.deepEqual(wrong, []);
});

/** Ký hiệu người dùng hay gõ → các nốt phải vang (tính từ gốc). */
const TYPED = {
  C: [0, 4, 7],
  Cm: [0, 3, 7],
  'C-': [0, 3, 7],
  C5: [0, 7],
  Caug: [0, 4, 8],
  'C+': [0, 4, 8],
  Cdim: [0, 3, 6],
  'C°': [0, 3, 6],
  Csus2: [0, 2, 7],
  Csus4: [0, 5, 7],
  Csus: [0, 5, 7],
  C6: [0, 4, 7, 9],
  Cm6: [0, 3, 7, 9],
  'C6/9': [0, 2, 4, 7, 9],
  C69: [0, 2, 4, 7, 9],
  'Cm6/9': [0, 2, 3, 7, 9],
  C7: [0, 4, 7, 10],
  Cmaj7: [0, 4, 7, 11],
  CM7: [0, 4, 7, 11],
  CΔ: [0, 4, 7, 11],
  CΔ7: [0, 4, 7, 11],
  Cm7: [0, 3, 7, 10],
  'C-7': [0, 3, 7, 10],
  CmM7: [0, 3, 7, 11],
  'Cm(maj7)': [0, 3, 7, 11],
  Cmmaj9: [0, 2, 3, 7, 11],
  Cdim7: [0, 3, 6, 9],
  'Cdim(maj7)': [0, 3, 6, 11],
  Cm7b5: [0, 3, 6, 10],
  Cø: [0, 3, 6, 10],
  Cø7: [0, 3, 6, 10],
  Cø9: [0, 2, 3, 6, 10],
  Caug7: [0, 4, 8, 10],
  'C+7': [0, 4, 8, 10],
  'C+maj7': [0, 4, 8, 11],
  'Cmaj7#5': [0, 4, 8, 11],
  'Cmaj7#11': [0, 4, 6, 7, 11],
  C7sus4: [0, 5, 7, 10],
  C7sus2: [0, 2, 7, 10],
  C9sus4: [0, 2, 5, 7, 10],
  C13sus4: [0, 2, 5, 7, 9, 10],
  C9: [0, 2, 4, 7, 10],
  Cmaj9: [0, 2, 4, 7, 11],
  Cm9: [0, 2, 3, 7, 10],
  C11: [0, 2, 4, 5, 7, 10],
  Cm11: [0, 2, 3, 5, 7, 10],
  Cmaj11: [0, 2, 4, 5, 7, 11],
  C13: [0, 2, 4, 7, 9, 10],
  Cmaj13: [0, 2, 4, 7, 9, 11],
  Cm13: [0, 2, 3, 7, 9, 10],
  Cadd9: [0, 2, 4, 7],
  Cadd2: [0, 2, 4, 7],
  Cadd4: [0, 4, 5, 7],
  Cmadd9: [0, 2, 3, 7],
  'Cm(add9)': [0, 2, 3, 7],
  C7b5: [0, 4, 6, 10],
  'C7#5': [0, 4, 8, 10],
  'C7+5': [0, 4, 8, 10],
  C7b9: [0, 1, 4, 7, 10],
  'C7#9': [0, 3, 4, 7, 10],
  'C7#11': [0, 4, 6, 7, 10],
  C7b13: [0, 4, 7, 8, 10],
  'C7(b9,#11)': [0, 1, 4, 6, 7, 10],
  'C7(b9 b13)': [0, 1, 4, 7, 8, 10],
  'C7(#5,#9)': [0, 3, 4, 8, 10],
  C7alt: [0, 1, 3, 4, 8, 10],
  'C9#11': [0, 2, 4, 6, 7, 10],
  C9b5: [0, 2, 4, 6, 10],
  C13b9: [0, 1, 4, 7, 9, 10],
  'C13#11': [0, 2, 4, 6, 7, 9, 10],
  Cm7b9: [0, 1, 3, 7, 10],
  'Cm#5': [0, 3, 8],
  'C(b5)': [0, 4, 6],
  'C7(no3)': [0, 7, 10],
  'C7(no5)': [0, 4, 10],
  'C(omit3)': [0, 7],
  'C7(add4,no3)': [0, 5, 7, 10],
  'Cm7(11)': [0, 3, 5, 7, 10],
  'C♭maj7': [0, 4, 7, 11],
  'C7♭9': [0, 1, 4, 7, 10],
  'C7♯11': [0, 4, 6, 7, 10],
  Cmi7: [0, 3, 7, 10],
  Cmin: [0, 3, 7],
  Cmaj: [0, 4, 7],
};

test('gõ được các ký hiệu hợp âm thông dụng và phát đúng nốt', () => {
  const wrong = [];
  for (const [typed, expected] of Object.entries(TYPED)) {
    const spec = parseChord(typed);
    if (!spec || spec.kind === 'other') {
      wrong.push(`${typed}: không đọc được`);
      continue;
    }
    const got = sounding(buildHarmony(owner, spec), pc(spec.root.step, spec.root.alter)).tones;
    if (JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(`${typed}: ${got} != ${expected}`);
  }
  assert.deepEqual(wrong, []);
});

test('gốc và bass có dấu thăng kép / giáng kép, giữ nguyên chữ người dùng gõ', () => {
  const spec = parseChord('Abbm/Fb');
  assert.deepEqual(
    [spec.root, spec.bass, spec.kind, spec.text],
    [{ step: 'A', alter: -2 }, { step: 'F', alter: -1 }, 'minor', 'm'],
  );
  assert.equal(parseChord('F##7').root.alter, 2);
  assert.equal(parseChord('G7(b9,#11)').text, '7(b9,#11)');
});
