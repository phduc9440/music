// T37: tên bài tối đa 80 ký tự, tên file dài hơn thì "Untitled"; file tải về đặt theo tên bản nhạc
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TITLE, UNTITLED_TITLE, scoreDownloadName, titleFromFileName } from '../../src/utils/score.ts';

test('giới hạn 80 ký tự, khớp BE ScoreTitles.MAX_LENGTH', () => {
  assert.equal(MAX_TITLE, 80);
  assert.equal(UNTITLED_TITLE, 'Untitled');
});

test('tên file vừa 80 ký tự thành tên bài', () => {
  assert.equal(titleFromFileName('bèo dạt mây trôi.jpg'), 'bèo dạt mây trôi');
  assert.equal(titleFromFileName('william-gomez-ave-maria.pdf'), 'william-gomez-ave-maria');
  assert.equal(titleFromFileName(`${'x'.repeat(80)}.png`), 'x'.repeat(80));
  assert.equal(titleFromFileName('  Canon in D .musicxml'), 'Canon in D');
});

test('tên file dài hơn 80 ký tự hoặc rỗng thành Untitled', () => {
  const messenger = '1793598573782_1629614282312674930_g1668634218578729671_de19acbe88df88a68783e9327417ade4.jpg';
  const zalo = 'z6071839202145_8f3c9d2e1b47f6aa8f3c9d2e1b47f6aa9b0c1d2e3f405162738495a6b7c8d9e0f1a2b3c4.jpg';
  assert.equal(titleFromFileName(messenger), 'Untitled');
  assert.equal(titleFromFileName(zalo), 'Untitled');
  assert.equal(titleFromFileName(`${'x'.repeat(81)}.pdf`), 'Untitled');
  assert.equal(titleFromFileName('.jpg'), 'Untitled');
});

test('file hệ thống tạo tải về theo tên bản nhạc, giữ đuôi', () => {
  assert.equal(
    scoreDownloadName('Bèo dạt mây trôi', { fileType: 'MUSICXML', originalFileName: 'v3.musicxml' }, 'musicxml'),
    'Bèo dạt mây trôi.musicxml',
  );
  assert.equal(
    scoreDownloadName('Bèo dạt mây trôi', { fileType: 'MIDI', originalFileName: 'v1.mid' }, 'midi'),
    'Bèo dạt mây trôi.mid',
  );
  assert.equal(
    scoreDownloadName('Bèo dạt mây trôi', { fileType: 'KERN', originalFileName: 'merged.krn' }, 'kern'),
    'Bèo dạt mây trôi.krn',
  );
  assert.equal(
    scoreDownloadName('Sonata: I/II', { fileType: 'PDF', originalFileName: null }, 'pdf'),
    'Sonata_ I_II.pdf',
  );
  assert.equal(scoreDownloadName('', { fileType: 'PDF', originalFileName: 'score.pdf' }, 'pdf'), 'ban-nhac.pdf');
});

test('file người dùng tải lên giữ tên gốc', () => {
  assert.equal(
    scoreDownloadName('Bài A', { fileType: 'ORIGINAL_IMAGE', originalFileName: 'bèo dạt mây trôi.jpg' }, 'jpg'),
    'bèo dạt mây trôi.jpg',
  );
  assert.equal(
    scoreDownloadName('Bài A', { fileType: 'PNG', originalFileName: 'page-001.png' }, 'png'),
    'page-001.png',
  );
});
