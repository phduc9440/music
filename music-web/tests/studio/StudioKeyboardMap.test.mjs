import assert from 'node:assert/strict';
import test from 'node:test';

import { STUDIO_KEYBOARD_MAP } from '../../src/components/player/engine/studioKeyboardMap.ts';

test('maps two distinct keyboard rows to two consecutive octaves', () => {
  const entries = Object.entries(STUDIO_KEYBOARD_MAP);
  const semitones = entries.map(([, semitone]) => semitone).sort((a, b) => a - b);
  const keys = entries.map(([key]) => key);

  assert.deepEqual(
    semitones,
    Array.from({ length: 25 }, (_, index) => index - 12),
  );
  assert.equal(new Set(keys).size, 25);
  assert.ok(!keys.includes('z'));
  assert.ok(!keys.includes('x'));
});
