/**
 * Dòng thời gian của Player: bản nhạc đã mở lặp lại (repeat, volta, D.C....) thành danh sách ô nhịp và danh sách nốt theo
 * giây và theo phách. Dựng từ `buildPlayback` của Editor nên nghe giống hệt nút Phát cũ.
 *
 * `toScoringNotes` là dữ liệu nốt chuẩn bàn giao cho phần chấm điểm (Scoring).
 */
import { partLabel } from '../../editor/audio/instruments';
import { buildPlayback } from '../../editor/audio/playback';
import type { PlayMeasure, PlayNote } from '../../editor/audio/playback';
import type { ScoreDocument } from '../../editor/core/ScoreDocument';

export const MIN_BPM = 20;
export const MAX_BPM = 300;
export const DEFAULT_BPM = 100;

/** Một khuông của một part, đơn vị của Mute / Solo / âm lượng. */
/** Id của track đệm hợp âm (nốt sinh từ ký hiệu hợp âm, không phải nốt trên bản nhạc). */
export const CHORD_TRACK_ID = 'chords';

export interface TimelineTrack {
  id: string;
  part: number;
  staff: number;
  label: string;
}

export interface TimelineEvent extends PlayNote {
  trackId: string;
}

export interface Timeline {
  /** Tempo gốc (nốt đen mỗi phút) ở 100%. */
  baseBpm: number;
  /** Ví dụ "3/4"; rỗng nếu nhịp tự do. */
  timeSignature: string;
  measureCount: number;
  /** Tổng thời lượng (giây) ở 100%. */
  total: number;
  /** Các ô nhịp theo thứ tự phát. */
  measures: PlayMeasure[];
  /** Nốt sắp theo thời gian bắt đầu. */
  events: TimelineEvent[];
  tracks: TimelineTrack[];
  /** Độ dài lớn nhất của một nốt (giây), để tra nhanh các nốt đang vang. */
  maxDuration: number;
}

const validBpm = (bpm: number): boolean => Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM;

/** Tempo gốc: `<sound tempo>` đầu tiên của part đầu, không có thì tempo của bản nhạc, không hợp lệ thì 100. */
export function readBaseBpm(doc: ScoreDocument, fallbackBpm: number | null | undefined): number {
  for (const measure of doc.getMeasures(0)) {
    for (const sound of Array.from(measure.getElementsByTagName('sound'))) {
      const tempo = Number(sound.getAttribute('tempo'));
      if (sound.hasAttribute('tempo')) return validBpm(tempo) ? tempo : warnBpm(tempo);
    }
  }
  if (fallbackBpm === null || fallbackBpm === undefined) return DEFAULT_BPM;
  return validBpm(fallbackBpm) ? fallbackBpm : warnBpm(fallbackBpm);
}

const warnBpm = (bpm: number): number => {
  console.warn(`Tempo ${bpm} ngoài khoảng ${MIN_BPM}-${MAX_BPM}, dùng ${DEFAULT_BPM}`);
  return DEFAULT_BPM;
};

const trackLabel = (doc: ScoreDocument, part: number, staff: number, staves: number): string => {
  const prefix = doc.partCount > 1 ? `${partLabel(doc, part)} · ` : '';
  if (staves === 1) return partLabel(doc, part);
  if (staves === 2) return `${prefix}${staff === 1 ? 'Tay phải' : 'Tay trái'}`;
  return `${prefix}Khuông ${staff}`;
};

const buildTracks = (doc: ScoreDocument): TimelineTrack[] => {
  const tracks: TimelineTrack[] = [];
  for (let part = 0; part < doc.partCount; part++) {
    const staves = Math.max(1, doc.staffCountOfPart(part));
    for (let staff = 1; staff <= staves; staff++) {
      tracks.push({ id: `${part}:${staff}`, part, staff, label: trackLabel(doc, part, staff, staves) });
    }
  }
  return tracks;
};

/**
 * @param doc tài liệu MusicXML
 * @param fallbackBpm tempo của bản nhạc (`scores.tempo_bpm`) khi file không khai báo
 */
export function buildTimeline(doc: ScoreDocument, fallbackBpm: number | null | undefined): Timeline {
  const baseBpm = readBaseBpm(doc, fallbackBpm);
  const plan = buildPlayback(doc, baseBpm);
  const noteEvents: TimelineEvent[] = plan.notes.map((n) => ({ ...n, trackId: `${n.part}:${n.staff}` }));
  const chordEvents: TimelineEvent[] = plan.chords.map((n) => ({ ...n, trackId: CHORD_TRACK_ID }));
  const events = [...noteEvents, ...chordEvents].sort((a, b) => a.time - b.time || a.midi - b.midi);
  const time = doc.timeAt(0);
  return {
    baseBpm,
    timeSignature: time.free ? '' : `${time.beats}/${time.beatType}`,
    measureCount: doc.measureCount,
    total: plan.total,
    measures: plan.measures,
    events,
    tracks: [
      ...buildTracks(doc),
      ...(chordEvents.length > 0 ? [{ id: CHORD_TRACK_ID, part: chordEvents[0].part, staff: 0, label: 'Hợp âm' }] : []),
    ],
    // Chỉ tính nốt trên bản nhạc: nốt đệm hợp âm không tô trên bản nhạc nên không cần tra
    maxDuration: noteEvents.reduce((max, e) => Math.max(max, e.duration), 0),
  };
}

/** Thứ tự (trong lượt phát) của ô đang vang tại thời điểm `time` giây; kẹp trong khoảng hợp lệ. */
export function measureOrderAt(timeline: Timeline, time: number): number {
  const measures = timeline.measures;
  let low = 0;
  let high = measures.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (measures[mid].start <= time + 1e-9) low = mid;
    else high = mid - 1;
  }
  return Math.max(0, low);
}

/** Thời điểm (giây) bắt đầu của ô thứ `order` trong lượt phát; kẹp trong khoảng hợp lệ. */
export function timeOfOrder(timeline: Timeline, order: number): number {
  const measures = timeline.measures;
  if (measures.length === 0) return 0;
  return measures[Math.min(measures.length - 1, Math.max(0, order))].start;
}

/** Thứ tự lượt phát đầu tiên của ô nhịp có chỉ số `measureIndex` (từ 0), hoặc -1 nếu ô không được phát. */
export function firstOrderOfMeasure(timeline: Timeline, measureIndex: number): number {
  return timeline.measures.findIndex((m) => m.index === measureIndex);
}

/** Vị trí đầu tiên trong `events` có thời gian ≥ `time`. */
export function firstEventAtOrAfter(timeline: Timeline, time: number): number {
  const events = timeline.events;
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (events[mid].time < time - 1e-9) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Id các nốt đang vang tại thời điểm `time` giây. */
export function activeNoteIds(timeline: Timeline, time: number): Set<string> {
  const active = new Set<string>();
  const events = timeline.events;
  let i = firstEventAtOrAfter(timeline, time + 1e-9) - 1;
  for (; i >= 0 && events[i].time + timeline.maxDuration >= time; i--) {
    if (events[i].trackId !== CHORD_TRACK_ID && events[i].time + events[i].duration > time) active.add(events[i].id);
  }
  return active;
}

/** Nốt chuẩn bàn giao cho phần chấm điểm; thời gian tính theo phách đen nên không phụ thuộc tempo. */
export interface ScoringNote {
  id: string;
  /** Ô nhịp (từ 1) trong bản nhạc. */
  measure: number;
  part: number;
  staff: number;
  midi: number;
  startBeat: number;
  durationBeats: number;
  /** 0–1, mf = 0,8. */
  velocity: number;
  /** Số thứ tự của nhóm nốt cùng thời điểm (con trỏ OSMD tiến một bước mỗi nhóm). */
  cursorStep: number;
}

export function toScoringNotes(timeline: Timeline): ScoringNote[] {
  let step = -1;
  let lastBeat = Number.NaN;
  // Nốt đệm hợp âm và nốt phụ của láy (rền, ngắn, vòng) không thuộc bản nhạc nên không đưa vào chấm điểm; nốt gốc của láy
  // vẫn có mặt (một nốt trên bản nhạc)
  return timeline.events
    .filter((e) => e.trackId !== CHORD_TRACK_ID && !e.ornament)
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi)
    .map((e) => {
      if (e.beat !== lastBeat) {
        step += 1;
        lastBeat = e.beat;
      }
      return {
        id: e.id,
        measure: e.measure + 1,
        part: e.part,
        staff: e.staff,
        midi: e.midi,
        startBeat: e.beat,
        durationBeats: e.beatEnd - e.beat,
        velocity: e.gain,
        cursorStep: step,
      };
    });
}
