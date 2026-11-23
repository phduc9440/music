import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AccidentalState,
  accidentalName,
  clampFifths,
  inRange,
  intervalFifths,
  isStep,
  keyAlter,
  midiToFrequency,
  movePitch,
  pitchName,
  pitchToMidi,
  spellMidi,
  spellMidiRelative,
} from '../../src/components/editor/notes/pitch.ts';

const P = (step, octave, alter = 0) => ({ step, alter, octave });

test('pitchToMidi: C4 = 60, A4 = 69, B#3 = C4', () => {
  assert.equal(pitchToMidi(P('C', 4)), 60);
  assert.equal(pitchToMidi(P('A', 4)), 69);
  assert.equal(pitchToMidi(P('B', 3, 1)), 60);
  assert.equal(pitchToMidi(P('C', 4, -1)), 59);
});

test('keyAlter theo thứ tự dấu hóa của khóa', () => {
  assert.equal(keyAlter(2, 'F'), 1); // Rê trưởng: F#, C#
  assert.equal(keyAlter(2, 'C'), 1);
  assert.equal(keyAlter(2, 'G'), 0);
  assert.equal(keyAlter(-1, 'B'), -1); // Fa trưởng: Bb
  assert.equal(keyAlter(-1, 'E'), 0);
  assert.equal(keyAlter(0, 'F'), 0);
});

test('isStep và inRange', () => {
  assert.equal(isStep('G'), true);
  assert.equal(isStep('H'), false);
  assert.equal(inRange(21), true);
  assert.equal(inRange(108), true);
  assert.equal(inRange(20), false);
  assert.equal(inRange(109), false);
});

test('spellMidi ưu tiên khóa nhạc, rồi nốt tự nhiên, rồi hướng đi', () => {
  assert.deepEqual(spellMidi(61, 0, 1), P('C', 4, 1)); // đi lên → C#
  assert.deepEqual(spellMidi(61, 0, -1), P('D', 4, -1)); // đi xuống → Db
  assert.deepEqual(spellMidi(66, 1, -1), P('F', 4, 1)); // Sol trưởng: F# dù đi xuống
  assert.deepEqual(spellMidi(60, 0, 1), P('C', 4)); // nốt tự nhiên thắng B#
});

test('spellMidiRelative giữ vai trò nốt so với khóa', () => {
  // ♯4 của Sol trưởng (C#) chuyển sang Fa trưởng phải là B♮ (nâng so với Bb)
  assert.deepEqual(spellMidiRelative(71, -1, 1), P('B', 4));
  // nốt thuộc giọng Rê trưởng (F#) sang Mi giáng trưởng → G
  assert.deepEqual(spellMidiRelative(67, -3, 0), P('G', 4));
});

test('movePitch: bậc, nửa cung, quãng tám', () => {
  assert.deepEqual(movePitch(P('E', 4), 'stepUp', 0), P('F', 4));
  assert.deepEqual(movePitch(P('E', 4), 'stepUp', 1), P('F', 4, 1)); // Sol trưởng: lên F#
  assert.deepEqual(movePitch(P('B', 4), 'stepUp', 0), P('C', 5)); // qua quãng tám
  assert.deepEqual(movePitch(P('C', 4), 'stepDown', 0), P('B', 3));
  assert.deepEqual(movePitch(P('E', 4), 'semitoneUp', 0), P('F', 4));
  assert.deepEqual(movePitch(P('F', 4), 'semitoneUp', 0), P('F', 4, 1));
  assert.deepEqual(movePitch(P('C', 4), 'octaveDown', 0), P('C', 3));
});

test('movePitch báo range khi vượt A0–C8', () => {
  assert.equal(movePitch(P('C', 8), 'semitoneUp', 0), 'range');
  assert.equal(movePitch(P('A', 0), 'stepDown', 0), 'range');
  assert.equal(movePitch(P('E', 7), 'octaveUp', 0), 'range');
});

test('pitchName gồm cả vi cung', () => {
  assert.equal(pitchName(P('F', 4, 1)), 'F#4');
  assert.equal(pitchName(P('B', 3, -1)), 'Bb3');
  assert.equal(pitchName(P('C', 4, 0.5)), 'C+4');
  assert.equal(pitchName(P('E', 5, -2)), 'Ebb5');
});

test('accidentalName cho các giá trị alter', () => {
  assert.equal(accidentalName(1), 'sharp');
  assert.equal(accidentalName(-1), 'flat');
  assert.equal(accidentalName(0), 'natural');
  assert.equal(accidentalName(2), 'double-sharp');
  assert.equal(accidentalName(-0.5), 'quarter-flat');
});

test('midiToFrequency: A4 = 440 Hz, A5 = 880 Hz', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.equal(midiToFrequency(81), 880);
});

test('intervalFifths và clampFifths', () => {
  assert.equal(intervalFifths(-1, -2), -2); // clarinet Bb
  assert.equal(intervalFifths(null, 7), 1);
  assert.equal(clampFifths(9), -3);
  assert.equal(clampFifths(-8), 4);
  assert.equal(clampFifths(5), 5);
});

test('AccidentalState chỉ vẽ dấu hóa khi khác trạng thái trong ô', () => {
  const s = new AccidentalState(1); // Sol trưởng
  assert.equal(s.visit(P('F', 4, 1)), null); // F# theo khóa
  assert.equal(s.visit(P('F', 4, 0)), 0); // F♮ cần dấu bình
  assert.equal(s.visit(P('F', 4, 0)), null); // lần hai trong ô không cần
  assert.equal(s.visit(P('F', 5, 0)), 0); // quãng tám khác tính riêng
});
