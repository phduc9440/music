import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import {
  fifthsOfMajorTonic,
  readStartingKey,
  signedSemitones,
  transposeDocument,
  transposeFifths,
  transposeKey,
} from '../../src/components/editor/notes/transpose.ts';
import { measureSummary, note, quarters, score } from './support/score.mjs';

test('fifthsOfMajorTonic: hòa thì chọn dấu thăng', () => {
  assert.equal(fifthsOfMajorTonic(0), 0); // C
  assert.equal(fifthsOfMajorTonic(7), 1); // G
  assert.equal(fifthsOfMajorTonic(5), -1); // F
  assert.equal(fifthsOfMajorTonic(1), -5); // Db (5 giáng) thay vì C# (7 thăng)
  assert.equal(fifthsOfMajorTonic(6), 6); // F# (6 thăng) hòa với Gb (6 giáng) → thăng
});

test('transposeFifths và transposeKey', () => {
  assert.equal(transposeFifths(0, 2), 2); // C → D
  assert.equal(transposeFifths(0, -2), -2); // C → Bb
  assert.equal(transposeFifths(-3, 12), -3); // giữ nguyên sau một quãng tám
  assert.deepEqual(transposeKey({ fifths: 0, minor: true }, 7), { fifths: 1, minor: true });
});

test('signedSemitones', () => {
  assert.equal(signedSemitones(3), '+3');
  assert.equal(signedSemitones(-2), '−2');
  assert.equal(signedSemitones(0), '0');
});

test('readStartingKey đọc khóa và giọng thứ', () => {
  const doc = ScoreDocument.parse(score([quarters('A4', 'B4', 'C5', 'D5')], { fifths: 0, mode: 'minor' }));
  assert.deepEqual(readStartingKey(doc), { fifths: 0, minor: true });
});

test('transposeDocument +2: Đô trưởng thành Rê trưởng, nốt và khóa cùng đổi', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'E4', 'F4', 'G4')]));
  assert.equal(transposeDocument(doc, 2).ok, true);
  assert.equal(readStartingKey(doc).fifths, 2);
  assert.deepEqual(measureSummary(doc, 0), ['D4:quarter/1', 'F#4:quarter/1', 'G4:quarter/1', 'A4:quarter/1']);
});

test('transposeDocument giữ vai trò nốt nâng: F#4 trong Đô trưởng −2 → E4 trong Sib trưởng', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'F#4', 'G4', 'C5')]));
  transposeDocument(doc, -2);
  assert.equal(readStartingKey(doc).fifths, -2);
  assert.deepEqual(measureSummary(doc, 0), ['Bb3:quarter/1', 'E4:quarter/1', 'F4:quarter/1', 'Bb4:quarter/1']);
});

test('transposeDocument từ chối 0, >12 và vượt tầm', () => {
  const doc = ScoreDocument.parse(score([note('C8') + quarters('C4', 'D4', 'E4')]));
  assert.deepEqual(transposeDocument(doc, 0), { ok: false, reason: 'unchanged' });
  assert.deepEqual(transposeDocument(doc, 13), { ok: false, reason: 'unchanged' });
  assert.deepEqual(transposeDocument(doc, 1), { ok: false, reason: 'range' });
});
