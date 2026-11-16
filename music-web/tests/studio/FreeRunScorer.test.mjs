import assert from 'node:assert/strict';
import test from 'node:test';

import { FreeRunScorer } from '../../src/components/player/engine/FreeRunScorer.ts';

const expected = (noteId, midi, expectedMs, measure = 1, hand = 'RIGHT') => ({
  noteId,
  midi,
  expectedMs,
  measure,
  hand,
});

test('classifies perfect, early, and late hits at configurable boundaries', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([expected('n1', 60, 1000), expected('n2', 62, 2000), expected('n3', 64, 3000)]);

  const events = [
    ...scorer.play({ midi: 60, playedMs: 1040 }),
    ...scorer.play({ midi: 62, playedMs: 1940 }),
    ...scorer.play({ midi: 64, playedMs: 3060 }),
  ];

  assert.deepEqual(
    events.map(({ seq, result, deltaMs }) => [seq, result, deltaMs]),
    [
      [0, 'PERFECT', 40],
      [1, 'EARLY', -60],
      [2, 'LATE', 60],
    ],
  );
});

test('accepts hits through the tolerance boundary and marks later hits missed', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([expected('n1', 60, 1000), expected('n2', 62, 2000)]);

  const atBoundary = scorer.play({ midi: 60, playedMs: 1100 });
  const afterBoundary = scorer.play({ midi: 62, playedMs: 2101 });

  assert.deepEqual(
    atBoundary.map(({ result, deltaMs }) => [result, deltaMs]),
    [['LATE', 100]],
  );
  assert.deepEqual(
    afterBoundary.map(({ result, noteId }) => [result, noteId]),
    [
      ['MISSED', 'n2'],
      ['WRONG_PITCH', null],
    ],
  );
});

test('matches chord tones independently, including simultaneous equal-pitch notes', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([
    expected('right-c', 60, 500, 1, 'RIGHT'),
    expected('left-c', 60, 500, 1, 'LEFT'),
    expected('right-e', 64, 500, 1, 'RIGHT'),
  ]);

  const events = [
    ...scorer.play({ midi: 60, playedMs: 500, hand: 'LEFT' }),
    ...scorer.play({ midi: 60, playedMs: 500, hand: 'RIGHT' }),
    ...scorer.play({ midi: 64, playedMs: 500 }),
  ];

  assert.deepEqual(
    events.map(({ noteId, result }) => [noteId, result]),
    [
      ['left-c', 'PERFECT'],
      ['right-c', 'PERFECT'],
      ['right-e', 'PERFECT'],
    ],
  );
});

test('records an extra wrong pitch without consuming the expected note, then marks it missed', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([expected('n1', 60, 1000)]);

  const wrongPitch = scorer.play({ midi: 61, playedMs: 1010 })[0];
  const missed = scorer.advanceTo(1101)[0];

  assert.deepEqual(
    [wrongPitch.result, wrongPitch.noteId, wrongPitch.expectedMidi, wrongPitch.expectedMs],
    ['WRONG_PITCH', 'n1', null, null],
  );
  assert.deepEqual([missed.seq, missed.result, missed.noteId, missed.playedMidi], [1, 'MISSED', 'n1', null]);
});

test('finish marks only expected notes through the covered playback time as missed', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([expected('n1', 60, 1000), expected('n2', 62, 2000)]);

  const events = scorer.finish(1500);

  assert.deepEqual(
    events.map(({ noteId, result }) => [noteId, result]),
    [['n1', 'MISSED']],
  );
  assert.throws(() => scorer.play({ midi: 62, playedMs: 2000 }), /already finished/);
});

test('supports repeated note ids as distinct loop occurrences', () => {
  const scorer = new FreeRunScorer();
  scorer.scheduleExpectedNotes([expected('n1', 60, 1000), expected('n1', 60, 3000)]);

  const events = [...scorer.play({ midi: 60, playedMs: 1000 }), ...scorer.play({ midi: 60, playedMs: 3000 })];

  assert.deepEqual(
    events.map(({ seq, noteId }) => [seq, noteId]),
    [
      [0, 'n1'],
      [1, 'n1'],
    ],
  );
});

test('rejects invalid scoring windows and non-monotonic input time', () => {
  assert.throws(() => new FreeRunScorer({ perfectWindowMs: 101 }), RangeError);

  const scorer = new FreeRunScorer();
  scorer.advanceTo(100);
  assert.throws(() => scorer.play({ midi: 60, playedMs: 99 }), /monotonic/);
});
