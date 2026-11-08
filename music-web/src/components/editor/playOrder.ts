/**
 * Thứ tự các ô nhịp khi phát: lặp lại (|: :|), nhà 1 / nhà 2 (volta), D.C., D.S., Fine, To Coda. Đọc theo các ô của
 * part đầu tiên; quy tắc theo thông lệ: khi quay lại (D.C./D.S.) thì không lặp lại các dấu lặp nữa.
 */
import type { ScoreDocument } from './ScoreDocument';

interface Marks {
  forward: boolean;
  backward: number; // số lần chơi của đoạn lặp (0 = không có dấu lặp cuối)
  endings: number[] | null; // các lần chơi mà ô này thuộc (nhà 1 / nhà 2...)
  groupLast: number; // số thứ tự nhà cuối của cụm nhà (liền nhau) chứa ô này; 0 nếu ô không thuộc nhà nào
  segno: boolean;
  coda: boolean;
  dc: boolean;
  ds: boolean;
  fine: boolean;
  toCoda: boolean;
}

const endingNumbers = (text: string | null): number[] =>
  (text ?? '')
    .split(/[,\s]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);

const readMarks = (doc: ScoreDocument): Marks[] => {
  const measures = doc.getMeasures(0);
  let activeEnding: number[] | null = null;
  const all = measures.map((measure) => {
    const marks: Marks = {
      forward: false,
      backward: 0,
      endings: null,
      groupLast: 0,
      segno: false,
      coda: false,
      dc: false,
      ds: false,
      fine: false,
      toCoda: false,
    };
    let closesEnding = false;
    for (const barline of Array.from(measure.children).filter((c) => c.tagName === 'barline')) {
      const repeat = Array.from(barline.children).find((c) => c.tagName === 'repeat');
      if (repeat?.getAttribute('direction') === 'forward') marks.forward = true;
      if (repeat?.getAttribute('direction') === 'backward') marks.backward = Number(repeat.getAttribute('times')) || 2;
      const ending = Array.from(barline.children).find((c) => c.tagName === 'ending');
      if (ending) {
        if (ending.getAttribute('type') === 'start') activeEnding = endingNumbers(ending.getAttribute('number'));
        else closesEnding = true;
      }
    }
    marks.endings = activeEnding;
    if (closesEnding) activeEnding = null;
    for (const sound of Array.from(measure.getElementsByTagName('sound'))) {
      if (sound.hasAttribute('segno')) marks.segno = true;
      if (sound.hasAttribute('coda')) marks.coda = true;
      if (sound.getAttribute('dacapo') === 'yes') marks.dc = true;
      if (sound.hasAttribute('dalsegno')) marks.ds = true;
      if (sound.getAttribute('fine') === 'yes' || sound.hasAttribute('fine')) marks.fine = true;
      if (sound.hasAttribute('tocoda')) marks.toCoda = true;
    }
    return marks;
  });
  // Cụm nhà = các ô nhà liền nhau; khi quay lại bằng D.C./D.S. chỉ phát nhà cuối của cụm (bỏ nhà 1)
  let start = 0;
  while (start < all.length) {
    if (!all[start].endings) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < all.length && all[end].endings) end += 1;
    const last = Math.max(0, ...all.slice(start, end).flatMap((m) => m.endings ?? []));
    for (let k = start; k < end; k++) all[k].groupLast = last;
    start = end;
  }
  return all;
};

/** Chỉ số các ô nhịp theo thứ tự phát (một ô có thể xuất hiện nhiều lần). */
export function playOrder(doc: ScoreDocument): number[] {
  const marks = readMarks(doc);
  const n = marks.length;
  const order: number[] = [];
  let i = 0;
  let pass = 1;
  let repeatStart = 0;
  let jumped = false;
  const segnoAt = marks.findIndex((m) => m.segno);
  const codaAt =
    marks.findIndex((m, idx) => m.coda && idx > 0) >= 0 ? marks.findIndex((m, idx) => m.coda && idx > 0) : -1;

  for (let guard = 0; i < n && guard < n * 12; guard++) {
    const m = marks[i];
    if (m.endings && (jumped ? !m.endings.includes(m.groupLast) : !m.endings.includes(pass))) {
      i += 1; // ô thuộc nhà của lần chơi khác (khi quay lại bằng D.C./D.S. chỉ lấy nhà cuối)
      continue;
    }
    if (m.forward && !jumped) repeatStart = i;
    order.push(i);
    if (jumped && m.fine) break;
    if (jumped && m.toCoda && codaAt >= 0) {
      i = codaAt;
      jumped = false;
      pass = 1;
      repeatStart = i;
      // sau khi nhảy tới Coda không còn quay lại nữa
      marks.forEach((x) => (x.dc = x.ds = false));
      continue;
    }
    if (!jumped && m.backward > 0) {
      if (pass < m.backward) {
        pass += 1;
        i = repeatStart;
        continue;
      }
      pass = 1;
      repeatStart = i + 1;
    }
    if (!jumped && (m.dc || m.ds)) {
      const target = m.ds ? segnoAt : 0;
      if (target >= 0) {
        jumped = true;
        pass = 1;
        i = target;
        continue;
      }
    }
    i += 1;
  }
  return order.length > 0 ? order : marks.map((_, idx) => idx);
}
