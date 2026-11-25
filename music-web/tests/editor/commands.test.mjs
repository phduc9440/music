import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { changePitch, removeNotes, setAlteration } from '../../src/components/editor/core/commands.ts';
import { History } from '../../src/components/editor/core/history.ts';
import { measureSummary, nameOf, note, quarters, score } from './support/score.mjs';

const fresh = (opts) =>
  ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4'), quarters('G4', 'A4', 'B4', 'C5')], opts));
const first = 'm0-s1-v1-0';

test('changePitch lên nửa cung đổi C4 thành C#4', () => {
  const doc = fresh();
  const result = changePitch(doc, [first], 'semitoneUp');
  assert.equal(result.ok, true);
  assert.equal(nameOf(doc, first), 'C#4');
  assert.deepEqual(result.command.changedIds, [first]);
});

test('changePitch lặp count lần', () => {
  const doc = fresh();
  assert.equal(changePitch(doc, [first], 'stepUp', 3).ok, true);
  assert.equal(nameOf(doc, first), 'F4');
});

test('changePitch dùng khóa nhạc của ô: Sol trưởng E4 lên bậc → F#4', () => {
  const doc = fresh({ fifths: 1 });
  changePitch(doc, ['m0-s1-v1-2'], 'stepUp');
  assert.equal(nameOf(doc, 'm0-s1-v1-2'), 'F#4');
});

test('changePitch trên dấu lặng báo rest, vượt tầm báo range', () => {
  const doc = ScoreDocument.parse(score([note(null) + note('C8') + quarters('C4', 'D4')]));
  assert.deepEqual(changePitch(doc, ['m0-s1-v1-0'], 'semitoneUp'), { ok: false, reason: 'rest' });
  assert.deepEqual(changePitch(doc, ['m0-s1-v1-1'], 'semitoneUp'), { ok: false, reason: 'range' });
  assert.equal(nameOf(doc, 'm0-s1-v1-1'), 'C8');
});

test('changePitch không cho hai nốt trùng cao độ trong một hợp âm', () => {
  const doc = ScoreDocument.parse(score([note('C4') + note('D4', { chord: true }) + quarters('E4', 'F4', 'G4')]));
  assert.deepEqual(changePitch(doc, ['m0-s1-v1-0'], 'stepUp'), { ok: false, reason: 'duplicate' });
});

test('changePitch kéo theo nốt nối (tie) phía sau', () => {
  const doc = ScoreDocument.parse(
    score([
      quarters('C4', 'D4', 'E4') + note('G4', { tie: 'start' }),
      note('G4', { tie: 'stop' }) + quarters('A4', 'B4', 'C5'),
    ]),
  );
  changePitch(doc, ['m0-s1-v1-3'], 'semitoneUp');
  assert.equal(nameOf(doc, 'm0-s1-v1-3'), 'G#4');
  assert.equal(nameOf(doc, 'm1-s1-v1-0'), 'G#4');
});

test('setAlteration bật/tắt dấu thăng', () => {
  const doc = fresh();
  setAlteration(doc, [first], 'sharp');
  assert.equal(nameOf(doc, first), 'C#4');
  setAlteration(doc, [first], 'sharp');
  assert.equal(nameOf(doc, first), 'C4');
});

test('refreshAccidentals ghi <accidental> khi nốt lệch khóa', () => {
  const doc = fresh();
  setAlteration(doc, ['m0-s1-v1-1'], 'flat');
  const accidental = doc.getNote('m0-s1-v1-1').getElementsByTagName('accidental')[0];
  assert.equal(accidental?.textContent, 'flat');
});

test('removeNotes rest đổi nốt thành dấu lặng, giữ trường độ', () => {
  const doc = fresh();
  assert.equal(removeNotes(doc, ['m0-s1-v1-1'], 'rest').ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['C4:quarter/1', 'rest:quarter/1', 'E4:quarter/1', 'F4:quarter/1']);
});

test('removeNotes delete trong hợp âm chỉ bỏ nốt được chọn', () => {
  const doc = ScoreDocument.parse(score([note('C4') + note('E4', { chord: true }) + quarters('D4', 'E4', 'F4')]));
  removeNotes(doc, ['m0-s1-v1-0'], 'delete');
  assert.deepEqual(measureSummary(doc, 0), ['E4:quarter/1', 'D4:quarter/1', 'E4:quarter/1', 'F4:quarter/1']);
});

test('Delete hai lần trên nốt thừa: nốt thành dấu lặng rồi dấu lặng bị gỡ, các nốt sau dồn lên', () => {
  // 3/4 nhận dạng ra đen - trắng - đen, nốt đen đầu là thừa
  const doc = ScoreDocument.parse(
    score([note('C4') + note('E4', { dur: 2, type: 'half' }) + note('G4')], { beats: 3 }),
  );
  const first = removeNotes(doc, ['m0-s1-v1-0'], 'delete');
  assert.equal(first.ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['rest:quarter/1', 'E4:half/2', 'G4:quarter/1']);
  const second = removeNotes(doc, ['m0-s1-v1-0'], 'delete');
  assert.equal(second.ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['E4:half/2', 'G4:quarter/1']);
  assert.deepEqual(second.command.selectAfter, []);
});

test('Gỡ dấu lặng bè 1 thì <backup> lùi ít đi để bè 2 giữ nguyên chỗ', () => {
  const doc = ScoreDocument.parse(
    score([
      note(null, { voice: 1 }) +
        quarters('D4', 'E4', 'F4').replaceAll('<type>', '<voice>1</voice><type>') +
        '<backup><duration>4</duration></backup>' +
        note('C3', { voice: 2, dur: 4, type: 'whole' }),
    ]),
  );
  assert.equal(removeNotes(doc, ['m0-s1-v1-0'], 'delete').ok, true);
  const backup = doc.getMeasure(0, 0).getElementsByTagName('backup')[0];
  assert.equal(backup.getElementsByTagName('duration')[0].textContent, '3');
});

test('Chọn cả nốt và dấu lặng: nốt thành dấu lặng, dấu lặng bị gỡ, vẫn chọn dấu lặng mới', () => {
  const doc = ScoreDocument.parse(score([note(null) + quarters('D4', 'E4', 'F4')]));
  const result = removeNotes(doc, ['m0-s1-v1-0', 'm0-s1-v1-2'], 'delete');
  assert.equal(result.ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['D4:quarter/1', 'rest:quarter/1', 'F4:quarter/1']);
  assert.deepEqual(result.command.selectAfter, ['m0-s1-v1-1']);
});

test('Không gỡ hết dấu lặng làm ô trống', () => {
  const doc = ScoreDocument.parse(score([quarters(null, null, null, null)]));
  const ids = ['m0-s1-v1-0', 'm0-s1-v1-1', 'm0-s1-v1-2', 'm0-s1-v1-3'];
  assert.deepEqual(removeNotes(doc, ids, 'delete'), { ok: false, reason: 'restKept' });
  assert.equal(removeNotes(doc, ids.slice(0, 2), 'delete').ok, true);
  assert.deepEqual(measureSummary(doc, 0), ['rest:quarter/1', 'rest:quarter/1']);
});

test('Dấu lặng cả ô không bị gỡ', () => {
  const doc = ScoreDocument.parse(
    score(['<note><rest measure="yes"/><duration>4</duration><type>whole</type></note>']),
  );
  assert.deepEqual(removeNotes(doc, ['m0-s1-v1-0'], 'delete'), { ok: false, reason: 'restKept' });
});

test('removeNotes trên dấu lặng báo empty', () => {
  const doc = ScoreDocument.parse(score([note(null) + quarters('D4', 'E4', 'F4')]));
  assert.deepEqual(removeNotes(doc, ['m0-s1-v1-0'], 'rest'), { ok: false, reason: 'empty' });
});

test('History hoàn tác / làm lại và cờ dirty', () => {
  const doc = fresh();
  const history = new History();
  assert.equal(history.dirty, false);
  history.push(changePitch(doc, [first], 'semitoneUp').command);
  history.push(changePitch(doc, [first], 'semitoneUp').command);
  assert.equal(nameOf(doc, first), 'D4');
  assert.equal(history.dirty, true);
  history.undo(doc);
  assert.equal(nameOf(doc, first), 'C#4');
  history.undo(doc);
  assert.equal(nameOf(doc, first), 'C4');
  assert.equal(history.canUndo, false);
  assert.equal(history.dirty, false);
  history.redo(doc);
  assert.equal(nameOf(doc, first), 'C#4');
});

test('History: thao tác mới sau hoàn tác xóa nhánh làm lại', () => {
  const doc = fresh();
  const history = new History();
  history.push(changePitch(doc, [first], 'semitoneUp').command);
  history.undo(doc);
  history.push(changePitch(doc, [first], 'stepUp').command);
  assert.equal(history.canRedo, false);
  assert.equal(nameOf(doc, first), 'D4');
});

test('History.markSaved: quay về đúng vị trí đã lưu thì hết dirty', () => {
  const doc = fresh();
  const history = new History();
  history.push(changePitch(doc, [first], 'semitoneUp').command);
  history.markSaved();
  history.push(changePitch(doc, [first], 'semitoneUp').command);
  assert.equal(history.dirty, true);
  history.undo(doc);
  assert.equal(history.dirty, false);
});
