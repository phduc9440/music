import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { enterNote, insertNote, isLetterKey, setDuration } from '../../src/components/editor/notes/durations.ts';
import { checkMeasures } from '../../src/components/editor/structure/measureCheck.ts';
import { measureSummary, note, quarters, score } from './support/score.mjs';

const Q = { type: 'quarter', dots: 0 };
const H = { type: 'half', dots: 0 };
const E = { type: 'eighth', dots: 0 };

test('isLetterKey nhận a–g, bỏ phím khác', () => {
  assert.equal(isLetterKey('c'), true);
  assert.equal(isLetterKey('G'), true);
  assert.equal(isLetterKey('h'), false);
  assert.equal(isLetterKey('ArrowUp'), false);
});

test('setDuration đổi thẳng một nốt (nhân divisions khi cần), ô thiếu phách để kiểm tra ô nhịp báo', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  const result = setDuration(doc, ['m0-s1-v1-0'], E);
  assert.equal(result.ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['C4:eighth/1', 'D4:quarter/2', 'E4:quarter/2', 'F4:quarter/2']);
  assert.equal(doc.divisionsAt(0), 2);
  assert.ok(result.command.parts, 'đổi divisions phải chụp cả part để hoàn tác');
  assert.equal(checkMeasures(doc)[0].diffBeats, -0.5);
});

test('setDuration kéo dài không ghi đè nốt sau, ô thừa phách', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  assert.equal(setDuration(doc, ['m0-s1-v1-0'], H).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['C4:half/2', 'D4:quarter/1', 'E4:quarter/1', 'F4:quarter/1']);
  assert.equal(checkMeasures(doc)[0].diffBeats, 1);
});

test('enterNote kèm trường độ dài hơn: ghi đè dấu lặng phía sau, ô vẫn đủ phách', () => {
  const doc = ScoreDocument.parse(score([note(null) + note(null) + quarters('E4', 'F4')]));
  assert.equal(enterNote(doc, 'm0-s1-v1-0', 'd', H).ok, true);
  assert.deepEqual(measureSummary(doc, 0).slice(1), ['E4:quarter/1', 'F4:quarter/1']);
  assert.equal(measureSummary(doc, 0)[0].endsWith(':half/2'), true);
  assert.deepEqual(checkMeasures(doc), []);
});

test('enterNote kèm trường độ ngắn hơn: phần dư thành dấu lặng', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  assert.equal(enterNote(doc, 'm0-s1-v1-1', 'g', E).ok, true);
  assert.deepEqual(measureSummary(doc, 0).slice(1, 3), ['G4:eighth/1', 'rest:eighth/1']);
  assert.deepEqual(checkMeasures(doc), []);
});

test('setDuration không đổi khi đã đúng trường độ', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  const result = setDuration(doc, ['m0-s1-v1-0'], Q);
  assert.equal(result.ok, false);
});

test('enterNote đổi dấu lặng thành nốt gần cao độ tham chiếu', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4') + note(null) + quarters('F4')]));
  assert.equal(enterNote(doc, 'm0-s1-v1-2', 'e', null).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['C4:quarter/1', 'D4:quarter/1', 'E4:quarter/1', 'F4:quarter/1']);
});

test('enterNote dùng khóa nhạc: Rê trưởng gõ f → F#', () => {
  const doc = ScoreDocument.parse(score([quarters('D4', 'E4') + note(null) + quarters('G4')], { fifths: 2 }));
  enterNote(doc, 'm0-s1-v1-2', 'f', null);
  assert.equal(measureSummary(doc, 0)[2], 'F#4:quarter/1');
});

test('insertNote vào dấu lặng nguyên ô', () => {
  const doc = ScoreDocument.parse(score([note(null, { dur: 4, type: 'whole' })]));
  const target = {
    partIndex: 0,
    measureIndex: 0,
    staff: 1,
    voice: 1,
    step: 'G',
    octave: 4,
    beforeEntry: 0,
    restEntry: 0,
  };
  const result = insertNote(doc, target, Q);
  assert.equal(result.ok, true);
  const summary = measureSummary(doc, 0);
  assert.equal(summary[0], 'G4:quarter/1');
  assert.equal(
    summary.slice(1).every((s) => s.startsWith('rest:')),
    true,
  );
  assert.equal(result.command.selectAfter.length, 1);
});

test('insertNote với dấu hóa chọn tay', () => {
  const doc = ScoreDocument.parse(score([note(null, { dur: 4, type: 'whole' })]));
  const target = {
    partIndex: 0,
    measureIndex: 0,
    staff: 1,
    voice: 1,
    step: 'B',
    octave: 4,
    beforeEntry: 0,
    restEntry: 0,
  };
  insertNote(doc, target, H, 'flat');
  assert.equal(measureSummary(doc, 0)[0], 'Bb4:half/2');
});

// Ô nhịp trống như bản nhạc tạo mới: một dấu lặng nguyên ô (measure="yes", không có <type>), divisions = 4
const blankMeasure = () =>
  ScoreDocument.parse(
    score(['<note><rest measure="yes"/><duration>16</duration><voice>1</voice></note>'], { divisions: 4 }),
  );
const at = (beforeEntry, restEntry = null) => ({
  partIndex: 0,
  measureIndex: 0,
  staff: 1,
  voice: 1,
  step: 'G',
  octave: 4,
  beforeEntry,
  restEntry,
});

test('insertNote: đen, trắng, đen vào ô trống (bấm vào dấu lặng) đủ 4 phách', () => {
  const doc = blankMeasure();
  assert.equal(insertNote(doc, at(0, 0), Q).ok, true);
  assert.equal(insertNote(doc, at(1, 1), H).ok, true);
  assert.equal(insertNote(doc, at(2, 2), Q).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['G4:quarter/4', 'G4:half/8', 'G4:quarter/4']);
  assert.deepEqual(checkMeasures(doc), []);
});

test('insertNote: bấm vào chỗ trống sau nốt thì nốt mới chiếm chỗ dấu lặng, ô không thừa phách', () => {
  const doc = blankMeasure();
  insertNote(doc, at(0, 0), Q);
  assert.equal(insertNote(doc, at(1), H).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['G4:quarter/4', 'G4:half/8', 'rest:quarter/4']);
  assert.equal(insertNote(doc, at(2), Q).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['G4:quarter/4', 'G4:half/8', 'G4:quarter/4']);
  assert.deepEqual(checkMeasures(doc), []);
});

test('insertNote: bấm bên phải dấu lặng cuối ô thì nốt đặt trước chuỗi dấu lặng đó', () => {
  const doc = blankMeasure();
  insertNote(doc, at(0, 0), Q);
  assert.equal(insertNote(doc, at(2), Q).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['G4:quarter/4', 'G4:quarter/4', 'rest:half/8']);
  assert.deepEqual(checkMeasures(doc), []);
});

test('insertNote: chèn giữa hai nốt không có dấu lặng thì vẫn đẩy nốt sau, ô thừa phách', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  assert.equal(insertNote(doc, at(1), Q).ok, true);
  assert.equal(measureSummary(doc, 0).length, 5);
  assert.equal(checkMeasures(doc)[0].diffBeats, 1);
});

test('insertNote: thay dấu lặng đen bằng nốt trắng ghi đè dấu lặng liền sau', () => {
  const doc = ScoreDocument.parse(score([quarters('C4') + note(null) + note(null) + quarters('F4')]));
  assert.equal(insertNote(doc, at(1, 1), H).ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['C4:quarter/1', 'G4:half/2', 'F4:quarter/1']);
  assert.deepEqual(checkMeasures(doc), []);
});
