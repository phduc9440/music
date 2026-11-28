import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accompanimentHits,
  beatGrid,
  detectAccompaniment,
  plainText,
} from '../../src/components/editor/audio/accompaniment.ts';
import { buildPlayback } from '../../src/components/editor/audio/playback.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { quarters, score } from './support/score.mjs';

const C = { bass: 36, tones: [52, 55, 60] };
const at = (hits) => [...new Set(hits.map((h) => h.q))];

test('expression text picks the style, Vietnamese with or without diacritics', () => {
  assert.equal(plainText('Vui Tươi – Đều'), 'vui tuoi – deu');
  assert.equal(detectAccompaniment(['Vui tươi'], 100), 'bounce');
  assert.equal(detectAccompaniment(['Hào hùng'], 100), 'march');
  assert.equal(detectAccompaniment(['Tha thiết, trữ tình'], 100), 'arpeggio');
  assert.equal(detectAccompaniment(['Allegro con brio'], 100), 'bounce'); // từ đứng trước được tính
  assert.equal(detectAccompaniment(['Maestoso'], 100), 'march');
  assert.equal(detectAccompaniment(['Andante cantabile'], 140), 'arpeggio');
  // không có chữ: theo tempo
  assert.equal(detectAccompaniment([], 140), 'bounce');
  assert.equal(detectAccompaniment([], 72), 'arpeggio');
});

test('beat grid handles simple and compound meters', () => {
  assert.deepEqual(beatGrid({ beats: 4, beatType: 4 }), { beat: 1, count: 4, compound: false });
  assert.deepEqual(beatGrid({ beats: 6, beatType: 8 }), { beat: 1.5, count: 2, compound: true });
  assert.deepEqual(beatGrid({ beats: 3, beatType: 8 }), { beat: 0.5, count: 3, compound: false });
});

test('held chords strike once, rolled from the bass up', () => {
  const hits = accompanimentHits(C, 0, 4, { beats: 4, beatType: 4 }, 'sustain', 100);
  assert.deepEqual(at(hits), [0]);
  assert.deepEqual(
    hits.map((h) => [h.midi, h.roll]),
    [
      [36, 0],
      [52, 1],
      [55, 2],
      [60, 3],
    ],
  );
});

test('broken chords move in eighths, bass first, notes ring to the end of the chord', () => {
  const hits = accompanimentHits(C, 0, 2, { beats: 4, beatType: 4 }, 'arpeggio', 90);
  assert.deepEqual(
    hits.map((h) => [h.q, h.midi]),
    [
      [0, 36],
      [0.5, 52],
      [1, 55],
      [1.5, 60],
    ],
  );
  assert.ok(hits.every((h) => Math.abs(h.q + h.length - 2) < 1e-9));
  // bài nhanh: mỗi phách một nốt
  assert.deepEqual(at(accompanimentHits(C, 0, 2, { beats: 4, beatType: 4 }, 'arpeggio', 140)), [0, 1]);
});

test('bass–chord gives a waltz in 3/4 and bass on 1 and 3 in 4/4', () => {
  const waltz = accompanimentHits(C, 0, 3, { beats: 3, beatType: 4 }, 'bounce', 120);
  assert.deepEqual(
    at(waltz).map((q) =>
      waltz
        .filter((h) => h.q === q)
        .map((h) => (h.bass ? 'B' : 'c'))
        .join(''),
    ),
    ['B', 'ccc', 'ccc'],
  );
  const four = accompanimentHits(C, 0, 4, { beats: 4, beatType: 4 }, 'bounce', 120);
  const bassAt = four.filter((h) => h.bass).map((h) => [h.q, h.midi]);
  assert.deepEqual(bassAt, [
    [0, 36],
    [2, 43],
  ]);
  // 6/8: bass rồi hai móc đơn hợp âm mỗi phách
  const six = accompanimentHits(C, 0, 3, { beats: 6, beatType: 8 }, 'bounce', 120);
  assert.deepEqual(at(six), [0, 0.5, 1, 1.5, 2, 2.5]);
});

test('march strikes every beat with the downbeat accented', () => {
  const hits = accompanimentHits(C, 0, 4, { beats: 4, beatType: 4 }, 'march', 110);
  assert.deepEqual(at(hits), [0, 1, 2, 3]);
  assert.ok(hits.filter((h) => h.q === 0).every((h) => h.weight > 1));
});

test('a chord starting off the beat is struck where it starts', () => {
  assert.deepEqual(at(accompanimentHits(C, 1.5, 4, { beats: 4, beatType: 4 }, 'march', 110)), [1.5, 2, 3]);
});

test('playback reads the opening expression text in auto mode and honors an explicit style', () => {
  const words = '<direction placement="above"><direction-type><words>Hào hùng</words></direction-type></direction>';
  const harmony = '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>';
  const doc = ScoreDocument.parse(score([`${words}${harmony}${quarters('E4', 'E4', 'E4', 'E4')}`]));
  assert.equal(buildPlayback(doc, 100).chordStyle, 'march');
  assert.equal(buildPlayback(doc, 100, { chordStyle: 'sustain' }).chordStyle, 'sustain');
  const times = [...new Set(buildPlayback(doc, 60).chords.map((c) => c.time))];
  assert.deepEqual(times, [0, 1, 2, 3]);
});
