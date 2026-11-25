import assert from 'node:assert/strict';
import test from 'node:test';

import { handOf, toStudioTimeline } from '../../src/components/player/engine/studioTimeline.ts';

// Bản 2 part (Soprano, Alto) 2 ô có dấu nhắc lại: Player phát 4 lượt ô (1, 2, 1, 2)
const measures = [0, 1, 0, 1].map((index, order) => ({ index, order, startBeat: order * 4, lengthBeats: 4 }));
const events = [];
for (const m of measures) {
  for (const part of [0, 1]) {
    events.push({
      id: `p${part}m${m.index}`,
      trackId: `${part}:1`,
      part,
      staff: 1,
      midi: part === 0 ? 72 : 67,
      measure: m.index,
      order: m.order,
      beat: m.startBeat,
      beatEnd: m.startBeat + 4,
    });
  }
}
const base = {
  scoreId: 's1',
  title: 'Test',
  contentHash: 'h',
  timeline: { baseBpm: 90, timeSignature: '4/4', measureCount: 2, measures, events },
  parts: [
    { part: 0, staves: 1 },
    { part: 1, staves: 1 },
  ],
};

test('mở dấu nhắc lại: đủ 2 lượt như Player (8 nốt, không phải 4)', () => {
  const tl = toStudioTimeline(base);
  assert.equal(tl.notes.length, 8);
  assert.equal(tl.measures.length, 4);
  assert.ok(tl.warningCodes.includes('REPEATS_UNFOLDED'));
  assert.equal(new Set(tl.notes.map((n) => n.id)).size, 8);
});

test('chọn Alto để tập: chỉ nốt của Alto được chấm, không có bè nào là "tay phải"', () => {
  const tl = toStudioTimeline({ ...base, practicePart: 1 });
  assert.deepEqual(
    tl.notes.filter((n) => n.scorable).map((n) => n.midi),
    [67, 67, 67, 67],
  );
  assert.ok(tl.notes.every((n) => n.hand === null));
  assert.equal(tl.steps.length, 4);
});

test('tay chỉ áp cho part 2 khuông', () => {
  assert.equal(handOf(2, 1), 'RIGHT');
  assert.equal(handOf(2, 2), 'LEFT');
  assert.equal(handOf(1, 1), null);
  assert.equal(handOf(4, 1), null);
});
