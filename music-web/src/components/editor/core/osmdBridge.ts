/**
 * Cầu nối giữa {@link ScoreDocument} (DOM MusicXML) và đồ họa OSMD (SVG).
 *
 * Sau mỗi lần `osmd.render()`, {@link bindNoteIds} duyệt đồ thị của OSMD, ghép từng nốt đồ họa với nốt trong DOM rồi
 * gắn `data-note-id` vào nhóm SVG. Sự kiện được bắt ủy quyền trên khung vẽ qua {@link noteIdsFromEvent}, và việc tô
 * nốt chọn chỉ đổi class CSS ({@link applySelection}) nên không phải vẽ lại cả bản nhạc.
 */
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { ScoreDocument, toOnsetKey } from './ScoreDocument';
import type { NoteInfo } from './ScoreDocument';

/** Thuộc tính chứa id nốt đầu của nhóm (cả hợp âm là một nhóm SVG). */
export const NOTE_ID_ATTR = 'data-note-id';
/** Thuộc tính chứa mọi id của nhóm, cách nhau bằng dấu cách (hợp âm có nhiều id). */
export const NOTE_IDS_ATTR = 'data-note-ids';
/** Class CSS tô nốt đang chọn. */
export const SELECTED_CLASS = 'ed-note--selected';
/**
 * Id của từng đầu nốt trong hợp âm (gắn trên nhóm `.vf-notehead` bên trong nhóm SVG của hợp âm). Bấm trúng đầu nốt thì
 * chỉ chọn nốt đó; bấm vào thân/đuôi nốt thì chọn cả hợp âm (giống MuseScore).
 */
export const HEAD_ID_ATTR = 'data-head-id';

/** Kết quả ghép, dùng để kiểm tra spike. */
export interface BindReport {
  /** Số nốt trong DOM. */
  domNotes: number;
  /** Số nốt đã gắn được vào SVG. */
  bound: number;
  /** Mô tả các nhóm ghép không khớp (khác số lượng hoặc không có phần tử SVG). */
  problems: string[];
}

/** Phần của GraphicalNote chỉ có ở bản VexFlow (backend SVG). */
interface SvgNote {
  getSVGGElement?: () => SVGGElement | undefined;
}

interface OsmdNote {
  svg: SVGGElement | undefined;
  voiceId: number;
  halfTone: number;
}

/**
 * Ghép nốt OSMD với nốt DOM rồi gắn `data-note-id` / `data-note-ids` vào nhóm SVG.
 *
 * Cách ghép: trong cùng khuông và ô nhịp, gom theo (thời điểm, dấu lặng hay nốt); mỗi nhóm sắp theo (bè, cao độ) ở cả
 * hai phía rồi ghép theo thứ tự. Vì chỉ dùng thứ tự tương đối nên không phụ thuộc cách OSMD đánh số bè/quãng tám.
 * Nốt hoa mỹ (grace) ghép riêng thành nhóm "g" ở cùng thời điểm với nốt chính theo ĐÚNG thứ tự trong bản nhạc (không
 * sắp theo cao độ, vì thứ tự các nốt hoa mỹ liên tiếp có ý nghĩa). Nhóm có số lượng khác nhau bị bỏ qua và ghi vào
 * `problems`.
 */
export function bindNoteIds(osmd: OpenSheetMusicDisplay, doc: ScoreDocument, host: HTMLElement): BindReport {
  // Xóa gắn kết cũ (sau render SVG thường đã mới, nhưng chắc chắn không sót)
  host.querySelectorAll(`[${NOTE_ID_ATTR}], [${HEAD_ID_ATTR}]`).forEach((el) => {
    el.removeAttribute(NOTE_ID_ATTR);
    el.removeAttribute(NOTE_IDS_ATTR);
    el.removeAttribute(HEAD_ID_ATTR);
    el.classList.remove(SELECTED_CLASS);
  });

  const report: BindReport = { domNotes: doc.notes.length, bound: 0, problems: [] };
  const measureList = osmd.GraphicSheet?.MeasureList ?? [];

  // Gom nốt DOM theo (part, ô, khuông, thời điểm, loại); dấu lặng ẩn (print-object="no", lấp chỗ trong bè thứ hai)
  // không vẽ nên không ghép
  const domGroups = new Map<string, NoteInfo[]>();
  for (const info of doc.notes) {
    if (info.element.getAttribute('print-object') === 'no') continue;
    const kind = info.isGrace ? 'g' : info.isRest ? 'r' : 'n';
    const key = [info.partIndex, info.measureIndex, info.staff, info.onsetKey, kind].join('|');
    const list = domGroups.get(key) ?? [];
    list.push(info);
    domGroups.set(key, list);
  }

  // Gom nốt OSMD theo cùng khóa
  const osmdGroups = new Map<string, OsmdNote[]>();
  const partOfStaff = (globalStaff: number): { part: number; staff: number } | null => {
    let rest = globalStaff;
    for (let part = 0; part < 64; part++) {
      const count = doc.staffCountOfPart(part);
      if (count === 0) return null;
      if (rest < count) return { part, staff: rest + 1 };
      rest -= count;
    }
    return null;
  };

  measureList.forEach((staves, measureIndex) => {
    staves.forEach((measure, globalStaff) => {
      const where = partOfStaff(globalStaff);
      if (!where || !measure) return;
      for (const staffEntry of measure.staffEntries) {
        const onsetKey = toOnsetKey(staffEntry.relInMeasureTimestamp?.RealValue ?? 0);
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          const voiceId = voiceEntry.parentVoiceEntry?.ParentVoice?.VoiceId ?? 0;
          for (const note of voiceEntry.notes) {
            const source = note.sourceNote;
            if (!source || (source as { PrintObject?: boolean }).PrintObject === false) continue;
            const isRest = source.isRest();
            const kind = source.IsGraceNote ? 'g' : isRest ? 'r' : 'n';
            const key = [where.part, measureIndex, where.staff, onsetKey, kind].join('|');
            const list = osmdGroups.get(key) ?? [];
            list.push({
              svg: (note as unknown as SvgNote).getSVGGElement?.(),
              voiceId,
              halfTone: isRest ? 0 : (source.Pitch?.getHalfTone() ?? 0),
            });
            osmdGroups.set(key, list);
          }
        }
      }
    });
  });

  // Ghép từng nhóm; mỗi phần tử SVG gom id của mọi nốt thuộc nó (hợp âm)
  const idsBySvg = new Map<SVGGElement, string[]>();
  for (const [key, domList] of domGroups) {
    const osmdList = osmdGroups.get(key);
    if (!osmdList || osmdList.length !== domList.length) {
      report.problems.push(`Group ${key}: DOM ${domList.length} notes, OSMD ${osmdList?.length ?? 0} notes`);
      continue;
    }
    const isGraceGroup = key.endsWith('|g');
    const domSorted = isGraceGroup
      ? domList
      : [...domList].sort((a, b) => a.voice - b.voice || (a.midi ?? 0) - (b.midi ?? 0));
    const osmdSorted = isGraceGroup
      ? osmdList
      : [...osmdList].sort((a, b) => a.voiceId - b.voiceId || a.halfTone - b.halfTone);
    domSorted.forEach((info, i) => {
      const svg = osmdSorted[i].svg;
      if (!svg) {
        report.problems.push(`Note ${info.id}: OSMD gave no SVG element`);
        return;
      }
      const ids = idsBySvg.get(svg) ?? [];
      ids.push(info.id);
      idsBySvg.set(svg, ids);
      report.bound += 1;
    });
  }
  for (const [svg, ids] of idsBySvg) {
    ids.sort();
    svg.setAttribute(NOTE_ID_ATTR, ids[0]);
    svg.setAttribute(NOTE_IDS_ATTR, ids.join(' '));
    if (ids.length > 1) bindHeads(svg, ids, doc);
  }
  return report;
}

/** Các nhóm đầu nốt của chính nốt `svg` (bỏ đầu nốt của nốt hoa mỹ lồng bên trong). */
const ownHeads = (svg: SVGGElement): SVGGElement[] => {
  // Cách OSMD dùng (getNoteheadSVGs): các nhóm .vf-notehead là con trực tiếp của nhóm .vf-note
  const vfNote = Array.from(svg.children).find((c) => c.classList.contains('vf-note'));
  if (vfNote) {
    const direct = Array.from(vfNote.children).filter((c): c is SVGGElement => c.classList.contains('vf-notehead'));
    if (direct.length > 0) return direct;
  }
  return Array.from(svg.querySelectorAll<SVGGElement>('.vf-notehead')).filter((head) => {
    let p: Element | null = head.parentElement;
    while (p && p !== svg) {
      if (p.classList.contains('vf-stavenote') || p.classList.contains('vf-gracenotegroup')) return false;
      p = p.parentElement;
    }
    return p === svg;
  });
};

/**
 * Gắn id cho từng đầu nốt của hợp âm: đầu nốt càng thấp trên khuông thì cao độ càng thấp, nên ghép theo thứ tự toạ độ y
 * (từ dưới lên) với thứ tự cao độ (từ thấp lên). Số đầu nốt khác số nốt thì bỏ qua (cả hợp âm vẫn chọn được như cũ).
 */
function bindHeads(svg: SVGGElement, ids: readonly string[], doc: ScoreDocument): void {
  try {
    const heads = ownHeads(svg);
    if (heads.length !== ids.length) return;
    const centerY = (el: SVGGElement) => {
      const box = el.getBBox();
      return box.y + box.height / 2;
    };
    const byY = heads.map((el) => ({ el, y: centerY(el) })).sort((a, b) => b.y - a.y);
    const byPitch = [...ids].sort(
      (a, b) => (doc.getInfo(a)?.midi ?? 0) - (doc.getInfo(b)?.midi ?? 0) || a.localeCompare(b),
    );
    byY.forEach(({ el }, i) => el.setAttribute(HEAD_ID_ATTR, byPitch[i]));
  } catch {
    // SVG chưa đo được: chỉ mất khả năng chọn riêng từng nốt trong hợp âm
  }
}

/**
 * Các id nốt của nhóm SVG gần nhất với đích của sự kiện; mảng rỗng nếu bấm ra ngoài nốt. Bấm trúng một đầu nốt của hợp
 * âm thì chỉ trả về id của nốt đó.
 */
export function noteIdsFromEvent(event: Event): string[] {
  const target = event.target;
  if (!(target instanceof Element)) return [];
  const head = target.closest(`[${HEAD_ID_ATTR}]`)?.getAttribute(HEAD_ID_ATTR);
  if (head) return [head];
  const group = target.closest(`[${NOTE_ID_ATTR}]`);
  const raw = group?.getAttribute(NOTE_IDS_ATTR) ?? group?.getAttribute(NOTE_ID_ATTR) ?? '';
  return raw ? raw.split(' ') : [];
}

/**
 * Tô vùng chọn bằng class CSS, không vẽ lại bản nhạc. Hợp âm đã gắn id từng đầu nốt: chọn đủ cả hợp âm thì tô cả nhóm,
 * chọn một phần thì chỉ tô các đầu nốt được chọn. Nhóm khác: tô khi có ít nhất một id đang chọn.
 */
export function applySelection(host: HTMLElement, selected: ReadonlySet<string>): void {
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const ids = (el.getAttribute(NOTE_IDS_ATTR) ?? el.getAttribute(NOTE_ID_ATTR) ?? '').split(' ');
    const heads = Array.from(el.querySelectorAll(`[${HEAD_ID_ATTR}]`));
    const all = ids.every((id) => selected.has(id));
    el.classList.toggle(SELECTED_CLASS, heads.length > 0 ? all : ids.some((id) => selected.has(id)));
    for (const head of heads) {
      head.classList.toggle(SELECTED_CLASS, !all && selected.has(head.getAttribute(HEAD_ID_ATTR) ?? ''));
    }
  });
}

// ---------------------------------------------------------------------------------------------- nốt nhỏ trong hợp âm

/** Nốt OSMD được ghi là nốt nhỏ nhưng nằm trong hợp âm có nốt to (đã đổi sang vẽ thường, sẽ thu nhỏ riêng đầu nốt). */
const smallInChord = new WeakSet<object>();

interface LooseSourceNote {
  IsCueNote?: boolean;
}
interface LooseSheet {
  SourceMeasures?: {
    VerticalSourceStaffEntryContainers?: {
      StaffEntries?: ({ VoiceEntries?: { Notes?: LooseSourceNote[] }[] } | undefined)[];
    }[];
  }[];
}

/**
 * Gọi ngay sau `osmd.load()`: OSMD vẽ cả hợp âm theo cỡ của nốt đầu (nốt đầu nhỏ thì cả hợp âm nhỏ, nốt đầu to thì nốt
 * nhỏ cũng to). Hợp âm vừa có nốt to vừa có nốt nhỏ (bè chính to, nốt bè nhỏ) được đổi sang vẽ cỡ thường; các nốt nhỏ
 * được ghi lại để {@link drawSmallHeads} thu nhỏ riêng đầu nốt sau khi vẽ.
 */
export function prepareSmallNotes(osmd: OpenSheetMusicDisplay): void {
  try {
    const sheet = osmd.Sheet as unknown as LooseSheet | undefined;
    for (const measure of sheet?.SourceMeasures ?? []) {
      for (const container of measure.VerticalSourceStaffEntryContainers ?? []) {
        for (const entry of container.StaffEntries ?? []) {
          for (const voiceEntry of entry?.VoiceEntries ?? []) {
            const notes = voiceEntry.Notes ?? [];
            const small = notes.filter((n) => n.IsCueNote);
            if (small.length === 0 || small.length === notes.length) continue;
            for (const n of notes) {
              if (n.IsCueNote) smallInChord.add(n);
              n.IsCueNote = false;
            }
          }
        }
      }
    }
  } catch {
    // cấu trúc OSMD khác dự kiến: hợp âm vẽ theo cỡ nốt đầu như trước
  }
}

/** Tỉ lệ thu nhỏ đầu nốt bè (gần bằng cỡ nốt nhỏ của OSMD/MuseScore). */
const SMALL_HEAD_SCALE = 0.7;

/**
 * Gọi sau mỗi lần `osmd.render()`: thu nhỏ đầu nốt của các nốt nhỏ trong hợp âm có nốt to (xem {@link prepareSmallNotes}),
 * giữ mép sát thân nốt để đầu nốt vẫn dính thân. Đầu nốt ghép với nốt theo cao độ (đầu nốt thấp nhất là nốt thấp nhất).
 */
export function drawSmallHeads(osmd: OpenSheetMusicDisplay): void {
  try {
    shrinkAll(osmd);
  } catch {
    // cấu trúc OSMD khác dự kiến: nốt bè vẽ cỡ thường, bản nhạc vẫn xem được
  }
}

function shrinkAll(osmd: OpenSheetMusicDisplay): void {
  const measureList = osmd.GraphicSheet?.MeasureList ?? [];
  for (const staves of measureList) {
    for (const measure of staves ?? []) {
      for (const staffEntry of measure?.staffEntries ?? []) {
        for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
          const notes = voiceEntry.notes.filter((n) => n.sourceNote && !n.sourceNote.isRest());
          if (!notes.some((n) => smallInChord.has(n.sourceNote))) continue;
          const svg = (notes[0] as unknown as SvgNote).getSVGGElement?.();
          if (!svg) continue;
          try {
            shrinkHeads(
              svg,
              notes.map((n) => ({
                small: smallInChord.has(n.sourceNote),
                halfTone: n.sourceNote.Pitch?.getHalfTone() ?? 0,
              })),
            );
          } catch {
            // SVG chưa đo được: nốt bè vẽ cỡ thường
          }
        }
      }
    }
  }
}

function shrinkHeads(svg: SVGGElement, notes: { small: boolean; halfTone: number }[]): void {
  const heads = ownHeads(svg);
  if (heads.length !== notes.length) return;
  const byY = heads.map((el) => ({ el, box: el.getBBox() })).sort((a, b) => b.box.y - a.box.y);
  const byPitch = [...notes].sort((a, b) => a.halfTone - b.halfTone);
  const stem = svg.querySelector<SVGGraphicsElement>('.vf-stem');
  const stemBox = stem?.getBBox();
  const stemX = stemBox ? stemBox.x + stemBox.width / 2 : null;
  byY.forEach(({ el, box }, i) => {
    if (!byPitch[i].small || el.dataset.small === '1') return;
    const center = box.x + box.width / 2;
    // Thu nhỏ quanh mép gần thân nốt (đầu nốt bên trái thân: mép phải; bên phải thân: mép trái)
    const anchorX = stemX === null ? center : center < stemX ? box.x + box.width : box.x;
    const anchorY = box.y + box.height / 2;
    const scale = `translate(${anchorX} ${anchorY}) scale(${SMALL_HEAD_SCALE}) translate(${-anchorX} ${-anchorY})`;
    const current = el.getAttribute('transform');
    el.setAttribute('transform', current ? `${current} ${scale}` : scale);
    el.dataset.small = '1';
  });
}
