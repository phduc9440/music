import type { CommentMember } from '../../../types';

/** Vùng neo góp ý lấy từ vùng chọn trên bản nhạc (số ô từ 1, như API). */
export interface CommentAnchor {
  start: number;
  end: number;
  /** Mã part (MusicXML) khi mọi nốt chọn cùng một bè. */
  partId?: string | null;
  /** Id các nốt đã chọn (Editor). */
  noteIds?: string[];
}

/** "12" hoặc "12–16" (khớp tham số measures của thông báo). */
export const measureLabel = (start?: number | null, end?: number | null): string => {
  if (start == null) return '';
  return end == null || end === start ? String(start) : `${start}–${end}`;
};

/** Id những người đã chọn ở gợi ý @ mà tên còn nằm trong nội dung (xóa chữ "@Tên" thì bỏ nhắc người đó). */
export const mentionIdsIn = (text: string, picked: Map<string, CommentMember>): string[] =>
  [...picked.values()].filter((m) => text.includes(`@${m.name}`)).map((m) => m.id);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tách nội dung thành các đoạn thường và đoạn "@Tên" của người được nhắc để tô màu. */
export const splitMentions = (text: string, mentions: CommentMember[]): { text: string; mention: boolean }[] => {
  const tokens = new Set(mentions.map((m) => `@${m.name}`));
  if (tokens.size === 0) return [{ text, mention: false }];
  // Tên dài trước để "@Lan Anh" không bị cắt thành "@Lan"
  const pattern = [...tokens]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return text
    .split(new RegExp(`(${pattern})`))
    .filter((part) => part !== '')
    .map((part) => ({ text: part, mention: tokens.has(part) }));
};
