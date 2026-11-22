import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { makeTuplet, ratioOf, removeTuplet, TUPLET_PRESETS } from '../../src/components/editor/notes/tuplets.ts';
import { checkMeasures } from '../../src/components/editor/structure/measureCheck.ts';
import { note, quarters, score } from './support/score.mjs';

test('TUPLET_PRESETS có chùm ba 3:2', () => {
  assert.equal(
    TUPLET_PRESETS.some((p) => p.actual === 3 && p.normal === 2),
    true,
  );
});

test('makeTuplet 3:2 trên một nốt đen tạo ba nốt chùm ba, ô vẫn đủ phách', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  const result = makeTuplet(doc, 'm0-s1-v1-0', 3, 2);
  assert.equal(result.ok, true);
  const tupletNotes = doc.notes.filter((n) => ratioOf(n.element));
  assert.equal(tupletNotes.length, 3);
  assert.deepEqual(ratioOf(tupletNotes[0].element), { actual: 3, normal: 2 });
  assert.deepEqual(checkMeasures(doc), []);
});

test('removeTuplet trả về một nốt thường, ô vẫn đủ phách', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  makeTuplet(doc, 'm0-s1-v1-0', 3, 2);
  const result = removeTuplet(doc, 'm0-s1-v1-0');
  assert.equal(result.ok, true);
  assert.equal(
    doc.notes.some((n) => ratioOf(n.element)),
    false,
  );
  assert.deepEqual(checkMeasures(doc), []);
});

test('removeTuplet trên nốt thường báo noTuplet', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  assert.deepEqual(removeTuplet(doc, 'm0-s1-v1-0'), { ok: false, reason: 'noTuplet' });
});

test('ratioOf đọc time-modification', () => {
  const doc = ScoreDocument.parse(
    score(
      [
        note('C4', { dur: 2, type: 'eighth', tuplet: [3, 2] }) +
          note('D4', { dur: 2, type: 'eighth', tuplet: [3, 2] }) +
          note('E4', { dur: 2, type: 'eighth', tuplet: [3, 2] }) +
          note('F4', { dur: 6, type: 'half', dots: 1 }),
      ],
      { divisions: 3 },
    ),
  );
  assert.deepEqual(ratioOf(doc.getNote('m0-s1-v1-0')), { actual: 3, normal: 2 });
  assert.equal(ratioOf(doc.getNote('m0-s1-v1-3')), null);
});
