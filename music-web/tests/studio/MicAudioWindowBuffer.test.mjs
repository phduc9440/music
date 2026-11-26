import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIC_HOP_SAMPLES,
  MIC_SAMPLE_RATE,
  MIC_WINDOW_SAMPLES,
  MicAudioWindowBuffer,
} from '../../src/components/player/engine/micAudioWindowBuffer.ts';

test('emits overlapping model windows only after a full input window is available', () => {
  const buffer = new MicAudioWindowBuffer();
  assert.deepEqual(buffer.append(new Float32Array(MIC_WINDOW_SAMPLES - 1)), []);

  const [first] = buffer.append(new Float32Array(1).fill(1));
  assert.equal(first.startSample, 0);
  assert.equal(first.coveredUntilSample, MIC_HOP_SAMPLES);
  assert.equal(first.samples.length, MIC_WINDOW_SAMPLES);
  assert.equal(first.samples.at(-1), 1);

  const [second] = buffer.append(new Float32Array(MIC_HOP_SAMPLES));
  assert.equal(second.startSample, MIC_HOP_SAMPLES);
  assert.equal(second.coveredUntilSample, MIC_HOP_SAMPLES * 2);
});

test('flushes the final uncommitted audio and pads short takes with silence', () => {
  const shortBuffer = new MicAudioWindowBuffer();
  const oneSecondOfAudio = new Float32Array(MIC_SAMPLE_RATE).fill(0.5);
  assert.deepEqual(shortBuffer.append(oneSecondOfAudio), []);

  const finalWindow = shortBuffer.finish();
  assert.equal(finalWindow.startSample, 0);
  assert.equal(finalWindow.coveredUntilSample, MIC_SAMPLE_RATE);
  assert.equal(finalWindow.samples.length, MIC_WINDOW_SAMPLES);
  assert.equal(finalWindow.samples[MIC_SAMPLE_RATE - 1], 0.5);
  assert.equal(finalWindow.samples[MIC_SAMPLE_RATE], 0);
  assert.equal(shortBuffer.durationMs, 1000);
});

test('retains the context needed to analyze the final tail after multiple windows', () => {
  const buffer = new MicAudioWindowBuffer();
  const firstWindows = buffer.append(new Float32Array(MIC_WINDOW_SAMPLES + MIC_HOP_SAMPLES).fill(0.25));
  assert.equal(firstWindows.length, 2);

  const finalWindow = buffer.finish();
  assert.equal(finalWindow.startSample, MIC_HOP_SAMPLES);
  assert.equal(finalWindow.coveredUntilSample, MIC_WINDOW_SAMPLES + MIC_HOP_SAMPLES);
  assert.equal(finalWindow.samples[0], 0.25);
});

test('finishes once and rejects further audio', () => {
  const buffer = new MicAudioWindowBuffer();
  buffer.finish();
  assert.throws(() => buffer.append(new Float32Array(1)), /already finished/);
  assert.throws(() => buffer.finish(), /already finished/);
});
