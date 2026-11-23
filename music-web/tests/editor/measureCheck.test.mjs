import assert from 'node:assert/strict';
import test from 'node:test';

import { ScoreDocument } from '../../src/components/editor/core/ScoreDocument.ts';
import { checkMeasures, confirmMeasure, isCompound } from '../../src/components/editor/structure/measureCheck.ts';
import { note, quarters, score } from './support/score.mjs';

test('isCompound: 6/8, 9/8, 12/16 là nhịp kép; 3/8, 6/4 thì không', () => {
  assert.equal(isCompound(6, 8), true);
  assert.equal(isCompound(9, 8), true);
  assert.equal(isCompound(12, 16), true);
  assert.equal(isCompound(3, 8), false);
  assert.equal(isCompound(6, 4), false);
});

test('ô đủ phách không có lỗi', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4')]));
  assert.deepEqual(checkMeasures(doc), []);
});

test('ô thiếu một phách: diffBeats = −1', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4'), quarters('G4', 'A4', 'B4')]));
  const issues = checkMeasures(doc);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].measureIndex, 1);
  assert.equal(issues[0].diffBeats, -1);
  assert.equal(typeof issues[0].message, 'string');
});

test('ô thừa phách: diffBeats dương', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4', 'F4', 'G4')]));
  assert.equal(checkMeasures(doc)[0].diffBeats, 1);
});

test('nhịp kép 6/8: một phách là nốt đen chấm dôi', () => {
  const body = note('C4', { dur: 3, type: 'quarter', dots: 1 }); // thiếu đúng một phách (3 móc đơn)
  const doc = ScoreDocument.parse(score([body], { beats: 6, beatType: 8, divisions: 2 }));
  const [issue] = checkMeasures(doc);
  assert.equal(issue.diffBeats, -1);
});

test('nốt hợp âm và nốt hoa mỹ không tính vào tổng phách', () => {
  const body =
    note('C4') + note('E4', { chord: true }) + note('G4', { grace: true, type: 'eighth' }) + quarters('D4', 'E4', 'F4');
  const doc = ScoreDocument.parse(score([body]));
  assert.deepEqual(checkMeasures(doc), []);
});

test('confirmMeasure đánh dấu implicit để bỏ qua kiểm tra, hoàn tác được', () => {
  const doc = ScoreDocument.parse(score([quarters('C4', 'D4', 'E4')]));
  const result = confirmMeasure(doc, 0);
  assert.equal(result.ok, true);
  assert.equal(doc.getMeasure(0, 0).getAttribute('implicit'), 'yes');
  assert.deepEqual(checkMeasures(doc), []);
  assert.equal(result.command.snapshots[0].before.getAttribute('implicit'), null);
});
