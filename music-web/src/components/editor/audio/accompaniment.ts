/**
 * Kiểu đệm hợp âm khi phát (chỉ ảnh hưởng tiếng phát, không sửa bản nhạc): thay vì dập cả hợp âm một lần ở mỗi ký hiệu,
 * phần đệm chơi theo một hình đệm hợp với tính chất bài. "Tự động" đọc chữ chỉ dẫn đầu bài (Vui tươi, Hào hùng, Trữ tình,
 * Allegro, Maestoso...), không có thì đoán theo tempo.
 *
 * Thuần tính toán (không đụng Web Audio) để kiểm thử bằng node:test. Vị trí tính bằng nốt đen kể từ đầu ô.
 */
import type { ChordNotes } from '../notation/chordNotes';

export type AccompanimentStyle = 'auto' | 'sustain' | 'arpeggio' | 'bounce' | 'march';
export type ResolvedStyle = Exclude<AccompanimentStyle, 'auto'>;

export const ACCOMPANIMENT_STYLES: readonly AccompanimentStyle[] = ['auto', 'sustain', 'arpeggio', 'bounce', 'march'];
export const DEFAULT_ACCOMPANIMENT: AccompanimentStyle = 'auto';

export const isAccompanimentStyle = (value: unknown): value is AccompanimentStyle =>
  typeof value === 'string' && (ACCOMPANIMENT_STYLES as readonly string[]).includes(value);

/** Bỏ dấu tiếng Việt và viết thường để so từ khóa ("Vui tươi" → "vui tuoi"). */
export const plainText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase();

/** Từ khóa chỉ tính chất (đã bỏ dấu), theo thứ tự ưu tiên khi cùng xuất hiện. */
const KEYWORDS: readonly [ResolvedStyle, RegExp][] = [
  [
    'march',
    /hao hung|hung trang|hung manh|manh me|hanh khuc|tien buoc|quyet tam|kien quyet|trang nghiem|maestoso|marcia|march|marziale|energico|con brio|risoluto|eroico|pomposo/,
  ],
  [
    'bounce',
    /vui|ron rang|hon nhien|nhi nhanh|phan khoi|soi noi|tuoi sang|nhanh|linh hoat|allegr|vivace|presto|giocoso|scherz|leggiero|brillante|animato|valse|waltz|polka/,
  ],
  [
    'arpeggio',
    /tru tinh|tha thiet|thiet tha|sau lang|nhe nhang|em dem|diu dang|cham|khoan thai|buon|man mac|boi hoi|mo mang|tam tinh|\bru\b|dolce|cantabile|espressivo|lento|adagio|largo|larghetto|andante|ballad|rubato|tranquill|legato|grave|sostenuto/,
  ],
];

/** Tempo (nốt đen mỗi phút) chậm hơn mức này thì mặc định đệm rải, nhanh hơn mức kia thì đệm nhún. */
const SLOW_BPM = 84;
const FAST_BPM = 132;

/**
 * Kiểu đệm tự động: theo chữ chỉ dẫn (chữ nào đứng trước thì được tính), không có thì theo tempo: nhanh thì đệm nhún
 * (bass – hợp âm), còn lại đệm rải.
 */
export function detectAccompaniment(texts: readonly string[], bpm: number): ResolvedStyle {
  let best: { style: ResolvedStyle; at: number } | null = null;
  const joined = plainText(texts.join(' · '));
  for (const [style, pattern] of KEYWORDS) {
    const match = pattern.exec(joined);
    if (match && (!best || match.index < best.at)) best = { style, at: match.index };
  }
  if (best) return best.style;
  if (bpm >= FAST_BPM) return 'bounce';
  if (bpm <= SLOW_BPM) return 'arpeggio';
  return 'arpeggio';
}

export function resolveAccompaniment(style: AccompanimentStyle, texts: readonly string[], bpm: number): ResolvedStyle {
  return style === 'auto' ? detectAccompaniment(texts, bpm) : style;
}

/** Nhịp của ô: số phách, độ dài một phách (nốt đen), nhịp ghép (6/8, 9/8, 12/8) hay không. */
export interface Meter {
  beats: number;
  beatType: number;
}

interface BeatGrid {
  /** Độ dài một phách (nốt đen): 6/8 là nốt đen chấm (1,5), 3/4 là 1, 2/2 là 2. */
  beat: number;
  /** Số phách mỗi ô. */
  count: number;
  /** Phách nhóm ba (6/8...): mỗi phách chia ba. */
  compound: boolean;
}

export function beatGrid(meter: Meter): BeatGrid {
  const unit = 4 / (meter.beatType || 4);
  const compound = meter.beatType >= 8 && meter.beats % 3 === 0 && meter.beats > 3;
  return compound
    ? { beat: unit * 3, count: meter.beats / 3, compound }
    : { beat: unit, count: Math.max(1, meter.beats), compound };
}

/** Một nốt đệm: vị trí và độ dài (nốt đen, tính từ đầu ô), cao độ, vai trò, độ nhấn, có ngân tới hết hợp âm không. */
export interface AccompanimentHit {
  q: number;
  length: number;
  midi: number;
  bass: boolean;
  /** Hệ số âm lượng so với mức thường của vai trò đó (1 = như cũ). */
  weight: number;
  /** Thứ tự trong một lần dập (để rải nhẹ vài mili giây cho đỡ "dập"); 0 là nốt vào đúng phách. */
  roll: number;
}

const EPS = 1e-6;

/** Các điểm lưới bước `step` (tính từ đầu ô) nằm trong [from, to); luôn có `from` (hợp âm vào lệch lưới vẫn được đánh). */
const gridPoints = (from: number, to: number, step: number): number[] => {
  const points = [from];
  for (let q = Math.ceil((from + EPS) / step) * step; q < to - EPS; q += step) if (q > from + EPS) points.push(q);
  return points;
};

/** Nốt bass phụ (quãng năm) cho nhịp sau: đi lên nếu còn thấp, không thì xuống quãng bốn. */
const fifthOf = (bass: number): number => (bass + 7 <= 50 ? bass + 7 : bass - 5);

/**
 * Các nốt đệm của hợp âm `chord` vang trong [from, to) (nốt đen từ đầu ô) theo kiểu `style`.
 * - sustain: dập cả hợp âm một lần, rải nhẹ, ngân tới hết.
 * - arpeggio: rải đều từng nốt theo móc đơn (bài nhanh: nốt đen; nhịp ghép: móc đơn chia ba), các nốt ngân chồng lên nhau.
 * - bounce: bass vào phách mạnh, hợp âm ngắn ở các phách còn lại (3/4 thành valse "bùm – chát – chát").
 * - march: hợp âm đầy ở mọi phách, phách 1 nhấn, bass xen gốc – quãng năm, ngắt gọn.
 */
export function accompanimentHits(
  chord: ChordNotes,
  from: number,
  to: number,
  meter: Meter,
  style: ResolvedStyle,
  bpm: number,
): AccompanimentHit[] {
  const span = to - from;
  if (span <= EPS) return [];
  const grid = beatGrid(meter);
  const hits: AccompanimentHit[] = [];
  const block = (q: number, length: number, weight: number, bassMidi: number | null, roll: boolean) => {
    let order = 0;
    if (bassMidi !== null) hits.push({ q, length, midi: bassMidi, bass: true, weight, roll: roll ? order++ : 0 });
    for (const midi of chord.tones) hits.push({ q, length, midi, bass: false, weight, roll: roll ? order++ : 0 });
  };
  const beatIndex = (q: number) => Math.round(q / grid.beat);

  if (style === 'sustain') {
    block(from, span, 1, chord.bass, true);
    return hits;
  }

  if (style === 'arpeggio') {
    // Bước rải: nhịp ghép chia ba mỗi phách; nhịp thường chia đôi (bài nhanh thì mỗi phách một nốt)
    const step = grid.compound ? grid.beat / 3 : bpm >= 120 ? grid.beat : grid.beat / 2;
    const upper = chord.tones;
    const cycle = [chord.bass, ...upper, ...upper.slice(1, -1).reverse()];
    const points = gridPoints(from, to, step);
    points.forEach((q, i) => {
      const midi = cycle[i % cycle.length];
      const bass = i % cycle.length === 0;
      // Mỗi nốt ngân tới hết hợp âm (như giữ pedal), riêng bass nhắc lại thì ngắt nốt bass trước
      hits.push({ q, length: to - q, midi, bass, weight: bass ? 1 : 0.85, roll: 0 });
    });
    return hits;
  }

  const beats = gridPoints(from, to, grid.beat);
  if (style === 'bounce') {
    beats.forEach((q, i) => {
      const index = beatIndex(q);
      const length = Math.min(grid.beat, to - q);
      if (grid.compound) {
        // nhịp ghép: bass ở đầu phách, hai móc đơn sau là hợp âm ("bùm – chát – chát"); phách sau bass quãng năm
        hits.push({
          q,
          length: length * 0.95,
          midi: index % 2 ? fifthOf(chord.bass) : chord.bass,
          bass: true,
          weight: 1,
          roll: 0,
        });
        for (const k of [1, 2]) {
          const at = q + (grid.beat / 3) * k;
          if (at < to - EPS) block(at, (grid.beat / 3) * 0.6, 0.8, null, false);
        }
        return;
      }
      // phách mạnh (phách 1, và phách 3 của 4/4) là bass, các phách khác là hợp âm ngắn: 3/4 thành valse, 2/4 và 4/4
      // thành "bùm – chát"; hợp âm vào giữa ô thì nốt đầu vẫn là bass
      const strong = index === 0 || (grid.count === 4 && index === 2) || i === 0;
      if (strong) {
        const midi = index === 2 && grid.count === 4 ? fifthOf(chord.bass) : chord.bass;
        hits.push({ q, length: length * 0.95, midi, bass: true, weight: 1, roll: 0 });
      } else block(q, length * 0.55, 0.8, null, false);
    });
    return hits;
  }

  // march
  beats.forEach((q) => {
    const index = beatIndex(q);
    const length = Math.min(grid.beat, to - q) * 0.75;
    const strong = index === 0 || (grid.count === 4 && index === 2);
    const bass = strong ? (index === 2 ? fifthOf(chord.bass) : chord.bass) : null;
    block(q, length, index === 0 ? 1.05 : strong ? 0.92 : 0.8, bass, false);
  });
  return hits;
}
