import assert from 'node:assert/strict';
import test from 'node:test';

import { WaitModeScorer } from '../../src/components/player/engine/WaitModeScorer.ts';

const expected = (noteId, midi, measure = 1, hand = 'RIGHT') => ({
  noteId,
  midi,
  measure,
  hand,
  expectedMs: 0,
});

const step = (stepIndex, notes, expectedMs = stepIndex * 500) => ({
  stepIndex,
  expectedMs,
  notes,
});

test('waits for every note in a chord, regardless of input order', () => {
  const scorer = new WaitModeScorer([step(0, [expected('right-c', 60), expected('left-g', 55, 1, 'LEFT')])], 1000);

  const first = scorer.play({ midi: 55, playedMs: 10 })[0];
  assert.equal(scorer.isComplete, false);
  const second = scorer.play({ midi: 60, playedMs: 9999 })[0];

  assert.deepEqual(
    [first.noteId, first.result, first.expectedMs, first.playedMs, first.deltaMs],
    ['left-g', 'PERFECT', null, null, null],
  );
  assert.deepEqual([second.noteId, second.seq], ['right-c', 1]);
  assert.equal(scorer.isComplete, true);
});

test('wrong pitches do not consume or advance the current expected note', () => {
  const scorer = new WaitModeScorer([step(0, [expected('n1', 60)]), step(1, [expected('n2', 62)])], 1000);

  const wrong = scorer.play({ midi: 61, playedMs: 5000 })[0];
  assert.deepEqual(
    [wrong.seq, wrong.result, wrong.noteId, wrong.expectedMidi, wrong.playedMidi, wrong.measure],
    [0, 'WRONG_PITCH', null, null, 61, 1],
  );
  assert.equal(scorer.getCurrentExpectedMs(), 0);
  assert.equal(scorer.play({ midi: 60, playedMs: 6000 })[0].seq, 1);
  assert.equal(scorer.getCurrentExpectedMs(), 500);
});

test('tracks duplicate pitches as separate notes and continues sequences across loop cycles', () => {
  const scorer = new WaitModeScorer(
    [step(0, [expected('right-c', 60), expected('left-c', 60, 1, 'LEFT')])],
    1000,
    true,
  );

  const firstCycle = [scorer.play({ midi: 60, playedMs: 0 })[0], scorer.play({ midi: 60, playedMs: 0 })[0]];
  assert.deepEqual(
    firstCycle.map(({ seq, noteId }) => [seq, noteId]),
    [
      [0, 'right-c'],
      [1, 'left-c'],
    ],
  );
  assert.equal(scorer.isComplete, false);
  assert.equal(scorer.getCurrentExpectedMs(), 1000);
  assert.equal(scorer.play({ midi: 60, playedMs: 5000 })[0].seq, 2);
});

test('manual finish adds no missed notes and prevents further input', () => {
  const scorer = new WaitModeScorer([step(0, [expected('n1', 60)])], 1000);

  assert.deepEqual(scorer.finish(9000), []);
  assert.throws(() => scorer.play({ midi: 60, playedMs: 9001 }), /already finished/);
});
