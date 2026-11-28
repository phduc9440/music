import assert from 'node:assert/strict';
import test from 'node:test';

import { EMPTY_MIXER, silentTracks, trackGain, withTrackMix } from '../../src/components/player/state/mixer.ts';

// Nghe riêng phần đệm hợp âm / chỉ giai điệu làm bằng nút M / S ở hàng "Hợp âm" của Mixer
const ids = ['0:1', 'chords'];
const piano = ['0:1', '0:2', 'chords'];

test('mặc định nghe cả giai điệu và hợp âm', () => {
  assert.deepEqual(silentTracks(EMPTY_MIXER, ids), new Set());
});

test('Solo hàng Hợp âm: chỉ nghe hợp âm, cả hai tay im', () => {
  const m = withTrackMix(EMPTY_MIXER, 'chords', { solo: true });
  assert.deepEqual(
    piano.map((id) => trackGain(m, piano, id)),
    [0, 0, 1],
  );
});

test('Mute hàng Hợp âm: chỉ nghe giai điệu', () => {
  const m = withTrackMix(EMPTY_MIXER, 'chords', { mute: true });
  assert.equal(trackGain(m, ids, '0:1'), 1);
  assert.equal(trackGain(m, ids, 'chords'), 0);
  assert.deepEqual(silentTracks(m, ids), new Set(['chords']));
});

test('Solo một tay thì phần đệm cũng im (công tắc "đánh lại" bị khóa)', () => {
  const m = withTrackMix(EMPTY_MIXER, '0:1', { solo: true });
  assert.ok(silentTracks(m, piano).has('chords'));
});

test('âm lượng giữ nguyên khi bỏ Mute', () => {
  const m = withTrackMix(withTrackMix(EMPTY_MIXER, 'chords', { volume: 40, mute: true }), 'chords', { mute: false });
  assert.equal(trackGain(m, ids, 'chords'), 0.4);
});
