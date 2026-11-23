import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { note, quarters, score } from './support/score.mjs';

test('parse từ chối XML hỏng, root sai và bản không có ô nhịp', () => {
  assert.throws(() => ScoreDocument.parse('<score-partwise><part>'));
  assert.throws(() => ScoreDocument.parse('<score-timewise><part id="P1"/></score-timewise>'));
  assert.throws(() => ScoreDocument.parse('<score-partwise><part-list/><part id="P1"/></score-partwise>'));
});

test('id nốt theo ô/khuông/bè/thứ tự, hợp âm có hậu tố c', () => {
  const doc = ScoreDocument.parse(score([note('C4') + note('E4', { chord: true }) + quarters('D4', 'E4', 'F4')]));
  assert.deepEqual(
    doc.notes.map((n) => n.id),
    ['m0-s1-v1-0', 'm0-s1-v1-0c1', 'm0-s1-v1-1', 'm0-s1-v1-2', 'm0-s1-v1-3'],
  );
  assert.equal(doc.getInfo('m0-s1-v1-0c1').midi, 64);
  assert.equal(doc.getInfo('m0-s1-v1-0c1').onsetKey, doc.getInfo('m0-s1-v1-0').onsetKey);
});

test('onsetKey tính theo đơn vị nốt tròn, kể cả sau <backup>', () => {
  const body =
    quarters('C5', 'D5', 'E5', 'F5') +
    '<backup><duration>4</duration></backup>' +
    note('C3', { dur: 4, type: 'whole', voice: 2 });
  const doc = ScoreDocument.parse(score([body]));
  assert.equal(doc.getInfo('m0-s1-v1-2').onsetKey, 50000);
  assert.equal(doc.getInfo('m0-s1-v2-0').onsetKey, 0);
});

test('measureCount, keyAt, timeAt, divisionsAt', () => {
  const doc = ScoreDocument.parse(
    score([quarters('C4', 'D4', 'E4'), quarters('F4', 'G4', 'A4')], { fifths: -2, beats: 3, divisions: 2 }),
  );
  assert.equal(doc.measureCount, 2);
  assert.equal(doc.keyAt(1), -2);
  assert.deepEqual(doc.timeAt(1), { beats: 3, beatType: 4, free: false });
  assert.equal(doc.divisionsAt(1), 2);
});

test('serialize bỏ DOCTYPE và parse lại ra cùng nốt', () => {
  const xml = score([quarters('C4', 'D4', 'E4', 'F4')]).replace(
    '<score-partwise',
    '<!DOCTYPE score-partwise PUBLIC "x" "y"><score-partwise',
  );
  const doc = ScoreDocument.parse(xml);
  const out = doc.serialize();
  assert.equal(out.includes('DOCTYPE'), false);
  assert.deepEqual(
    ScoreDocument.parse(out).notes.map((n) => n.midi),
    [60, 62, 64, 65],
  );
});

test('restore thay toàn bộ nội dung và tính lại id', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  doc.restore(score([quarters('G4', 'A4', 'B4', 'C5'), quarters('D5', 'E5', 'F5', 'G5')]));
  assert.equal(doc.measureCount, 2);
  assert.equal(doc.getInfo('m1-s1-v1-0').midi, 74);
});
