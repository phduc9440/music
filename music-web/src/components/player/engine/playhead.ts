/**
 * Vạch phát (playhead) kiểu MuseScore: một vạch dọc phủ cả hệ khuông, trượt qua ô nhịp đang phát theo đúng thời điểm của
 * từng nốt. Vị trí tính bằng cách nội suy giữa các "cột" nốt (thời điểm bắt đầu → toạ độ x của đầu nốt) trong ô, nên vạch
 * đi chậm ở nốt dài, nhanh ở nốt ngắn và luôn nằm đúng trên nốt đang vang.
 *
 * Toạ độ tính theo khung `host` (phần tử chứa SVG của OSMD, có `position: relative`) nên không đổi khi cuộn; chỉ cần dựng
 * lại sau mỗi lần OSMD vẽ lại (đổi zoom, sửa nốt, đổi độ rộng) hoặc khi dòng thời gian đổi.
 */
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { HEAD_ID_ATTR, NOTE_ID_ATTR, NOTE_IDS_ATTR } from '../../editor/core/osmdBridge';
import { CHORD_TRACK_ID, measureOrderAt } from './timeline';
import type { Timeline } from './timeline';

export const PLAYHEAD_CLASS = 'pl-playhead';

/** Vạch nhô ra trên / dưới hệ khuông chừng này khoảng dòng kẻ. */
const OVERHANG_SPACES = 1.5;
/** Cuối ô: vạch dừng cách vạch nhịp chừng này khoảng dòng kẻ. */
const END_INSET_SPACES = 0.6;

interface Point {
  time: number;
  x: number;
}

/** Hình học của một ô trong lượt phát (toạ độ theo `host`). */
interface OrderGeometry {
  start: number;
  end: number;
  /** Mép trái phần nốt (sau khóa / hóa biểu đầu dòng) và mép phải của ô. */
  left: number;
  right: number;
  top: number;
  bottom: number;
  points: Point[];
}

export interface PlayheadMap {
  orders: (OrderGeometry | null)[];
}

export interface PlayheadSpot {
  x: number;
  top: number;
  bottom: number;
}

interface LooseShape {
  AbsolutePosition: { x: number; y: number };
  Size: { width: number; height: number };
}
interface LooseMeasure {
  PositionAndShape: LooseShape;
  beginInstructionsWidth?: number;
  ParentStaffLine?: { PositionAndShape: LooseShape; ParentMusicSystem?: { Parent?: unknown } };
}
interface LooseSheet {
  MeasureList?: (LooseMeasure | undefined)[][];
  MusicPages?: unknown[];
}

interface MeasureBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  space: number;
}

/** Khung của mỗi ô nhịp (gộp mọi khuông) theo hình học của OSMD, toạ độ theo `host`. */
const measureBoxes = (osmd: OpenSheetMusicDisplay, host: HTMLElement): (MeasureBox | null)[] => {
  const sheet = osmd.GraphicSheet as unknown as LooseSheet | undefined;
  const list = sheet?.MeasureList ?? [];
  const unit = (osmd.EngravingRules as { UnitInPixels?: number } | undefined)?.UnitInPixels ?? 10;
  const svgs = Array.from(host.querySelectorAll('svg'));
  const origin = host.getBoundingClientRect();
  return list.map((row) => {
    let box: MeasureBox | null = null;
    for (const measure of row ?? []) {
      const line = measure?.ParentStaffLine;
      if (!measure || !line || svgs.length === 0) continue;
      const page = line.ParentMusicSystem?.Parent;
      const pageIndex = page ? (sheet?.MusicPages ?? []).indexOf(page) : 0;
      const svg = svgs[pageIndex >= 0 && pageIndex < svgs.length ? pageIndex : 0];
      const rect = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal.width;
      const space = unit * (viewBox > 0 ? rect.width / viewBox : 1);
      const x = rect.left - origin.left + measure.PositionAndShape.AbsolutePosition.x * space;
      const left = x + (measure.beginInstructionsWidth ?? 0) * space;
      const right = x + measure.PositionAndShape.Size.width * space;
      const top = rect.top - origin.top + line.PositionAndShape.AbsolutePosition.y * space;
      const bottom = top + 4 * space;
      if (!box) box = { left, right, top, bottom, space };
      else {
        box.left = Math.max(box.left, left);
        box.right = Math.min(box.right, right);
        box.top = Math.min(box.top, top);
        box.bottom = Math.max(box.bottom, bottom);
      }
    }
    return box;
  });
};

/** Toạ độ x (giữa đầu nốt, theo `host`) của từng id nốt đã gắn trên SVG. */
const headCenters = (host: HTMLElement): Map<string, number> => {
  const origin = host.getBoundingClientRect();
  const centers = new Map<string, number>();
  const put = (id: string, rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return;
    const x = rect.left - origin.left + rect.width / 2;
    centers.set(id, Math.min(centers.get(id) ?? Infinity, x));
  };
  host
    .querySelectorAll(`[${HEAD_ID_ATTR}]`)
    .forEach((el) => put(el.getAttribute(HEAD_ID_ATTR) ?? '', el.getBoundingClientRect()));
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const ids = (el.getAttribute(NOTE_IDS_ATTR) ?? el.getAttribute(NOTE_ID_ATTR) ?? '').split(' ');
    const missing = ids.filter((id) => id && !centers.has(id));
    if (missing.length === 0) return;
    const head = el.querySelector('.vf-notehead') ?? el;
    const rect = head.getBoundingClientRect();
    missing.forEach((id) => put(id, rect));
  });
  return centers;
};

/** Dựng bảng vị trí cho mọi ô trong lượt phát. Gọi lại sau mỗi lần OSMD vẽ lại hoặc dòng thời gian đổi. */
export function buildPlayheadMap(osmd: OpenSheetMusicDisplay, host: HTMLElement, timeline: Timeline): PlayheadMap {
  const boxes = measureBoxes(osmd, host);
  const centers = headCenters(host);
  const byOrder = new Map<number, Map<number, number>>(); // order → (thời điểm → x nhỏ nhất)
  for (const e of timeline.events) {
    if (e.ornament || e.trackId === CHORD_TRACK_ID) continue;
    const x = centers.get(e.id);
    if (x === undefined) continue;
    const columns = byOrder.get(e.order) ?? new Map<number, number>();
    const key = Math.round(e.time * 1000) / 1000;
    columns.set(key, Math.min(columns.get(key) ?? Infinity, x));
    byOrder.set(e.order, columns);
  }
  const orders = timeline.measures.map((m): OrderGeometry | null => {
    const box = boxes[m.index];
    if (!box) return null;
    const right = box.right - END_INSET_SPACES * box.space;
    const points = Array.from(byOrder.get(m.order) ?? [])
      .map(([time, x]) => ({ time, x: Math.min(x, right) }))
      .filter((p) => p.time >= m.start - 1e-6 && p.time < m.end)
      .sort((a, b) => a.time - b.time);
    const overhang = OVERHANG_SPACES * box.space;
    return {
      start: m.start,
      end: m.end,
      left: Math.min(box.left, points[0]?.x ?? box.left),
      right,
      top: box.top - overhang,
      bottom: box.bottom + overhang,
      points,
    };
  });
  return { orders };
}

/** Vị trí vạch tại thời điểm `time` (giây bản nhạc), hoặc null nếu ô đó chưa vẽ. */
export function playheadAt(map: PlayheadMap, timeline: Timeline, time: number): PlayheadSpot | null {
  if (timeline.measures.length === 0) return null;
  const order = measureOrderAt(timeline, time);
  const geo = map.orders[order];
  if (!geo) return null;
  // Đầu ô → các cột nốt → cuối ô (sát vạch nhịp)
  const points: Point[] = [];
  if (!geo.points.length || geo.points[0].time > geo.start + 1e-6) points.push({ time: geo.start, x: geo.left });
  points.push(...geo.points, { time: geo.end, x: geo.right });
  let x = points[points.length - 1].x;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time < b.time) {
      const span = b.time - a.time;
      x = span > 0 ? a.x + ((Math.max(time, a.time) - a.time) / span) * (b.x - a.x) : a.x;
      break;
    }
  }
  return { x, top: geo.top, bottom: geo.bottom };
}
