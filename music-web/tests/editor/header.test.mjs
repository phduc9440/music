import assert from 'node:assert/strict';
import test from 'node:test';

import { blankHeaderText, shownHeader } from '../../src/components/editor/structure/header.ts';

const BLANK_TITLE = blankHeaderText('title');
const BLANK_COMPOSER = blankHeaderText('composer');

const header = (title, composer) => ({ title, composer, styles: { title: {}, composer: {} } });

test('tên trong file được giữ nguyên', () => {
  assert.deepEqual(shownHeader(header('Bèo dạt mây trôi', 'Dân ca'), { title: 'Khác', composer: 'Khác' }), {
    title: 'Bèo dạt mây trôi',
    composer: 'Dân ca',
  });
});

test('file trống thì lấy tên bài / tác giả của bản nhạc', () => {
  assert.deepEqual(shownHeader(header('', ''), { title: 'Mẹ ơi có biết', composer: 'Nguyễn Văn Tý' }), {
    title: 'Mẹ ơi có biết',
    composer: 'Nguyễn Văn Tý',
  });
});

test('vẫn trống (hoặc chỉ có chữ giả Music21) thì hiện chữ gợi ý theo ngôn ngữ, không còn Blank', () => {
  assert.deepEqual(shownHeader(header('', ''), { title: 'Mẹ ơi có biết', composer: null }), {
    title: 'Mẹ ơi có biết',
    composer: BLANK_COMPOSER,
  });
  assert.deepEqual(shownHeader(header('', ''), { title: 'Music21 Fragment', composer: '  ' }), {
    title: BLANK_TITLE,
    composer: BLANK_COMPOSER,
  });
});

test('chữ gợi ý chỗ trống không còn là "Blank" tiếng Anh', () => {
  assert.notEqual(BLANK_TITLE, 'Blank');
  assert.notEqual(BLANK_COMPOSER, 'Blank');
  assert.notEqual(BLANK_TITLE, BLANK_COMPOSER);
});
