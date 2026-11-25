import type { TFunction } from 'i18next';

/**
 * Đề xuất do hệ thống sinh (gợi ý hợp âm) lưu tiêu đề / mô tả dạng khóa dịch để mỗi người đọc theo ngôn ngữ của mình:
 *   title        "chords.title:NATURAL"
 *   description  "chords.desc:C major|12|ADD"   (giọng | số hợp âm | ADD hoặc REPLACE)
 * Đề xuất cũ hoặc của người dùng giữ nguyên văn.
 */
export function suggestionTitle(title: string, t: TFunction): string {
  const m = /^chords\.title:([A-Z_]+)$/.exec(title);
  if (!m) return title;
  return t('chords.generatedTitle', { style: t(`chords.styles.${m[1]}.name`, { defaultValue: m[1] }) });
}

export function suggestionDescription(description: string | null | undefined, t: TFunction): string {
  if (!description) return '';
  const m = /^chords\.desc:([^|]+)\|(\d+)\|(ADD|REPLACE)$/.exec(description);
  if (!m) return description;
  return t(m[3] === 'REPLACE' ? 'chords.generatedDescReplace' : 'chords.generatedDescAdd', {
    key: m[1],
    count: Number(m[2]),
  });
}
