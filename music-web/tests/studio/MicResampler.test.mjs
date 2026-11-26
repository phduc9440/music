// ST-15: thu ở 44,1 / 48 kHz rồi hạ về 22 050 Hz cho Basic Pitch
import assert from 'node:assert/strict';
import test from 'node:test';

import { MicResampler } from '../../src/components/player/engine/micResampler.ts';

test('same rate passes samples through', () => {
  const resampler = new MicResampler(22050, 22050);
  const input = Float32Array.from([0.1, 0.2]);
  assert.equal(resampler.process(input), input);
});

test('44.1 kHz halves the sample count across uneven blocks', () => {
  const resampler = new MicResampler(44100, 22050);
  let total = 0;
  for (const size of [128, 127, 129, 1000, 3]) total += resampler.process(new Float32Array(size).fill(0.5)).length;
  assert.equal(total, Math.floor((128 + 127 + 129 + 1000 + 3) / 2));
});

test('48 kHz keeps the duration and averages values', () => {
  const resampler = new MicResampler(48000, 22050);
  const out = resampler.process(new Float32Array(48000).fill(0.25));
  assert.ok(Math.abs(out.length - 22050) <= 1, `got ${out.length}`);
  assert.ok(out.every((v) => Math.abs(v - 0.25) < 1e-6));
});
