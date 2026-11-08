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
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    el.removeAttribute(NOTE_ID_ATTR);
    el.removeAttribute(NOTE_IDS_ATTR);
    el.classList.remove(SELECTED_CLASS);
  });

  const report: BindReport = { domNotes: doc.notes.length, bound: 0, problems: [] };
  const measureList = osmd.GraphicSheet?.MeasureList ?? [];

  // Gom nốt DOM theo (part, ô, khuông, thời điểm, loại)
  const domGroups = new Map<string, NoteInfo[]>();
  for (const info of doc.notes) {
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
            if (!source) continue;
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
      report.problems.push(`Nhóm ${key}: DOM ${domList.length} nốt, OSMD ${osmdList?.length ?? 0} nốt`);
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
        report.problems.push(`Nốt ${info.id}: OSMD không cho phần tử SVG`);
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
  }
  return report;
}

/** Các id nốt của nhóm SVG gần nhất với đích của sự kiện; mảng rỗng nếu bấm ra ngoài nốt. */
export function noteIdsFromEvent(event: Event): string[] {
  const target = event.target;
  if (!(target instanceof Element)) return [];
  const group = target.closest(`[${NOTE_ID_ATTR}]`);
  const raw = group?.getAttribute(NOTE_IDS_ATTR) ?? group?.getAttribute(NOTE_ID_ATTR) ?? '';
  return raw ? raw.split(' ') : [];
}

/** Tô các nhóm SVG có chứa ít nhất một id đang chọn bằng class CSS, không vẽ lại bản nhạc. */
export function applySelection(host: HTMLElement, selected: ReadonlySet<string>): void {
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const ids = (el.getAttribute(NOTE_IDS_ATTR) ?? el.getAttribute(NOTE_ID_ATTR) ?? '').split(' ');
    el.classList.toggle(
      SELECTED_CLASS,
      ids.some((id) => selected.has(id)),
    );
  });
}
