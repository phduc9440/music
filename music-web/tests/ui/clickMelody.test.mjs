import assert from 'node:assert/strict';
import test from 'node:test';

import { createClickMelody, readSoundOn, writeSoundOn } from '../../src/components/ui/clickMelody.ts';

const songA = {
  notes: [
    { midi: 64, bass: [45] },
    { midi: 62, bass: [] },
  ],
};
const empty = { notes: [] };
const songB = { notes: [{ midi: 60, bass: [48, 55] }] };

test('each click returns the next note of the current song', () => {
  const melody = createClickMelody([songA, songB]);
  assert.deepEqual(melody.next(), { midi: 64, bass: [45] });
  assert.deepEqual(melody.next(), { midi: 62, bass: [] });
});

test('after the last note it moves on to the next song, skipping empty ones, and wraps around', () => {
  const melody = createClickMelody([songA, empty, songB]);
  melody.next();
  melody.next();
  assert.equal(melody.next()?.midi, 60);
  assert.equal(melody.next()?.midi, 64);
});

test('no songs with notes gives no note instead of looping forever', () => {
  assert.equal(createClickMelody([empty]).next(), null);
});

test('sound is on by default and the choice is remembered', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readSoundOn(storage), true);
  writeSoundOn(storage, false);
  assert.equal(readSoundOn(storage), false);
  writeSoundOn(storage, true);
  assert.equal(readSoundOn(storage), true);
});

test('blocked storage falls back to sound on without throwing', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(readSoundOn(broken), true);
  assert.doesNotThrow(() => writeSoundOn(broken, false));
});
