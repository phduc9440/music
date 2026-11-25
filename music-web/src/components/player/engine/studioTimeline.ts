/**
 * Timeline cho Studio dựng từ timeline của Player (ST-08, phần web của T15; câu hỏi Q6: Studio dùng chung nguồn nốt với
 * Player theo đặc tả 4.0). Khác parser Java cũ:
 *  - dấu nhắc lại, volta, D.C. đã được mở bởi `buildPlayback` nên bài có điệp khúc chạy đủ hai lượt như Player;
 *  - chọn được một part để tập (bản SATB chọn Alto), các part khác vẫn có trong timeline nhưng không chấm điểm;
 *  - tay trái / phải chỉ áp cho part có 2 khuông (khuông 1 = phải, khuông 2 = trái); part 1 khuông không gán tay;
 *  - cảnh báo trả dạng mã để web dịch (không còn câu tiếng Anh viết cứng).
 * Hàm thuần (không đọc DOM), nhận dữ liệu đã dựng từ `buildTimeline` nên test được bằng Node. Phần nối vào StudioPlayer và
 * kiểm lại ở BE thuộc phần Studio.
 */
import type { StudioHand, StudioTimeline } from '../../../types';

/** Dữ liệu tối thiểu lấy từ `Timeline` của Player. */
export interface PlayerTimelineLike {
  baseBpm: number;
  timeSignature: string;
  measureCount: number;
  measures: { index: number; order: number; startBeat: number; lengthBeats: number }[];
  events: {
    id: string;
    trackId: string;
    part: number;
    staff: number;
    midi: number;
    measure: number;
    order: number;
    beat: number;
    beatEnd: number;
    ornament?: unknown;
  }[];
}

export interface StudioPart {
  part: number;
  /** Số khuông của part (2 = piano: có tay trái / phải). */
  staves: number;
}

export type StudioTimelineWarning = 'REPEATS_UNFOLDED' | 'PART_HAS_NO_NOTES' | 'NO_TIME_SIGNATURE';

export interface PlayerStudioTimeline extends StudioTimeline {
  /** Part đang tập (chỉ nốt của part này được chấm); null = tập mọi part. */
  practicePart: number | null;
  warningCodes: StudioTimelineWarning[];
}

/** Tay của một nốt: chỉ part 2 khuông mới có tay (khuông 1 phải, khuông 2 trái). */
export const handOf = (staves: number, staff: number): StudioHand | null =>
  staves === 2 ? (staff === 1 ? 'RIGHT' : 'LEFT') : null;

/**
 * @param input.practicePart part được chấm điểm; bỏ trống thì part đầu tiên có nốt (bản một part: chính nó)
 */
export function toStudioTimeline(input: {
  scoreId: string;
  title: string;
  contentHash: string;
  timeline: PlayerTimelineLike;
  parts: StudioPart[];
  practicePart?: number | null;
  chordTrackId?: string;
}): PlayerStudioTimeline {
  const { timeline, parts } = input;
  const chordTrack = input.chordTrackId ?? 'chords';
  const stavesOf = new Map(parts.map((p) => [p.part, Math.max(1, p.staves)]));
  const notesOnScore = timeline.events.filter((e) => e.trackId !== chordTrack && !e.ornament);
  const firstWithNotes = notesOnScore.length ? Math.min(...notesOnScore.map((e) => e.part)) : null;
  const practicePart = input.practicePart ?? (parts.length > 1 ? firstWithNotes : null);

  const warningCodes: StudioTimelineWarning[] = [];
  if (timeline.measures.length > timeline.measureCount) warningCodes.push('REPEATS_UNFOLDED');
  if (practicePart != null && !notesOnScore.some((e) => e.part === practicePart))
    warningCodes.push('PART_HAS_NO_NOTES');
  const [beats, beatType] = timeline.timeSignature.split('/').map(Number);
  if (!beats || !beatType) warningCodes.push('NO_TIME_SIGNATURE');

  const notes = [...notesOnScore]
    .sort((a, b) => a.beat - b.beat || a.part - b.part || a.staff - b.staff || a.midi - b.midi)
    .map((e) => {
      const hand = handOf(stavesOf.get(e.part) ?? 1, e.staff);
      return {
        // Ô nhắc lại phát hai lần: id kèm thứ tự lượt phát để mỗi lần là một nốt cần chơi
        id: `${e.id}@${e.order}`,
        measure: e.measure + 1,
        staff: e.staff,
        hand,
        midi: e.midi,
        startBeat: e.beat,
        durationBeat: e.beatEnd - e.beat,
        scorable: practicePart == null || e.part === practicePart,
        chordGroupId: `${e.part}:${hand ?? e.staff}:${e.beat}`,
        osmd: null,
      };
    });

  const steps: StudioTimeline['steps'] = [];
  for (const n of notes) {
    if (!n.scorable) continue;
    const last = steps[steps.length - 1];
    if (last && last.startBeat === n.startBeat) last.noteIds.push(n.id);
    else steps.push({ stepIndex: steps.length, startBeat: n.startBeat, noteIds: [n.id] });
  }

  return {
    scoreId: input.scoreId,
    contentHash: input.contentHash,
    title: input.title,
    measureCount: timeline.measureCount,
    tempoBpm: timeline.baseBpm,
    timeSignatures: beats && beatType ? [{ measure: 1, beats, beatType }] : [],
    tempoChanges: [],
    // Theo thứ tự phát: ô nhắc lại xuất hiện nhiều lần (index = thứ tự lượt phát, từ 1)
    measures: timeline.measures.map((m) => ({ index: m.order + 1, startBeat: m.startBeat, beats: m.lengthBeats })),
    notes,
    steps,
    warnings: warningCodes,
    practicePart,
    warningCodes,
  };
}
