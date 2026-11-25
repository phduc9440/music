import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_MIXER,
  chordListenMode,
  chordListenPatches,
  trackGain,
  withTrackMix,
} from '../../src/components/player/state/mixer.ts';

const ids = ['0:1', 'chords'];
const apply = (mixer, mode, trackIds = ids) =>
  chordListenPatches(mode, trackIds, 'chords').reduce((m, [id, patch]) => withTrackMix(m, id, patch), mixer);

test('mặc định nghe cả giai điệu và hợp âm', () => {
  assert.equal(chordListenMode(EMPTY_MIXER, ids, 'chords'), 'both');
});

test('chỉ hợp âm: track hợp âm Solo, giai điệu im', () => {
  const m = apply(EMPTY_MIXER, 'chords');
  assert.equal(trackGain(m, ids, '0:1'), 0);
  assert.equal(trackGain(m, ids, 'chords'), 1);
  assert.equal(chordListenMode(m, ids, 'chords'), 'chords');
});

test('chỉ giai điệu: tắt tiếng hợp âm, bỏ Solo cũ', () => {
  const m = apply(apply(EMPTY_MIXER, 'chords'), 'melody');
  assert.equal(trackGain(m, ids, '0:1'), 1);
  assert.equal(trackGain(m, ids, 'chords'), 0);
  assert.equal(chordListenMode(m, ids, 'chords'), 'melody');
});

test('cả hai: bỏ mọi Mute / Solo nhưng giữ âm lượng', () => {
  const start = withTrackMix(withTrackMix(EMPTY_MIXER, 'chords', { volume: 40, mute: true }), '0:1', { solo: true });
  const m = apply(start, 'both');
  assert.equal(chordListenMode(m, ids, 'chords'), 'both');
  assert.equal(trackGain(m, ids, 'chords'), 0.4);
  assert.equal(trackGain(m, ids, '0:1'), 1);
});

test('bản hai tay có hợp âm: "chỉ hợp âm" làm im cả hai tay', () => {
  const piano = ['0:1', '0:2', 'chords'];
  const m = apply(EMPTY_MIXER, 'chords', piano);
  assert.deepEqual(
    piano.map((id) => trackGain(m, piano, id)),
    [0, 0, 1],
  );
  assert.equal(chordListenMode(m, piano, 'chords'), 'chords');
});

test('Mute tay trái của bản hai tay vẫn tính là "cả hai"', () => {
  const piano = ['0:1', '0:2', 'chords'];
  const m = withTrackMix(EMPTY_MIXER, '0:2', { mute: true });
  assert.equal(chordListenMode(m, piano, 'chords'), 'both');
});
