import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStudioSchedule } from '../../src/components/player/engine/studioSchedule.ts';

const timeline = {
  scoreId: 'score-1',
  contentHash: 'hash',
  title: 'Test',
  measureCount: 3,
  tempoBpm: 120,
  timeSignatures: [{ measure: 1, beats: 4, beatType: 4 }],
  measures: [
    { index: 1, startBeat: 0, beats: 4 },
    { index: 2, startBeat: 4, beats: 4 },
    { index: 3, startBeat: 8, beats: 4 },
  ],
  tempoChanges: [{ measure: 2, bpm: 60 }],
  notes: [
    { id: 'n1', measure: 1, staff: 1, hand: 'RIGHT', midi: 60, startBeat: 0, durationBeat: 1, scorable: true },
    { id: 'n2', measure: 1, staff: 2, hand: 'LEFT', midi: 48, startBeat: 2, durationBeat: 1, scorable: true },
    { id: 'n3', measure: 2, staff: 1, hand: 'RIGHT', midi: 62, startBeat: 4, durationBeat: 1, scorable: true },
    { id: 'tie', measure: 2, staff: 1, hand: 'RIGHT', midi: 62, startBeat: 5, durationBeat: 1, scorable: false },
    { id: 'long', measure: 1, staff: 1, hand: 'RIGHT', midi: 64, startBeat: 3, durationBeat: 2, scorable: true },
  ],
  steps: [],
  warnings: [],
};

test('builds a tempo-aware schedule for the selected hand and measure range', () => {
  const schedule = buildStudioSchedule(timeline, {
    startMeasure: 1,
    endMeasure: 2,
    tempoPercent: 100,
    handMode: 'RIGHT_ONLY',
  });

  assert.deepEqual(
    schedule.notes.map(({ noteId, expectedMs }) => [noteId, expectedMs]),
    [
      ['n1', 0],
      ['long', 1500],
      ['n3', 2000],
    ],
  );
  assert.equal(schedule.durationMs, 6000);
  assert.deepEqual(
    schedule.visualNotes.map(({ noteId, expectedMs, durationMs, scorable }) => [
      noteId,
      expectedMs,
      durationMs,
      scorable,
    ]),
    [
      ['n1', 0, 500, true],
      ['long', 1500, 1500, true],
      ['n3', 2000, 1000, true],
      ['tie', 3000, 1000, false],
    ],
  );
  assert.equal(
    schedule.notes.some(({ noteId }) => noteId === 'tie'),
    false,
  );
});

test('applies tempo percent to beat timing and retains both hands when requested', () => {
  const schedule = buildStudioSchedule(timeline, {
    startMeasure: 1,
    endMeasure: 1,
    tempoPercent: 50,
    handMode: 'BOTH',
  });

  assert.deepEqual(
    schedule.notes.map(({ noteId, expectedMs }) => [noteId, expectedMs]),
    [
      ['n1', 0],
      ['n2', 2000],
      ['long', 3000],
    ],
  );
  assert.equal(schedule.durationMs, 4000);
});

test('rejects invalid measure ranges and tempo percentages', () => {
  assert.throws(
    () => buildStudioSchedule(timeline, { startMeasure: 0, endMeasure: 2, tempoPercent: 100, handMode: 'BOTH' }),
    RangeError,
  );
  assert.throws(
    () => buildStudioSchedule(timeline, { startMeasure: 1, endMeasure: 1, tempoPercent: 201, handMode: 'BOTH' }),
    RangeError,
  );
});
