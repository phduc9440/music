/**
 * Lời bài hát: mỗi nốt (đầu hợp âm, không phải dấu lặng, không phải nốt nối tiếp của dấu nối) có thể mang một âm tiết
 * cho từng lời (verse). Ghi vào <lyric number> trong thẻ <note>; từ nhiều âm tiết dùng <syllabic> begin/middle/end.
 * Tiếng Việt mỗi chữ là một âm tiết nên gõ cách nhau bằng dấu cách là đủ; dấu "-" dùng khi một chữ trải qua nhiều nốt.
 */
import { childOf, commitEdit, hasTie, touch } from './commands';
import type { EditResult, Touched } from './commands';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

export const MAX_VERSE = 4;

/** Cách kết thúc âm tiết vừa gõ: hết chữ, hoặc chữ còn tiếp ở nốt sau (gạch nối). */
export type LyricEnd = 'word' | 'hyphen';

/** Các nốt có thể mang lời trong cùng part/khuông/bè với `info`, theo thứ tự trong bản nhạc. */
export const lyricNotes = (doc: ScoreDocument, info: NoteInfo): NoteInfo[] =>
  doc.notes.filter(
    (n) =>
      n.partIndex === info.partIndex &&
      n.staff === info.staff &&
      n.voice === info.voice &&
      n.chordIndex === 0 &&
      !n.isRest &&
      !n.isGrace &&
      !hasTie(n.element, 'stop'),
  );

/** Nốt của `id` có mang được lời không. */
export const canHoldLyric = (doc: ScoreDocument, id: string): boolean => {
  const info = doc.getInfo(id);
  return !!info && lyricNotes(doc, info).includes(info);
};

const lyricsOf = (note: Element): Element[] => Array.from(note.children).filter((c) => c.tagName === 'lyric');

const verseOf = (el: Element): string => el.getAttribute('number') ?? '1';

/** Âm tiết của một nốt ở lời `verse`; null nếu chưa có. */
export const readLyric = (note: Element, verse: number): { text: string; syllabic: string } | null => {
  const el = lyricsOf(note).find((l) => verseOf(l) === String(verse));
  if (!el) return null;
  return {
    text: childOf(el, 'text')?.textContent ?? '',
    syllabic: childOf(el, 'syllabic')?.textContent?.trim() ?? 'single',
  };
};

/** Nốt kế tiếp (delta = 1) hoặc liền trước (−1) có thể mang lời; null nếu hết. */
export const stepLyricNote = (doc: ScoreDocument, id: string, delta: 1 | -1): string | null => {
  const info = doc.getInfo(id);
  if (!info) return null;
  const list = lyricNotes(doc, info);
  const at = list.indexOf(info);
  return at < 0 ? null : (list[at + delta]?.id ?? null);
};

/** Âm tiết ngay trước `index` còn "mở" (begin/middle) không, tức nốt này nối tiếp một chữ đang dở. */
const continuesWord = (list: NoteInfo[], index: number, verse: number): boolean => {
  const prev = index > 0 ? readLyric(list[index - 1].element, verse) : null;
  return prev !== null && (prev.syllabic === 'begin' || prev.syllabic === 'middle');
};

const removeLyric = (note: Element, verse: number): void => {
  lyricsOf(note)
    .filter((l) => verseOf(l) === String(verse))
    .forEach((l) => l.remove());
};

const addLyric = (note: Element, verse: number, text: string, syllabic: string): void => {
  const owner = note.ownerDocument;
  const lyric = owner.createElement('lyric');
  lyric.setAttribute('number', String(verse));
  const s = owner.createElement('syllabic');
  s.textContent = syllabic;
  const t = owner.createElement('text');
  t.textContent = text;
  lyric.append(s, t);
  const existing = lyricsOf(note);
  const last = existing[existing.length - 1];
  if (last) last.after(lyric);
  else {
    const play = Array.from(note.children).find((c) => c.tagName === 'play' || c.tagName === 'listen');
    if (play) play.before(lyric);
    else note.appendChild(lyric);
  }
};

const syllabicFor = (open: boolean, end: LyricEnd): string =>
  open ? (end === 'hyphen' ? 'middle' : 'end') : end === 'hyphen' ? 'begin' : 'single';

/** Ghi (hoặc xóa khi `text` rỗng) âm tiết của nốt `id` ở lời `verse`. */
export function setLyric(doc: ScoreDocument, id: string, text: string, end: LyricEnd, verse: number): EditResult {
  const info = doc.getInfo(id);
  if (!info) return { ok: false, reason: 'empty' };
  const list = lyricNotes(doc, info);
  const index = list.indexOf(info);
  if (index < 0) return { ok: false, reason: 'lyricTarget' };
  const clean = text.trim();
  const current = readLyric(info.element, verse);
  const syllabic = syllabicFor(continuesWord(list, index, verse), end);
  if (clean === (current?.text ?? '') && (clean === '' || current?.syllabic === syllabic)) {
    return { ok: false, reason: 'unchanged' };
  }
  const touched: Touched = new Map();
  touch(touched, info);
  const command = commitEdit(doc, clean ? 'Nhập lời' : 'Xóa lời', touched, [id], () => {
    removeLyric(info.element, verse);
    if (clean) addLyric(info.element, verse, clean, syllabic);
  });
  command.selectAfter = [id];
  return { ok: true, command };
}

interface Piece {
  text: string;
  end: LyricEnd;
}

/** Tách đoạn lời dán vào thành các âm tiết: cách nhau bằng dấu cách; "xin-chào" hoặc "xin- chào" là một chữ hai nốt. */
const tokenize = (text: string): (Piece | 'skip')[] => {
  const out: (Piece | 'skip')[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token === '_') {
      out.push('skip');
      continue;
    }
    const parts = token.split('-');
    parts.forEach((part, i) => {
      const last = i === parts.length - 1;
      if (part === '') {
        // "xin-" : gạch nối ở cuối → âm tiết trước còn tiếp
        const prev = out[out.length - 1];
        if (last && prev && prev !== 'skip') prev.end = 'hyphen';
        return;
      }
      out.push({ text: part, end: last ? 'word' : 'hyphen' });
    });
  }
  return out;
};

export interface PasteReport {
  placed: number;
  /** Số âm tiết không còn nốt để gán. */
  leftover: number;
}

/**
 * Gán cả đoạn lời lên các nốt liên tiếp bắt đầu từ nốt `startId` (cùng khuông, bè), một bước hoàn tác được.
 * Dấu "_" bỏ qua một nốt (nốt kéo dài).
 */
export function pasteLyrics(
  doc: ScoreDocument,
  startId: string,
  text: string,
  verse: number,
): { result: EditResult; report: PasteReport } {
  const none: PasteReport = { placed: 0, leftover: 0 };
  const info = doc.getInfo(startId);
  if (!info) return { result: { ok: false, reason: 'empty' }, report: none };
  const list = lyricNotes(doc, info);
  const start = list.indexOf(info);
  if (start < 0) return { result: { ok: false, reason: 'lyricTarget' }, report: none };
  const pieces = tokenize(text);
  if (pieces.length === 0) return { result: { ok: false, reason: 'empty' }, report: none };

  const targets = list.slice(start, start + pieces.length);
  const touched: Touched = new Map();
  targets.forEach((n) => touch(touched, n));
  let placed = 0;
  const command = commitEdit(
    doc,
    'Dán lời',
    touched,
    targets.map((n) => n.id),
    () => {
      let open = continuesWord(list, start, verse);
      targets.forEach((note, i) => {
        const piece = pieces[i];
        if (piece === 'skip') {
          open = false;
          return;
        }
        removeLyric(note.element, verse);
        addLyric(note.element, verse, piece.text, syllabicFor(open, piece.end));
        open = piece.end === 'hyphen';
        placed += 1;
      });
    },
  );
  const lastTarget = targets[targets.length - 1];
  command.selectAfter = [lastTarget ? (stepLyricNote(doc, lastTarget.id, 1) ?? lastTarget.id) : startId];
  return { result: { ok: true, command }, report: { placed, leftover: Math.max(0, pieces.length - targets.length) } };
}
