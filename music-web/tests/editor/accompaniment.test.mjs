import assert from 'node:assert/strict';
import test from 'node:test';

import { accompanimentHits, beatGrid, voiceChord } from '../../src/components/editor/audio/accompaniment.ts';
import { buildPlayback } from '../../src/components/editor/audio/playback.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { quarters, score } from './support/score.mjs';

const C = { bass: 36, tones: [52, 55, 60] };
const at = (hits) => [...new Set(hits.map((h) => h.q))];

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

test('broken chords go up and down an open 1–5–8–10 shape in eighths, each note ringing like a pedal', () => {
  const hits = accompanimentHits(C, 0, 4, { beats: 4, beatType: 4 }, 'arpeggio', 90);
  assert.deepEqual(
    hits.map((h) => h.midi),
    [36, 43, 48, 52, 55, 52, 48, 43],
  );
  assert.deepEqual(at(hits), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  // E4 (52) vang tới khi được đánh lại ở phách 3,5; G4 (55) ở đỉnh vang tới hết hợp âm
  assert.equal(hits[3].length, 1);
  assert.equal(hits[4].q + hits[4].length, 4);
  assert.ok(hits[0].bass && hits[0].weight > hits[1].weight);
  // bài nhanh: mỗi phách một nốt
  assert.deepEqual(at(accompanimentHits(C, 0, 2, { beats: 4, beatType: 4 }, 'arpeggio', 140)), [0, 1]);
});

test('voicing moves smoothly from chord to chord and stays under the melody', () => {
  const c = voiceChord({ bass: 36, tones: [52, 55, 60] }, null, 67);
  const f = voiceChord({ bass: 41, tones: [53, 57, 60] }, c, 67);
  const g = voiceChord({ bass: 43, tones: [55, 59, 62] }, f, 67);
  for (const v of [c, f, g]) assert.ok(Math.max(...v.tones) <= 67 && Math.min(...v.tones) >= 50, JSON.stringify(v));
  // F giữ nốt chung C với hợp âm C, mỗi bè đi không quá một quãng ba
  const moves = (a, b) => a.tones.map((t, i) => Math.abs(t - b.tones[i]));
  assert.ok(f.tones.includes(60) && c.tones.includes(60));
  assert.ok(moves(c, f).every((m) => m <= 4) && moves(f, g).every((m) => m <= 4), JSON.stringify([c, f, g]));
  // bass gần bass trước, không nhảy quãng tám
  assert.ok(Math.abs(f.bass - c.bass) <= 7 && Math.abs(g.bass - f.bass) <= 7);
  // giai điệu thấp thì hợp âm hạ xuống dưới nó
  assert.ok(Math.max(...voiceChord({ bass: 36, tones: [52, 55, 60] }, null, 61).tones) <= 61);
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

test('march strikes every beat, with bass octave on 1 and the fifth on 3, offbeats lighter', () => {
  const hits = accompanimentHits(C, 0, 4, { beats: 4, beatType: 4 }, 'march', 110);
  assert.deepEqual(at(hits), [0, 1, 2, 3]);
  assert.deepEqual(
    hits.filter((h) => h.bass).map((h) => [h.q, h.midi]),
    [
      [0, 36],
      [0, 48],
      [2, 43],
    ],
  );
  const loudest = (q) => Math.max(...hits.filter((h) => h.q === q).map((h) => h.weight));
  assert.ok(loudest(0) > loudest(1) && loudest(2) > loudest(3));
});

test('a chord starting off the beat is struck where it starts', () => {
  assert.deepEqual(at(accompanimentHits(C, 1.5, 4, { beats: 4, beatType: 4 }, 'march', 110)), [1.5, 2, 3]);
});

test("the style is the listener's choice: expression text in the score does not change it", () => {
  const words = '<direction placement="above"><direction-type><words>Hào hùng</words></direction-type></direction>';
  const harmony = '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>';
  const doc = ScoreDocument.parse(score([`${words}${harmony}${quarters('E4', 'E4', 'E4', 'E4')}`]));
  const times = (style) => [
    ...new Set(
      buildPlayback(doc, 60, style ? { chordStyle: style } : {}).chords.map((c) => Math.round(c.time * 20) / 20),
    ),
  ];
  // mặc định hợp âm ngân: một lần dập (rải vài mili giây), dù bản nhạc ghi "Hào hùng"
  assert.ok(times().every((t) => t <= 0.05));
  assert.deepEqual(times('march'), [0, 1, 2, 3]);
});
