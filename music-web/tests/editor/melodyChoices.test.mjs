import assert from 'node:assert/strict';
import test from 'node:test';

import { listMelodyChoices, melodyChoiceKey } from '../../src/components/scores/chords/melodyChoices.ts';

const note = (step, staff) =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration>${staff ? `<staff>${staff}</staff>` : ''}</note>`;
const unpitched = '<note><unpitched><display-step>C</display-step><display-octave>4</display-octave></unpitched><duration>4</duration></note>';

const score = (partList, parts) =>
  `<?xml version="1.0"?><score-partwise><part-list>${partList}</part-list>${parts}</score-partwise>`;
const scorePart = (id, name) => `<score-part id="${id}"><part-name>${name}</part-name></score-part>`;
const part = (id, content) => `<part id="${id}"><measure number="1">${content}</measure></part>`;

test('một part một khuông: một lựa chọn', () => {
  const choices = listMelodyChoices(score(scorePart('P1', 'Piano'), part('P1', note('C'))));
  assert.deepEqual(choices, [{ partIndex: 0, staff: 1, partName: 'Piano', staffCount: 1 }]);
});

test('hai part: mỗi part một lựa chọn, đánh số part theo thứ tự trong file', () => {
  const choices = listMelodyChoices(
    score(scorePart('P1', 'Soprano') + scorePart('P2', 'Bass'), part('P1', note('C')) + part('P2', note('G'))),
  );
  assert.deepEqual(
    choices.map((c) => [c.partIndex, c.staff, c.partName]),
    [
      [0, 1, 'Soprano'],
      [1, 1, 'Bass'],
    ],
  );
});

test('piano hai khuông: mỗi khuông có nốt là một lựa chọn, kèm số khuông của part', () => {
  const choices = listMelodyChoices(
    score(scorePart('P1', 'Piano'), part('P1', note('C', 1) + note('E', 1) + note('C', 2))),
  );
  assert.deepEqual(
    choices.map((c) => [c.partIndex, c.staff, c.staffCount]),
    [
      [0, 1, 2],
      [0, 2, 2],
    ],
  );
});

test('part bộ gõ (không có nốt cao độ) bị bỏ nhưng vẫn giữ nguyên số thứ tự part', () => {
  const choices = listMelodyChoices(
    score(scorePart('P1', 'Drums') + scorePart('P2', 'Piano'), part('P1', unpitched) + part('P2', note('C'))),
  );
  assert.deepEqual(
    choices.map((c) => [c.partIndex, c.partName]),
    [[1, 'Piano']],
  );
});

test('file hỏng hoặc không phải score-partwise: không có lựa chọn', () => {
  assert.deepEqual(listMelodyChoices('<oops'), []);
  assert.deepEqual(listMelodyChoices('<score-timewise/>'), []);
});

test('khóa của thẻ chọn là "part:khuông"', () => {
  assert.equal(melodyChoiceKey({ partIndex: 2, staff: 1 }), '2:1');
});
