// CH-07: tiêu đề, mô tả gợi ý hợp âm AI dựng theo ngôn ngữ đang dùng
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../src/i18n/core.ts';
import { suggestionDescription, suggestionTitle } from '../../src/components/scores/suggestions/suggestionUtils.ts';

test('gợi ý hợp âm AI dịch theo ngôn ngữ, đề xuất người dùng giữ nguyên', () => {
  setLocale('en');
  assert.equal(
    suggestionTitle({ title: 'Gợi ý hợp âm (Hợp âm 7 / Jazz)', source: 'CHORD_GENERATION' }),
    'Chord suggestion (Sevenths / Jazz)',
  );
  assert.equal(
    suggestionDescription('CHORD_GENERATION', 'Giọng C major, 12 hợp âm được thêm'),
    'Key C major, 12 chords added',
  );
  assert.equal(suggestionTitle({ title: 'Sửa ô 3', source: 'EDITOR' }), 'Sửa ô 3');
  assert.equal(
    suggestionDescription('EDITOR', 'Giọng C major, 12 hợp âm được thêm'),
    'Giọng C major, 12 hợp âm được thêm',
  );
  setLocale('vi');
});
