import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlayback } from '../../src/components/editor/audio/playback.ts';
import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import {
  addChordLetter,
  addChordNote,
  addChordPitch,
  addHarmonyVoice,
  addVoiceNote,
  harmonyPitch,
  removeVoice,
} from '../../src/components/editor/notes/voices.ts';
import { checkMeasures } from '../../src/components/editor/structure/measureCheck.ts';
import { measureSummary, nameOf, note, quarters, score } from './support/score.mjs';

const P = (step, octave, alter = 0) => ({ step, alter, octave });

/** Các nốt của một hợp âm (theo id nốt đầu), từ thấp lên cao. */
const chordNames = (doc, headId) => {
  const head = doc.getInfo(headId);
  return doc.notes
    .filter(
      (n) =>
        n.measureIndex === head.measureIndex &&
        n.staff === head.staff &&
        n.voice === head.voice &&
        n.entryIndex === head.entryIndex,
    )
    .sort((a, b) => a.midi - b.midi)
    .map((n) => nameOf(doc, n.id));
};

const stems = (doc, voice) =>
  doc.notes
    .filter((n) => n.voice === voice && !n.isRest)
    .map((n) => n.element.querySelector('stem')?.textContent ?? '');

test('bè thân chồng dưới nốt thấp nhất / trên nốt cao nhất: bấm hai lần ra hợp âm ba nốt', () => {
  const doc = ScoreDocument.parse(score([quarters('G4', 'A4', 'B4', 'C5')]));
  const head = doc.notes[0].id;
  assert.ok(addChordNote(doc, [head], -1).ok);
  assert.deepEqual(chordNames(doc, head), ['E4', 'G4']);
  assert.ok(addChordNote(doc, [head], -1).ok);
  assert.deepEqual(chordNames(doc, head), ['C4', 'E4', 'G4']);
  assert.ok(addChordNote(doc, [head], 1).ok);
  assert.deepEqual(chordNames(doc, head), ['C4', 'E4', 'G4', 'B4']);
  assert.equal(checkMeasures(doc).length, 0);
});

test('bè thân theo hợp âm ghi trên bản: lấy nốt gần nhất thuộc hợp âm, kể cả dấu hóa ngoài khóa', () => {
  const harmony = (step, kind, alter = 0) =>
    `<harmony><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind>${kind}</kind></harmony>`;
  // ô 1: hợp âm C, giai điệu F (nốt lướt): quãng ba dưới là D (không thuộc C) -> lấy quãng bốn C
  // ô 2: hợp âm A7 (A C# E G), giai điệu E: quãng ba dưới là C -> C# thuộc hợp âm
  const doc = ScoreDocument.parse(
    score([
      harmony('C', 'major') + quarters('F4', 'E4', 'G4', 'C5'),
      harmony('A', 'dominant') + quarters('E5', 'A4', 'G4', 'A4'),
    ]),
  );
  const m1 = doc.notes.find((n) => n.measureIndex === 0 && n.entryIndex === 0).id;
  const m2 = doc.notes.find((n) => n.measureIndex === 1 && n.entryIndex === 0).id;
  assert.ok(addChordNote(doc, [m1, m2], -1).ok);
  assert.deepEqual(chordNames(doc, m1), ['C4', 'F4']);
  assert.deepEqual(chordNames(doc, m2), ['C#5', 'E5']);
});

test('harmonyPitch không có hợp âm thì cách một quãng ba theo khóa', () => {
  assert.deepEqual(harmonyPitch(P('E', 5), -1, 0, null), P('C', 5));
  assert.deepEqual(harmonyPitch(P('A', 4), 1, 1, null), P('C', 5)); // Sol trưởng: Đô tự nhiên
  assert.deepEqual(harmonyPitch(P('D', 5), -1, 1, null), P('B', 4));
});

test('thêm đúng cao độ vào hợp âm: quãng hai chung thân được, trùng thì từ chối, Fa và Fa# cùng chỗ thì phải sang bè riêng', () => {
  const doc = ScoreDocument.parse(score([quarters('E4', 'D4', 'E4', 'F4')]));
  const head = doc.notes[0].id;
  // Mi - Fa cách nửa cung (dòng kẻ và khe kế bên): chung thân, bộ vẽ tự đặt lệch
  const added = addChordPitch(doc, head, P('F', 4));
  assert.ok(added.ok);
  assert.deepEqual(chordNames(doc, head), ['E4', 'F4']);
  assert.equal(nameOf(doc, added.command.selectAfter[0]), 'F4');
  assert.deepEqual(addChordPitch(doc, head, P('E', 4)), { ok: false, reason: 'duplicate' });
  assert.deepEqual(addChordPitch(doc, head, P('F', 4, 1)), { ok: false, reason: 'unison' });
});

test('Shift + chữ cái: nốt gần nhất phía trên nốt cao nhất (Alt: phía dưới nốt thấp nhất), theo dấu hóa của khóa', () => {
  const doc = ScoreDocument.parse(score([quarters('D4', 'E4', 'F#4', 'G4')], { fifths: 1 }));
  const head = doc.notes[0].id;
  assert.ok(addChordLetter(doc, head, 'f', 1).ok);
  assert.deepEqual(chordNames(doc, head), ['D4', 'F#4']);
  assert.ok(addChordLetter(doc, head, 'd', 1).ok); // cùng tên nốt chính: lên một quãng tám
  assert.deepEqual(chordNames(doc, head), ['D4', 'F#4', 'D5']);
  assert.ok(addChordLetter(doc, head, 'b', -1).ok);
  assert.deepEqual(chordNames(doc, head), ['B3', 'D4', 'F#4', 'D5']);
});

test('bè riêng tại một cột: nốt vào bè hai đúng thời điểm, dấu lặng ẩn trước/sau, hai bè tách hướng thân', () => {
  const doc = ScoreDocument.parse(score([quarters('C5', 'D5', 'E5', 'F5')]));
  const third = doc.notes[2].id; // E5 ở phách 3
  const result = addVoiceNote(doc, third, P('C', 5), { type: 'quarter', dots: 0 });
  assert.ok(result.ok);
  const voice2 = doc.notes.filter((n) => n.voice !== 1);
  assert.deepEqual(
    voice2.map(
      (n) => `${n.isRest ? 'rest' : nameOf(doc, n.id)}${n.element.getAttribute('print-object') === 'no' ? '(ẩn)' : ''}`,
    ),
    ['rest(ẩn)', 'C5', 'rest(ẩn)'],
  );
  assert.equal(voice2[1].onsetKey, doc.notes[2].onsetKey);
  assert.deepEqual(stems(doc, 1), ['up', 'up', 'up', 'up']);
  assert.deepEqual(stems(doc, voice2[0].voice), ['down']);
  assert.equal(checkMeasures(doc).length, 0);

  // thêm nốt thứ hai vào bè đã có: thay chỗ dấu lặng ẩn ở phách 1
  const again = addVoiceNote(doc, doc.notes[0].id, P('A', 4), { type: 'half', dots: 0 });
  assert.ok(again.ok);
  assert.deepEqual(
    doc.notes.filter((n) => n.voice !== 1).map((n) => (n.isRest ? 'rest' : nameOf(doc, n.id))),
    ['A4', 'C5', 'rest'],
  );
  // phách 1–2 đã có nốt: không thêm chồng
  assert.deepEqual(addVoiceNote(doc, doc.notes[1].id, P('B', 4), { type: 'quarter', dots: 0 }), {
    ok: false,
    reason: 'noSpace',
  });
});

test('chép bè chỉ chép các nốt đang chọn, các ô dùng chung một số bè, xóa bè thì bỏ hướng thân đã ép', () => {
  const doc = ScoreDocument.parse(score([quarters('E5', 'F5', 'G5', 'A5'), quarters('G5', 'F5', 'E5', 'D5')]));
  const pick = [doc.notes[1].id, doc.notes[2].id, doc.notes[4].id];
  const result = addHarmonyVoice(doc, pick, -2);
  assert.ok(result.ok);
  const second = doc.notes.filter((n) => n.voice !== 1);
  assert.equal(new Set(second.map((n) => n.voice)).size, 1);
  assert.deepEqual(
    second.filter((n) => n.measureIndex === 0).map((n) => (n.isRest ? 'rest' : nameOf(doc, n.id))),
    ['rest', 'D5', 'E5', 'rest'],
  );
  assert.deepEqual(
    second.filter((n) => n.measureIndex === 1).map((n) => (n.isRest ? 'rest' : nameOf(doc, n.id))),
    ['E5', 'rest'],
  );
  assert.ok(second.filter((n) => n.isRest).every((n) => n.element.getAttribute('print-object') === 'no'));
  assert.deepEqual(result.command.selectAfter.length, 3);
  assert.equal(checkMeasures(doc).length, 0);
  assert.ok(stems(doc, 1).every((s) => s === 'up'));

  assert.ok(removeVoice(doc, [doc.notes.find((n) => n.voice !== 1 && !n.isRest).id]).ok);
  assert.ok(doc.notes.filter((n) => n.measureIndex === 0).every((n) => n.element.querySelector('stem') === null));
  assert.deepEqual(measureSummary(doc, 0), ['E5:quarter/1', 'F5:quarter/1', 'G5:quarter/1', 'A5:quarter/1']);
});

test('bè trống vẫn là một dấu lặng cả ô để bấm vào nhập nốt', () => {
  const doc = ScoreDocument.parse(score([quarters('C5', 'D5', 'E5', 'F5')]));
  const result = addHarmonyVoice(doc, [doc.notes[0].id], 0, true);
  assert.ok(result.ok);
  const rest = doc.getInfo(result.command.selectAfter[0]);
  assert.ok(rest.isRest && rest.voice === 2);
  assert.equal(rest.element.getAttribute('print-object'), null);
});

test('nốt bè (bè thân, bè riêng, chép bè) được phát như nốt thường, đúng thời điểm', () => {
  const doc = ScoreDocument.parse(score([quarters('E5', 'D5', 'C5', 'D5'), quarters('E5', 'F5', 'G5', 'A5')]));
  const at = (m, e) =>
    doc.notes.find((n) => n.measureIndex === m && n.entryIndex === e && n.voice === 1 && n.chordIndex === 0);
  assert.ok(addChordPitch(doc, at(0, 0).id, P('C', 5)).ok); // bè thân ở phách 1
  assert.ok(addVoiceNote(doc, at(0, 2).id, P('A', 4), { type: 'half', dots: 0 }).ok); // bè riêng từ phách 3
  assert.ok(addHarmonyVoice(doc, [at(1, 1).id], -2).ok); // chép bè: D5 dưới F5 ở phách 2 ô 2
  const plan = buildPlayback(doc, 60); // 60 BPM: một phách đen = 1 giây
  const sounding = plan.notes.map((n) => `${n.measure}:${n.time}:${n.midi}`);
  assert.ok(sounding.includes('0:0:72')); // C5 cùng lúc E5
  assert.ok(sounding.includes('0:0:76'));
  assert.ok(sounding.includes('0:2:69')); // A4 ở phách 3
  assert.ok(Math.abs(plan.notes.find((n) => n.midi === 69).duration - 2 * 0.9) < 1e-9); // nốt trắng, phát legato 90%
  assert.ok(sounding.includes('1:5:74')); // D5 ở phách 2 ô 2 (giây thứ 5)
  // dấu lặng ẩn của bè hai không phát gì, không làm lệch nốt khác
  assert.equal(plan.notes.length, 8 + 1 + 1 + 1);
});

test('nốt ghi kiểu nốt nhỏ trong file nhập vào vẫn được phát; nốt bè sao từ nó vẽ cỡ thường', () => {
  const xml = score([quarters('C5', 'D5', 'E5', 'F5')])
    .replace('<note><pitch><step>C', '<note><cue/><pitch><step>C')
    .replace('<type>quarter</type>', '<type size="cue">quarter</type>');
  const doc = ScoreDocument.parse(xml);
  const plan = buildPlayback(doc, 60);
  assert.ok(plan.notes.some((n) => n.midi === 72 && n.time === 0));
  const added = addChordPitch(doc, doc.notes[0].id, P('A', 4));
  assert.ok(added.ok);
  const member = doc.getInfo(added.command.selectAfter[0]).element;
  assert.equal(member.querySelector('cue'), null);
  assert.equal(member.querySelector('type').getAttribute('size'), null);
});
