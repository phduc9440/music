/**
 * Đổi một điểm trên màn hình thành vị trí trên khuông nhạc: ô nhịp, khuông, cao độ (theo khóa nhạc) và chỗ chèn nốt.
 * Dùng hình học của OSMD (GraphicSheet): 1 đơn vị = một khoảng cách giữa hai dòng kẻ = UnitInPixels đơn vị SVG; zoom
 * đã nằm trong tỉ lệ viewBox → màn hình của thẻ <svg> nên không nhân thêm.
 */
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { InsertTarget } from './durations';
import { NOTE_ID_ATTR } from './osmdBridge';
import { STEPS } from './pitch';
import type { Step } from './pitch';
import type { ScoreDocument } from './ScoreDocument';

/** Kiểu dữ liệu kéo-thả của nút trường độ trên bảng công cụ. */
export const DURATION_DRAG_TYPE = 'application/x-score-duration';

/** Chỗ trên khuông mà con trỏ đang chỉ vào. */
export interface StaffSpot extends InsertTarget {
  /** Vị trí nốt mờ / khung nhập (px màn hình): tâm đầu nốt. */
  x: number;
  y: number;
  /** Nửa khoảng cách giữa hai dòng kẻ (px), tức khoảng cách giữa hai bậc liền nhau. */
  halfStep: number;
  /** Bậc so với dòng kẻ trên cùng (0 = dòng trên cùng, 8 = dòng dưới cùng, âm = phía trên khuông). */
  line: number;
}

interface LooseRect {
  x: number;
  y: number;
}
interface LooseShape {
  AbsolutePosition: LooseRect;
  Size: { width: number; height: number };
}
interface LooseMeasure {
  PositionAndShape: LooseShape;
  ParentStaffLine?: {
    PositionAndShape: LooseShape;
    ParentMusicSystem?: { Parent?: unknown };
  };
}
interface LooseSheet {
  MeasureList?: (LooseMeasure | undefined)[][];
  MusicPages?: unknown[];
}

/** Con trỏ cách khuông tối đa bao nhiêu khoảng (dòng kẻ) thì còn tính là bấm vào khuông. */
const REACH_SPACES = 3.5;
/** Dung sai ngang khi bấm vào dấu lặng (px). */
const REST_SLACK = 4;

/** Vị trí chỉ số bậc (C=0 … B=6, mỗi quãng tám 7) của dòng kẻ trên cùng theo khóa nhạc đang có hiệu lực. */
export const topLineDiatonic = (
  doc: ScoreDocument,
  partIndex: number,
  measureIndex: number,
  staff: number,
): number | null => {
  let sign = 'G';
  let line: number | null = null;
  let shift = 0;
  doc.getMeasures(partIndex).forEach((measure, index) => {
    if (index > measureIndex) return;
    for (const attributes of Array.from(measure.children).filter((c) => c.tagName === 'attributes')) {
      for (const clef of Array.from(attributes.children).filter((c) => c.tagName === 'clef')) {
        if (Number(clef.getAttribute('number') ?? 1) !== staff) continue;
        const text = (tag: string) =>
          Array.from(clef.children)
            .find((c) => c.tagName === tag)
            ?.textContent?.trim();
        sign = text('sign') ?? sign;
        line = text('line') ? Number(text('line')) : null;
        shift = Number(text('clef-octave-change') ?? 0) || 0;
      }
    }
  });
  const base: Record<string, { d: number; line: number }> = {
    G: { d: 4 * 7 + 4, line: 2 },
    F: { d: 3 * 7 + 3, line: 4 },
    C: { d: 4 * 7, line: 3 },
  };
  const entry = base[sign];
  if (!entry) return null;
  return entry.d + (5 - (line ?? entry.line)) * 2 + shift * 7;
};

/** Cao độ tự nhiên (bậc + quãng tám) ở `line` bậc dưới dòng kẻ trên cùng. */
export const pitchAtLine = (topD: number, line: number): { step: Step; octave: number } => {
  const d = topD - line;
  return { step: STEPS[((d % 7) + 7) % 7], octave: Math.floor(d / 7) };
};

interface EntryBox {
  voice: number;
  entryIndex: number;
  isRest: boolean;
  left: number;
  right: number;
  centerX: number;
}

/**
 * Tìm chỗ trên khuông ứng với điểm (clientX, clientY).
 * @returns null nếu điểm không ở gần khuông nào hoặc khóa nhạc không hỗ trợ (ví dụ khuông gõ)
 */
export function locateSpot(
  osmd: OpenSheetMusicDisplay,
  doc: ScoreDocument,
  host: HTMLElement,
  clientX: number,
  clientY: number,
): StaffSpot | null {
  const sheet = osmd.GraphicSheet as unknown as LooseSheet | undefined;
  const list = sheet?.MeasureList;
  if (!sheet || !list) return null;
  const unit = (osmd.EngravingRules as { UnitInPixels?: number } | undefined)?.UnitInPixels ?? 10;
  const svgs = Array.from(host.querySelectorAll('svg'));
  if (svgs.length === 0) return null;

  // khuông toàn cục → (part, khuông trong part)
  const staffMap: { partIndex: number; staff: number }[] = [];
  for (let p = 0; p < doc.partCount; p++) {
    for (let s = 1; s <= doc.staffCountOfPart(p); s++) staffMap.push({ partIndex: p, staff: s });
  }

  let best: {
    partIndex: number;
    staff: number;
    measureIndex: number;
    top: number;
    space: number;
    distance: number;
  } | null = null;

  for (let m = 0; m < list.length; m++) {
    const row = list[m] ?? [];
    for (let g = 0; g < row.length; g++) {
      const measure = row[g];
      const mapped = staffMap[g];
      const line = measure?.ParentStaffLine;
      if (!measure || !mapped || !line) continue;
      const page = line.ParentMusicSystem?.Parent;
      const pageIndex = page ? (sheet.MusicPages ?? []).indexOf(page) : 0;
      const svg = svgs[pageIndex >= 0 && pageIndex < svgs.length ? pageIndex : 0];
      const box = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal.width;
      const scale = viewBox > 0 ? box.width / viewBox : 1;
      const space = unit * scale; // px của một khoảng giữa hai dòng kẻ
      const left = box.left + measure.PositionAndShape.AbsolutePosition.x * space;
      const right = left + measure.PositionAndShape.Size.width * space;
      if (clientX < left || clientX > right) continue;
      const top = box.top + line.PositionAndShape.AbsolutePosition.y * space;
      const bottom = top + 4 * space;
      const distance = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
      if (distance > REACH_SPACES * space) continue;
      if (!best || distance < best.distance) {
        best = { partIndex: mapped.partIndex, staff: mapped.staff, measureIndex: m, top, space, distance };
      }
    }
  }
  if (!best) return null;

  const topD = topLineDiatonic(doc, best.partIndex, best.measureIndex, best.staff);
  if (topD === null) return null;
  const halfStep = best.space / 2;
  const line = Math.round((clientY - best.top) / halfStep);
  const { step, octave } = pitchAtLine(topD, line);

  // Các mục (nốt/hợp âm/dấu lặng) của khuông này trong ô, lấy từ các nhóm SVG đã gắn id
  const boxes: EntryBox[] = [];
  const seen = new Set<string>();
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const info = doc.getInfo(el.getAttribute(NOTE_ID_ATTR) ?? '');
    if (!info || info.partIndex !== best.partIndex || info.measureIndex !== best.measureIndex) return;
    if (info.staff !== best.staff || info.isGrace) return;
    const key = `${info.voice}|${info.entryIndex}`;
    if (seen.has(key)) return;
    seen.add(key);
    const r = el.getBoundingClientRect();
    boxes.push({
      voice: info.voice,
      entryIndex: info.entryIndex,
      isRest: info.isRest,
      left: r.left,
      right: r.right,
      centerX: (r.left + r.right) / 2,
    });
  });

  const restHit = boxes.find((b) => b.isRest && clientX >= b.left - REST_SLACK && clientX <= b.right + REST_SLACK);
  let voice = restHit?.voice ?? 1;
  if (!restHit && boxes.length > 0) {
    voice = boxes.reduce((a, b) => (Math.abs(b.centerX - clientX) < Math.abs(a.centerX - clientX) ? b : a)).voice;
  }
  // Chỉ số mục trong bè tính theo DOM (bỏ nốt trang trí), khớp với chỉ số dùng khi chèn
  const entries = doc.notes
    .filter(
      (n) =>
        n.partIndex === best.partIndex &&
        n.measureIndex === best.measureIndex &&
        n.staff === best.staff &&
        n.voice === voice &&
        n.chordIndex === 0 &&
        !n.isGrace,
    )
    .sort((a, b) => a.entryIndex - b.entryIndex);
  const boxOf = (entryIndex: number) => boxes.find((b) => b.voice === voice && b.entryIndex === entryIndex);
  const afterAt = entries.findIndex((n) => (boxOf(n.entryIndex)?.centerX ?? -Infinity) > clientX);
  const beforeEntry = afterAt >= 0 ? afterAt : entries.length;
  const restAt = restHit ? entries.findIndex((n) => n.entryIndex === restHit.entryIndex) : -1;

  return {
    partIndex: best.partIndex,
    measureIndex: best.measureIndex,
    staff: best.staff,
    voice,
    step,
    octave,
    beforeEntry,
    restEntry: restAt >= 0 ? restAt : null,
    x: restHit && restAt >= 0 ? restHit.centerX : clientX,
    y: best.top + line * halfStep,
    halfStep,
    line,
  };
}

/** Tên nốt theo tiếng Việt (Đô Rê Mi...) kèm quãng tám, ví dụ "Mi4". */
export const solfegeName = (step: Step, octave: number): string =>
  `${{ C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' }[step]}${octave}`;

/** Bỏ phần toạ độ màn hình, chỉ giữ vị trí để chèn nốt. */
export const spotTarget = (spot: StaffSpot): InsertTarget => ({
  partIndex: spot.partIndex,
  measureIndex: spot.measureIndex,
  staff: spot.staff,
  voice: spot.voice,
  step: spot.step,
  octave: spot.octave,
  beforeEntry: spot.beforeEntry,
  restEntry: spot.restEntry,
});

/** Các dòng kẻ phụ (theo chỉ số bậc) cần vẽ cho nốt ở `line`. */
export const ledgerLines = (line: number): number[] => {
  const out: number[] = [];
  if (line < 0) for (let k = -2; k >= line; k -= 2) out.push(k);
  else if (line > 8) for (let k = 10; k <= line; k += 2) out.push(k);
  return out;
};
