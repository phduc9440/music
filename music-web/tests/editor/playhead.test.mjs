import assert from 'node:assert/strict';
import test from 'node:test';

import { playheadAt } from '../../src/components/player/engine/playhead.ts';

// Hai ô nhịp, mỗi ô 1 giây; ô 1 có nốt ở 0 s (x=110) và 0,5 s (x=150), ô 2 bắt đầu bằng dấu lặng, nốt ở 1,5 s (x=260)
const timeline = {
  measures: [
    { index: 0, order: 0, start: 0, end: 1, startBeat: 0, lengthBeats: 2 },
    { index: 1, order: 1, start: 1, end: 2, startBeat: 2, lengthBeats: 2 },
  ],
};
const map = {
  orders: [
    {
      start: 0,
      end: 1,
      left: 100,
      right: 190,
      top: 10,
      bottom: 90,
      points: [
        { time: 0, x: 110 },
        { time: 0.5, x: 150 },
      ],
    },
    { start: 1, end: 2, left: 210, right: 290, top: 10, bottom: 90, points: [{ time: 1.5, x: 260 }] },
  ],
};

test('vạch nằm đúng trên nốt khi nốt bắt đầu vang', () => {
  assert.equal(playheadAt(map, timeline, 0).x, 110);
  assert.equal(playheadAt(map, timeline, 0.5).x, 150);
  assert.equal(playheadAt(map, timeline, 1.5).x, 260);
});

test('giữa hai nốt thì trượt đều, sau nốt cuối thì trượt tới cuối ô', () => {
  assert.equal(playheadAt(map, timeline, 0.25).x, 130);
  assert.equal(playheadAt(map, timeline, 0.75).x, 170);
});

test('ô bắt đầu bằng dấu lặng: trượt từ mép trái ô tới nốt đầu tiên', () => {
  assert.equal(playheadAt(map, timeline, 1).x, 210);
  assert.equal(playheadAt(map, timeline, 1.25).x, 235);
});

test('phủ cả hệ khuông; ô chưa vẽ thì không có vạch', () => {
  assert.deepEqual(playheadAt(map, timeline, 0.1), { x: 118, top: 10, bottom: 90 });
  assert.equal(playheadAt({ orders: [null, null] }, timeline, 0.5), null);
});
