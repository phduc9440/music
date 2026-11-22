import assert from 'node:assert/strict';
import test from 'node:test';

import {
  choiceQuarters,
  dotFactor,
  nextDots,
  scaledLength,
  splitRests,
  writtenChoice,
} from '../../src/components/editor/notes/durationCore.ts';
import { divisionsFactor } from '../../src/components/editor/notes/divisions.ts';

test('dotFactor: 1, 1.5, 1.75', () => {
  assert.equal(dotFactor(0), 1);
  assert.equal(dotFactor(1), 1.5);
  assert.equal(dotFactor(2), 1.75);
});

test('nextDots xoay vòng 0 → 1 → 2 → 0', () => {
  assert.equal(nextDots(0), 1);
  assert.equal(nextDots(1), 2);
  assert.equal(nextDots(2), 0);
});

test('choiceQuarters', () => {
  assert.equal(choiceQuarters({ type: 'half', dots: 1 }), 3);
  assert.equal(choiceQuarters({ type: 'eighth', dots: 0 }), 0.5);
  assert.equal(choiceQuarters({ type: '64th', dots: 0 }), 0.0625);
});

test('scaledLength: null khi divisions không chia hết', () => {
  assert.equal(scaledLength(1, 1), 1);
  assert.equal(scaledLength(0.5, 1), null);
  assert.equal(scaledLength(0.5, 2), 1);
  // chùm ba móc đơn trong divisions 3: mỗi nốt 1
  assert.equal(scaledLength(0.5, 3, { actual: 3, normal: 2 }), 1);
  assert.equal(scaledLength(0.5, 2, { actual: 3, normal: 2 }), null);
});

test('writtenChoice tìm hình nốt (kể cả chấm dôi) theo số phách đen', () => {
  assert.deepEqual(writtenChoice(1.5), { type: 'quarter', dots: 1 });
  assert.deepEqual(writtenChoice(4), { type: 'whole', dots: 0 });
  assert.deepEqual(writtenChoice(1.75), { type: 'quarter', dots: 2 });
  assert.equal(writtenChoice(1.25), null);
});

test('splitRests chia khoảng trống thành dấu lặng lớn nhất trước', () => {
  assert.deepEqual(
    splitRests(3, 1).map((r) => `${r.type}${'.'.repeat(r.dots)}`),
    ['half.'],
  );
  assert.deepEqual(
    splitRests(5, 2).map((r) => `${r.type}${'.'.repeat(r.dots)}`),
    ['half', 'eighth'],
  );
  assert.equal(splitRests(1, 1, { actual: 5, normal: 4 }), null);
});

test('divisionsFactor: hệ số nhân divisions để biểu diễn được độ dài', () => {
  assert.equal(divisionsFactor(1, 1), 1);
  assert.equal(divisionsFactor(1, 2), 2);
  assert.equal(divisionsFactor(4, 6), 3);
});
