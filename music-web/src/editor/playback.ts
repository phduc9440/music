/**
 * Dựng lịch phát từ MusicXML để nghe thử bản nhạc (nút Phát) và để xem trước vùng chọn. Chỉ tính thời gian và cao
 * độ từ DOM, không dùng thư viện âm thanh.
 */
import { playOrder } from './playOrder';
import type { NoteInfo, ScoreDocument } from './ScoreDocument';

/** Một nốt cần phát. */
export interface PlayNote {
  id: string;
  /** Giây kể từ đầu bản nhạc. */
  time: number;
  duration: number;
  midi: number;
}

export interface PlaybackPlan {
  notes: PlayNote[];
  /** Tổng thời lượng (giây). */
  total: number;
}

const childNumber = (parent: Element, tag: string): number => {
  const text = Array.from(parent.children)
    .find((c) => c.tagName === tag)
    ?.textContent?.trim();
  const value = Number(text);
  return text && Number.isFinite(value) ? value : 0;
};

const hasChild = (el: Element, tag: string): boolean => Array.from(el.children).some((c) => c.tagName === tag);

const hasTie = (note: Element, type: string): boolean =>
  Array.from(note.children).some((c) => c.tagName === 'tie' && c.getAttribute('type') === type);

/** Tempo (phách đen/phút) đầu tiên khai báo trong ô nhịp qua <sound tempo="...">, hoặc null. */
const tempoOf = (measure: Element): number | null => {
  const sound = Array.from(measure.getElementsByTagName('sound')).find((s) => Number(s.getAttribute('tempo')) > 0);
  return sound ? Number(sound.getAttribute('tempo')) : null;
};

/**
 * Dựng lịch phát cho cả bản nhạc.
 * @param doc tài liệu MusicXML
 * @param fallbackBpm tempo dùng khi file không có <sound tempo>
 */
export function buildPlayback(doc: ScoreDocument, fallbackBpm: number): PlaybackPlan {
  const infoOf = new Map<Element, NoteInfo>();
  for (const info of doc.notes) infoOf.set(info.element, info);

  const notes: PlayNote[] = [];
  const order = playOrder(doc);
  let total = 0;
  for (let partIndex = 0; partIndex < doc.partCount; partIndex++) {
    let bpm = fallbackBpm > 0 ? fallbackBpm : 100;
    let clock = 0;
    const pending = new Map<string, PlayNote>();
    const measuresOfPart = doc.getMeasures(partIndex);
    let previous = -1;
    order.forEach((measureIndex) => {
      const measure = measuresOfPart[measureIndex];
      if (!measure) return;
      if (measureIndex !== previous + 1) pending.clear(); // nhảy (lặp, D.C....): nốt nối không đi theo
      previous = measureIndex;
      // Tempo của part đầu quyết định cho mọi part để các khuông không lệch nhau
      bpm = tempoOf(doc.getMeasure(0, measureIndex) ?? measure) ?? tempoOf(measure) ?? bpm;
      const divisions = doc.divisionsAtPart(partIndex, measureIndex) || 1;
      const secPerDivision = 60 / bpm / divisions;
      let cursor = 0;
      let furthest = 0;
      let lastStart = 0;
      for (const child of Array.from(measure.children)) {
        if (child.tagName === 'backup') cursor -= childNumber(child, 'duration');
        else if (child.tagName === 'forward') cursor += childNumber(child, 'duration');
        else if (child.tagName === 'note') {
          const isChord = hasChild(child, 'chord');
          const duration = childNumber(child, 'duration');
          const start = isChord ? lastStart : cursor;
          if (!isChord) {
            lastStart = start;
            if (!hasChild(child, 'grace')) cursor += duration;
          }
          furthest = Math.max(furthest, cursor);
          const info = infoOf.get(child);
          if (!info || info.isRest || info.isGrace || info.midi === null || duration <= 0) continue;
          const key = `${info.staff}|${info.voice}|${info.midi}`;
          const held = hasTie(child, 'stop') ? pending.get(key) : undefined;
          if (held) {
            held.duration += duration * secPerDivision;
            if (!hasTie(child, 'start')) pending.delete(key);
            continue;
          }
          const note: PlayNote = {
            id: info.id,
            time: clock + start * secPerDivision,
            duration: duration * secPerDivision,
            midi: info.midi,
          };
          notes.push(note);
          if (hasTie(child, 'start')) pending.set(key, note);
        }
      }
      clock += furthest * secPerDivision;
    });
    total = Math.max(total, clock);
  }
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { notes, total };
}

/**
 * Các nhóm nốt (cùng thời điểm) của một tập nốt, theo thứ tự thời gian, để phát xem trước cả vùng chọn.
 * Dấu lặng và nốt không có cao độ bị bỏ qua.
 */
export function selectionGroups(doc: ScoreDocument, ids: Iterable<string>): number[][] {
  const infos = [...ids]
    .map((id) => doc.getInfo(id))
    .filter((n): n is NoteInfo => n !== undefined && !n.isRest && n.midi !== null);
  infos.sort((a, b) => a.measureIndex - b.measureIndex || a.onsetKey - b.onsetKey || (a.midi ?? 0) - (b.midi ?? 0));
  const groups: number[][] = [];
  let lastKey = '';
  for (const info of infos) {
    const key = `${info.partIndex}|${info.measureIndex}|${info.onsetKey}`;
    if (key !== lastKey) groups.push([]);
    groups[groups.length - 1].push(info.midi as number);
    lastKey = key;
  }
  return groups;
}
