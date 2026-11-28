/**
 * Kiểu đệm hợp âm khi phát (chỉ ảnh hưởng tiếng phát, không sửa và không phụ thuộc bản nhạc): người nghe tự chọn trong
 * Mixer. Thay vì dập cả hợp âm một lần ở mỗi ký hiệu, phần đệm chơi theo một hình đệm.
 *
 * Thuần tính toán (không đụng Web Audio) để kiểm thử bằng node:test. Vị trí tính bằng nốt đen kể từ đầu ô.
 */
import type { ChordNotes } from '../notation/chordNotes';

export type AccompanimentStyle = 'sustain' | 'arpeggio' | 'bounce' | 'march';

export const ACCOMPANIMENT_STYLES: readonly AccompanimentStyle[] = ['sustain', 'arpeggio', 'bounce', 'march'];
/** Mặc định: hợp âm ngân (gần với cách đánh cũ nhưng rải nhẹ cho đỡ "dập"). */
export const DEFAULT_ACCOMPANIMENT: AccompanimentStyle = 'sustain';

export const isAccompanimentStyle = (value: unknown): value is AccompanimentStyle =>
  typeof value === 'string' && (ACCOMPANIMENT_STYLES as readonly string[]).includes(value);

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

const pc = (midi: number): number => ((midi % 12) + 12) % 12;

/** Vùng của nốt bass (MIDI): A1–D3; mặc định quanh E2. */
const BASS_LOW = 33;
const BASS_HIGH = 50;
const BASS_HOME = 40;
/** Vùng của các nốt hợp âm phía trên: nốt thấp nhất từ D3, nốt cao nhất không vượt `ceiling` (dưới giai điệu). */
const UPPER_LOW = 50;
/** Nốt cao nhất mặc định của phần hợp âm khi không biết giai điệu ở đâu (khoảng G4). */
export const DEFAULT_CEILING = 67;

/**
 * Thế bấm hợp âm cho phần đệm, nối mượt với hợp âm trước (như người đàn): các nốt phía trên chọn thế đảo gần thế trước
 * nhất và nằm dưới giai điệu (`ceiling`), bass chọn quãng tám gần bass trước. Hợp âm nhiều hơn bốn nốt thì bỏ quãng năm.
 */
export function voiceChord(chord: ChordNotes, prev: ChordNotes | null, ceiling = DEFAULT_CEILING): ChordNotes {
  // Các cao độ (0–11) của hợp âm, nốt gốc đứng đầu (chordNotes xếp từ nốt gốc lên)
  let classes = [...new Set(chord.tones.map(pc))];
  if (classes.length > 4) {
    const fifth = pc(chord.tones[0] + 7);
    classes = classes.filter((c) => c !== fifth).slice(0, 4);
  }
  const top = Math.max(UPPER_LOW + 10, Math.min(79, ceiling));
  let best: { tones: number[]; score: number } | null = null;
  for (let low = UPPER_LOW; low <= top; low++) {
    if (!classes.includes(pc(low))) continue;
    // Thế đóng bắt đầu từ `low`: mỗi nốt kế tiếp là nốt cao hơn gần nhất thuộc hợp âm
    const tones = [low];
    while (tones.length < classes.length) {
      let next = tones[tones.length - 1] + 1;
      while (!classes.includes(pc(next)) || tones.some((t) => pc(t) === pc(next))) next++;
      tones.push(next);
    }
    if (tones[tones.length - 1] > top) break;
    const center = tones.reduce((sum, t) => sum + t, 0) / tones.length;
    const score = prev?.tones.length
      ? tones.reduce((sum, t, i) => sum + Math.abs(t - prev.tones[Math.min(i, prev.tones.length - 1)]), 0) +
        Math.abs(center - 60) * 0.15
      : Math.abs(tones[tones.length - 1] - (top - 2)) + Math.abs(center - 60) * 0.3;
    if (!best || score < best.score) best = { tones, score };
  }
  const tones = best?.tones ?? chord.tones;
  // Bass: cùng cao độ với bass của hợp âm, quãng tám gần bass trước (hoặc gần E2)
  const home = prev ? prev.bass : BASS_HOME;
  let bass = chord.bass;
  let bestBass = Infinity;
  for (let b = BASS_LOW; b <= BASS_HIGH; b++) {
    if (pc(b) !== pc(chord.bass)) continue;
    const distance = Math.abs(b - home) + (b > 47 ? 2 : 0);
    if (distance < bestBass) {
      bestBass = distance;
      bass = b;
    }
  }
  return { bass, tones };
}

/**
 * Hợp âm rải kiểu "mở" (1 – 5 – 8 – 10...): từ bass đi lên các nốt hợp âm cách xa nhau, nghe thoáng hơn rải sát. Trả về
 * tối đa 5 nốt tăng dần, bắt đầu bằng bass.
 */
export function openArpeggio(chord: ChordNotes): number[] {
  const classes = new Set([...chord.tones.map(pc), pc(chord.bass)]);
  const notes = [chord.bass];
  const gaps = [5, 4, 3, 3];
  for (const gap of gaps) {
    let next = notes[notes.length - 1] + gap;
    while (!classes.has(pc(next))) next++;
    // tránh trùng cao độ với nốt ngay trước (hợp âm hai nốt)
    if (next - notes[notes.length - 1] > 12) break;
    notes.push(next);
  }
  return notes;
}

/** Thứ tự đi lên rồi xuống của hình rải có `slots` nốt trên các nốt `open` (bass đứng đầu). */
const arpeggioOrder = (open: number[], slots: number): number[] => {
  const up = open.slice(0, Math.min(open.length, Math.ceil(slots / 2) + 1));
  const down = up.slice(1, -1).reverse();
  const cycle = [...up, ...down];
  return Array.from({ length: slots }, (_, i) => cycle[i % cycle.length]);
};

/**
 * Các nốt đệm của hợp âm `chord` (đã chọn thế bằng {@link voiceChord}) vang trong [from, to) (nốt đen từ đầu ô) theo
 * kiểu `style`, tính theo lưới phách của cả ô nên hình đệm không lệch khi hợp âm đổi giữa ô.
 * - sustain: bass rồi hợp âm rải nhẹ vài mili giây, ngân tới hết.
 * - arpeggio: rải "mở" 1 – 5 – 8 – 10 lên rồi xuống theo móc đơn (bài nhanh: nốt đen; nhịp ghép: móc đơn chia ba),
 *   nốt ngân như giữ pedal tới khi chính nốt đó được đánh lại hoặc hết hợp âm; nốt đầu nhấn hơn.
 * - bounce: bass ở phách mạnh, hợp âm ngắn nhẹ ở các phách còn lại (3/4 thành valse, 6/8 "bùm – chát – chát").
 * - march: phách 1 bass quãng tám và hợp âm, phách 3 bass quãng năm, phách 2 – 4 hợp âm nhẹ hơn; ngắt gọn.
 */
export function accompanimentHits(
  chord: ChordNotes,
  from: number,
  to: number,
  meter: Meter,
  style: AccompanimentStyle,
  bpm: number,
): AccompanimentHit[] {
  const span = to - from;
  if (span <= EPS) return [];
  const grid = beatGrid(meter);
  const hits: AccompanimentHit[] = [];
  const upper = (count: number) => chord.tones.slice(Math.max(0, chord.tones.length - count));
  const block = (q: number, length: number, weight: number, tones: number[], roll = false) =>
    tones.forEach((midi, i) => hits.push({ q, length, midi, bass: false, weight, roll: roll ? i + 1 : 0 }));
  const beatIndex = (q: number) => Math.round(q / grid.beat);

  if (style === 'sustain') {
    hits.push({ q: from, length: span, midi: chord.bass, bass: true, weight: 1, roll: 0 });
    block(from, span, 0.9, chord.tones, true);
    return hits;
  }

  if (style === 'arpeggio') {
    const step = grid.compound ? grid.beat / 3 : bpm >= 120 ? grid.beat : grid.beat / 2;
    const perMeasure = Math.max(1, Math.round((grid.beat * grid.count) / step));
    const order = arpeggioOrder(openArpeggio(chord), Math.min(perMeasure, 8));
    const points = gridPoints(from, to, step);
    points.forEach((q, i) => {
      const midi = order[i % order.length];
      const first = i % order.length === 0;
      // ngân tới khi chính nốt đó được đánh lại (như giữ pedal mà không chồng hai lần một phím) hoặc hết hợp âm
      const again = points.findIndex((_, j) => j > i && order[j % order.length] === midi);
      const end = again >= 0 ? points[again] : to;
      const rising = (i % order.length) / order.length;
      hits.push({
        q,
        length: end - q,
        midi,
        bass: first,
        weight: first ? 0.95 : 0.68 + 0.12 * (1 - Math.abs(rising - 0.5) * 2),
        roll: 0,
      });
    });
    return hits;
  }

  const beats = gridPoints(from, to, grid.beat);
  if (style === 'bounce') {
    beats.forEach((q, i) => {
      const index = beatIndex(q);
      const length = Math.min(grid.beat, to - q);
      if (grid.compound) {
        hits.push({
          q,
          length: length * 0.95,
          midi: index % 2 ? fifthOf(chord.bass) : chord.bass,
          bass: true,
          weight: 0.95,
          roll: 0,
        });
        for (const k of [1, 2]) {
          const at = q + (grid.beat / 3) * k;
          if (at < to - EPS) block(at, (grid.beat / 3) * 0.7, k === 1 ? 0.62 : 0.55, upper(3));
        }
        return;
      }
      const strong = index === 0 || (grid.count === 4 && index === 2) || i === 0;
      if (strong) {
        const midi = index === 2 && grid.count === 4 ? fifthOf(chord.bass) : chord.bass;
        hits.push({ q, length: length * 0.9, midi, bass: true, weight: 0.95, roll: 0 });
      } else block(q, length * 0.5, 0.6, upper(3));
    });
    return hits;
  }

  // march
  beats.forEach((q, i) => {
    const index = beatIndex(q);
    const length = Math.min(grid.beat, to - q) * 0.6;
    const downbeat = index === 0 || i === 0;
    const third = grid.count === 4 && index === 2;
    if (downbeat) {
      hits.push({ q, length, midi: chord.bass, bass: true, weight: 1, roll: 0 });
      if (chord.bass + 12 < chord.tones[0])
        hits.push({ q, length, midi: chord.bass + 12, bass: true, weight: 0.75, roll: 0 });
      block(q, length, 0.9, chord.tones);
    } else if (third) {
      hits.push({ q, length, midi: fifthOf(chord.bass), bass: true, weight: 0.9, roll: 0 });
      block(q, length, 0.75, chord.tones);
    } else block(q, length * 0.8, 0.6, upper(3));
  });
  return hits;
}
