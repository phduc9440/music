// CH-04: chọn bè giai điệu cho gợi ý hợp âm
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { melodyChoicesOf } from '../../src/components/scores/chords/melodyChoices.ts';

const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
const note = (staff) =>
  `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration>${staff ? `<staff>${staff}</staff>` : ''}</note>`;

test('piano hai khuông cho hai lựa chọn, khuông 1 đứng đầu', () => {
  const doc = parse(
    `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>` +
      `<part id="P1"><measure number="1"><attributes><staves>2</staves></attributes>${note(1)}${note(2)}</measure></part></score-partwise>`,
  );
  const choices = melodyChoicesOf(doc);
  assert.deepEqual(
    choices.map((c) => [c.partIndex, c.staff]),
    [
      [0, 1],
      [0, 2],
    ],
  );
  assert.match(choices[1].label, /Piano/);
});

test('bỏ part không có nốt có cao độ, giữ thứ tự part', () => {
  const doc = parse(
    `<score-partwise><part-list><score-part id="P1"><part-name>Trống</part-name></score-part>` +
      `<score-part id="P2"><part-name>Sáo</part-name></score-part></part-list>` +
      `<part id="P1"><measure number="1"><note><unpitched/><duration>4</duration></note></measure></part>` +
      `<part id="P2"><measure number="1">${note()}</measure></part></score-partwise>`,
  );
  assert.deepEqual(melodyChoicesOf(doc), [{ partIndex: 1, staff: 1, label: 'Sáo' }]);
});
