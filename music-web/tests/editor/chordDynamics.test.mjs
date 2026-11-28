import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHORD_BASS_GAIN,
  CHORD_GAIN,
  buildPlayback,
  chordGainAt,
  partLevelAt,
} from '../../src/components/editor/audio/playback.ts';
import { DEFAULT_GAIN, levelDriveDb } from '../../src/components/editor/audio/loudness.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { quarters, score } from './support/score.mjs';

const harmony = '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>';
const dyn = (mark) =>
  `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type></direction>`;

test('at mf the accompaniment keeps its usual level', () => {
  assert.ok(Math.abs(chordGainAt(DEFAULT_GAIN, false) - CHORD_GAIN) < 1e-6);
  assert.ok(Math.abs(chordGainAt(DEFAULT_GAIN, true) - CHORD_BASS_GAIN) < 1e-6);
});

test('the accompaniment stays the same number of dB under the melody at every level', () => {
  const gap = levelDriveDb(CHORD_GAIN) - levelDriveDb(DEFAULT_GAIN);
  for (const level of [0.3, 0.45, 0.6, 0.9, 1]) {
    const diff = levelDriveDb(chordGainAt(level, false)) - levelDriveDb(level);
    assert.ok(Math.abs(diff - gap) < 0.05, `level ${level}: ${diff} vs ${gap}`);
  }
});

test('partLevelAt uses the median of the notes inside the chord, else the last note before', () => {
  const levels = [
    { start: 0, gain: 0.5 },
    { start: 1, gain: 0.5 },
    { start: 2, gain: 1 }, // nốt có dấu nhấn
    { start: 3, gain: 0.5 },
  ];
  assert.equal(partLevelAt(levels, 0, 4), 0.5);
  assert.equal(partLevelAt(levels, 4, 8), 0.5);
  assert.equal(partLevelAt([], 0, 4), DEFAULT_GAIN);
});

test('chords played under pp are softer than chords under mf, and louder under ff', () => {
  const chordGains = (mark) => {
    const xml = score([`${mark ? dyn(mark) : ''}${harmony}${quarters('E4', 'E4', 'E4', 'E4')}`]);
    const plan = buildPlayback(ScoreDocument.parse(xml), 60);
    assert.ok(plan.chords.length > 0);
    return Math.max(...plan.chords.map((c) => c.gain));
  };
  const mf = chordGains(null);
  const pp = chordGains('pp');
  const ff = chordGains('ff');
  assert.ok(pp < mf - 0.1, `pp ${pp} mf ${mf}`);
  assert.ok(ff > mf, `ff ${ff} mf ${mf}`);
});
