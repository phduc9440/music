import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  NOTE_ID_ATTR,
  NOTE_IDS_ATTR,
  SELECTED_CLASS,
  applySelection,
  bindNoteIds,
  noteIdsFromEvent,
} from '../../editor/core/osmdBridge';
import { DURATION_QUARTERS } from '../../editor/notes/durations';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../../editor/notes/durations';
import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import { DURATION_DRAG_TYPE, ledgerLines, locateSpot, solfegeName, spotTarget } from '../../editor/core/staffHit';
import type { StaffSpot } from '../../editor/core/staffHit';
import { t } from '../../../i18n/core';
import { ZOOM_MAX, ZOOM_MIN, clampZoom } from '../../../utils/viewer';
import type { ViewMode } from '../../../utils/viewer';
import { applyHeaderStyle, readHeader } from '../../editor/structure/header';
import type { HeaderField, HeaderState, TextStyle } from '../../editor/structure/header';
import { readTempo } from '../../editor/structure/tempo';
import type { TempoInfo } from '../../editor/structure/tempo';
import { applyMutedTracks, applyPlaying, keepMeasureVisible, measureOfEvent } from '../../player/engine/highlight';
import NoteInsertPopover from '../toolbar/NoteInsertPopover';
import TextEditPopover from '../toolbar/TextEditPopover';
import type { TextKind } from '../toolbar/TextEditPopover';
import '../../editor/editor.css';
import '../../editor/live/live.css';

interface Props {
  /** Nội dung MusicXML (dùng khi chưa có `doc`, tức là chỉ xem). */
  xml: string;
  /** Mức thu phóng (%), 50–200. */
  zoom: number;
  mode: ViewMode;
  /** Người dùng đổi zoom bằng Ctrl+cuộn hoặc chụm hai ngón. */
  onZoomChange: (zoom: number) => void;
  /** Vẽ xong: số trang giấy (chế độ "page"), 1 với chế độ cuộn ngang. */
  onRendered: (pageCount: number) => void;
  /** Trang đang nằm giữa màn hình (bắt đầu từ 1), hoặc phần trăm cuộn ở chế độ cuộn ngang. */
  onProgress: (value: number) => void;
  /** Không đọc hoặc không vẽ được MusicXML. */
  onError: () => void;
  /** Tài liệu đang chỉnh sửa; có thì bản nhạc được nạp từ đây và vẽ lại mỗi khi `revision` đổi. */
  doc?: ScoreDocument | null;
  /** Tăng sau mỗi thay đổi nội dung của `doc`. */
  revision?: number;
  /** Id các nốt đang chọn (tô bằng class CSS, không vẽ lại cả bản nhạc). */
  selected?: ReadonlySet<string>;
  /** Chỉ số (từ 0) các ô nhịp sai độ dài, tô đỏ. */
  issueMeasures?: ReadonlySet<number>;
  /** Các ô nhịp đang bị người khác giữ khóa (đồng chỉnh sửa): viền màu và tên người đang sửa. */
  lockBoxes?: readonly LockBox[];
  /** Cuộn tới một ô nhịp; `key` đổi để yêu cầu lại cùng một ô. */
  focusMeasure?: { index: number; key: number } | null;
  /** Bấm vào nốt (ids rỗng = bấm ra ngoài); additive = giữ Shift. Có prop này thì canvas cho chọn nốt. */
  onSelectNotes?: (ids: string[], additive: boolean) => void;
  /** Kéo nốt bằng chuột/bút lên hoặc xuống `steps` bậc (dương = lên). Chạm không kéo nốt để khỏi lẫn với cuộn. */
  onDragPitch?: (ids: string[], steps: number) => void;
  /** Đang ở chế độ Nhập nốt: rê chuột hiện nốt mờ, bấm vào khuông mở khung thêm nốt. */
  inputMode?: boolean;
  /** Trường độ đang chọn, dùng làm mặc định cho khung thêm nốt. */
  inputDuration?: DurationChoice;
  /** Sửa tiêu đề / tác giả: chữ trên đầu bản nhạc trở thành bấm để sửa. */
  onEditHeader?: (field: HeaderField, text: string, style: TextStyle) => boolean;
  /** Sửa chỉ số nhịp (tempo) hiện ở đầu bản nhạc. */
  onEditTempo?: (info: TempoInfo) => boolean;
  /** Xác nhận ô nhịp sai độ dài là đúng (hiện dấu ✓ khi rê chuột vào mép trên viền đỏ). */
  onConfirmMeasure?: (measureIndex: number) => void;
  /** Id các nốt đang vang khi phát (tô bằng class CSS, không vẽ lại). */
  playing?: ReadonlySet<string>;
  /** Id track ("part:khuông") đang tắt tiếng: nốt của khuông đó được làm mờ. */
  mutedStaves?: ReadonlySet<string>;
  /** Ô nhịp (từ 0) cần giữ trong khung nhìn khi phát; null = không tự cuộn. */
  followMeasure?: number | null;
  /** Bấm vào một nốt khi không có `onSelectNotes` (trang phát): trả về ô nhịp của nốt đó (từ 0). */
  onMeasureClick?: (measureIndex: number, additive: boolean) => void;
  /** Số nửa cung chuyển giọng khi VẼ bản nhạc (trang phát). 0 = giọng gốc. Editor không dùng để khỏi nhầm khi đang sửa nốt. */
  transpose?: number;
  /** Đảo màu bản nhạc (nền tối, nốt sáng). */
  inverted?: boolean;
  /** Đoạn A-B cần tô khung (chỉ số ô từ 0); null = không tô. Nên giữ nguyên tham chiếu giữa các lần vẽ. */
  loopRange?: LoopRange | null;
  /** Shift + kéo qua các ô nhịp (khi không có `onSelectNotes`): trả về ô đầu và ô cuối (từ 0, đầu ≤ cuối). */
  onMeasureRange?: (startMeasure: number, endMeasure: number) => void;
  /** Các đoạn ô nhịp có góp ý đang mở (mục 4.2): tô nền nhạt, bong bóng số lượng ở ô cuối mỗi đoạn. */
  commentRanges?: readonly CommentRange[];
  /** Bấm bong bóng góp ý: trả về id các góp ý kết thúc ở ô đó. */
  onCommentBubble?: (ids: string[]) => void;
  /** Thêm nốt tại vị trí trên khuông (bấm hoặc kéo-thả); trả về true nếu thêm được. Có prop này thì canvas nhận kéo-thả. */
  onInsertNote?: (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice) => boolean;
}

/** Đoạn A-B tô trên bản nhạc: chỉ số ô từ 0 (gồm cả hai đầu); `active` = đang bật lặp. */
/** Một đoạn có góp ý: chỉ số ô từ 0, gồm cả hai đầu. `active`: góp ý đang được chọn ở bảng Góp ý (tô đậm hơn). */
export interface CommentRange {
  id: string;
  start: number;
  end: number;
  active?: boolean;
}

export interface LoopRange {
  start: number;
  end: number;
  active: boolean;
}

/** Cử chỉ chuột/bút đang diễn ra: kéo khung chọn vùng, hoặc kéo một nốt, hoặc Shift + kéo qua các ô nhịp. */
type Gesture =
  | { kind: 'band'; x0: number; y0: number; moved: boolean }
  | { kind: 'measures'; x0: number; y0: number; from: number | null; to: number | null; moved: boolean }
  | { kind: 'note'; ids: string[]; el: SVGGElement; y0: number; moved: boolean; steps: number };

/** Chờ sau lần đổi zoom/kích thước cuối cùng rồi mới vẽ lại (ms). */
/** Đọc màu từ biến CSS lúc vẽ (OSMD cần chuỗi màu, không dùng được var()). Không có biến thì dùng `fallback`. */
const readCssColor = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const RENDER_DEBOUNCE_MS = 200;
/** Gộp các thao tác sửa liên tiếp (ví dụ giữ phím ↑) thành một lần vẽ (ms). */
const EDIT_REDRAW_MS = 150;

/**
 * OSMD mặc định bỏ qua chỗ xuống dòng / sang trang ghi trong XML (`<print new-system|new-page="yes">`) và tự chia dòng.
 * Chỉ bật khi bản nhạc có ghi ngắt (do người dùng đặt trong trình soạn, hoặc file gốc có sẵn); bản không có thì giữ
 * cách chia dòng tự động như cũ.
 */
const breakOptions = (xml: string): { newSystemFromXML: boolean; newPageFromXML: boolean } => {
  const on = /<print\b[^>]*\bnew-(?:system|page)="yes"/.test(xml);
  return { newSystemFromXML: on, newPageFromXML: on };
};
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_NUMBERS: ReadonlySet<number> = new Set();

const MEASURE_OF_ID = /^(?:p\d+-)?m(\d+)-/;
const ISSUE_BOX_CLASS = 'ed-issue-box';
const LOCK_BOX_CLASS = 'ed-lock-box';
const EMPTY_LOCKS: readonly LockBox[] = [];
const LOOP_BOX_CLASS = 'pl-loop-box';
const LOOP_PAD_X = 6;
const LOOP_PAD_Y = 18;
/** Quãng kéo tối thiểu (px) để coi là kéo chứ không phải bấm. */
const DRAG_THRESHOLD = 5;
/** Khoảng đệm quanh các nốt của ô nhịp sai khi vẽ viền (px). */
const ISSUE_PAD_X = 10;
const ISSUE_PAD_Y = 22;

const TEXT_HOT_CLASS = 'ed-text-hot';
const COMMENT_BOX_CLASS = 'ed-comment-box';
const COMMENT_BUBBLE_CLASS = 'ed-comment-bubble';
const EMPTY_COMMENTS: readonly CommentRange[] = [];

/**
 * Phủ vùng bấm lên các chữ đầu bản nhạc (tiêu đề, tác giả, tempo) để mở khung sửa. Tìm chữ trong SVG theo nội dung
 * đã biết từ MusicXML nên không phụ thuộc cấu trúc bên trong OSMD.
 */
const drawTextHotspots = (
  host: HTMLElement,
  doc: ScoreDocument,
  onOpen: (kind: TextKind, rect: DOMRect) => void,
): void => {
  host.querySelectorAll(`.${TEXT_HOT_CLASS}`).forEach((el) => el.remove());
  const header = readHeader(doc);
  const tempo = readTempo(doc);
  const origin = host.getBoundingClientRect();
  const texts = Array.from(host.querySelectorAll('svg text'));
  const used = new Set<Element>();
  const add = (kind: TextKind, match: (text: string) => boolean, padLeft = 0) => {
    const el = texts.find((t) => !used.has(t) && match((t.textContent ?? '').trim()));
    if (!el) return;
    used.add(el);
    const rect = el.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = TEXT_HOT_CLASS;
    div.title = t('viewer.canvas.clickToEdit');
    div.style.left = `${rect.left - origin.left - 6 - padLeft}px`;
    div.style.top = `${rect.top - origin.top - 4}px`;
    div.style.width = `${rect.width + 12 + padLeft}px`;
    div.style.height = `${rect.height + 8}px`;
    div.addEventListener('pointerdown', (e) => e.stopPropagation());
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpen(kind, div.getBoundingClientRect());
    });
    host.appendChild(div);
  };
  if (header.title) add('title', (t) => t === header.title);
  if (header.composer) add('composer', (t) => t === header.composer);
  if (tempo) {
    add('tempo', (t) => /^=\s*[\d.]+/.test(t), 36); // chừa chỗ cho ký hiệu nốt bên trái dấu "="
    if (tempo.words) add('tempo', (t) => t === tempo.words);
  }
};

interface MeasureBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Vùng chiếm (toạ độ màn hình) của từng ô nhịp thỏa `accept`, tính từ các nốt đã gắn id trong ô đó. */
const collectMeasureBoxes = (host: HTMLElement, accept: (measureIndex: number) => boolean): Map<number, MeasureBox> => {
  const boxes = new Map<number, MeasureBox>();
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const match = MEASURE_OF_ID.exec(el.getAttribute(NOTE_ID_ATTR) ?? '');
    if (!match || !accept(Number(match[1]))) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const key = Number(match[1]);
    const box = boxes.get(key);
    if (!box) boxes.set(key, { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom });
    else {
      box.l = Math.min(box.l, rect.left);
      box.t = Math.min(box.t, rect.top);
      box.r = Math.max(box.r, rect.right);
      box.b = Math.max(box.b, rect.bottom);
    }
  });
  return boxes;
};

/** Khung quanh các ô nhịp trong đoạn A-B (chỉ số ô từ 0, gồm cả hai đầu). */
const drawLoopBoxes = (host: HTMLElement, range: LoopRange | null): void => {
  host.querySelectorAll(`.${LOOP_BOX_CLASS}`).forEach((el) => el.remove());
  if (!range) return;
  const origin = host.getBoundingClientRect();
  for (const box of collectMeasureBoxes(host, (i) => i >= range.start && i <= range.end).values()) {
    const div = document.createElement('div');
    div.className = range.active ? LOOP_BOX_CLASS : `${LOOP_BOX_CLASS} ${LOOP_BOX_CLASS}--off`;
    div.style.left = `${box.l - origin.left - LOOP_PAD_X}px`;
    div.style.top = `${box.t - origin.top - LOOP_PAD_Y}px`;
    div.style.width = `${box.r - box.l + LOOP_PAD_X * 2}px`;
    div.style.height = `${box.b - box.t + LOOP_PAD_Y * 2}px`;
    host.appendChild(div);
  }
};

/** Viền một ô nhịp đang bị người khác khóa. */
export interface LockBox {
  measureIndex: number;
  /** Tên người đang giữ khóa. */
  label: string;
  /** Màu của người đó (0..7, khớp `--ui-live-N`). */
  colorIndex: number;
}

/** Vẽ viền màu quanh các ô nhịp mà người khác đang sửa, kèm nhãn tên ở góc trên. Không bắt sự kiện chuột. */
const drawLockBoxes = (host: HTMLElement, locks: readonly LockBox[]): void => {
  host.querySelectorAll(`.${LOCK_BOX_CLASS}`).forEach((el) => el.remove());
  if (locks.length === 0) return;
  const byMeasure = new Map(locks.map((l) => [l.measureIndex, l]));
  const origin = host.getBoundingClientRect();
  for (const [measureIndex, box] of collectMeasureBoxes(host, (i) => byMeasure.has(i))) {
    const lock = byMeasure.get(measureIndex);
    if (!lock) continue;
    const div = document.createElement('div');
    div.className = LOCK_BOX_CLASS;
    div.dataset.color = String(lock.colorIndex);
    div.dataset.label = lock.label;
    div.style.left = `${box.l - origin.left - ISSUE_PAD_X}px`;
    div.style.top = `${box.t - origin.top - ISSUE_PAD_Y}px`;
    div.style.width = `${box.r - box.l + ISSUE_PAD_X * 2}px`;
    div.style.height = `${box.b - box.t + ISSUE_PAD_Y * 2}px`;
    host.appendChild(div);
  }
};

/** Chỉ số ô nhịp (từ 0) của nốt nằm dưới điểm màn hình, hoặc null. Dùng khi đang giữ con trỏ (sự kiện không trỏ vào nốt). */
const measureAtPoint = (x: number, y: number): number | null => {
  const id = document.elementFromPoint(x, y)?.closest(`[${NOTE_ID_ATTR}]`)?.getAttribute(NOTE_ID_ATTR);
  const match = id ? MEASURE_OF_ID.exec(id) : null;
  return match ? Number(match[1]) : null;
};

/** Vẽ viền đỏ quanh các ô nhịp sai độ dài, tính từ vùng chiếm của các nốt đã gắn id trong ô đó. */
const drawIssueBoxes = (
  host: HTMLElement,
  measures: ReadonlySet<number>,
  onConfirm?: (measureIndex: number) => void,
): void => {
  host.querySelectorAll(`.${ISSUE_BOX_CLASS}`).forEach((el) => el.remove());
  if (measures.size === 0) return;
  const origin = host.getBoundingClientRect();
  const boxes = collectMeasureBoxes(host, (i) => measures.has(i));
  for (const [measureIndex, box] of boxes) {
    const div = document.createElement('div');
    div.className = ISSUE_BOX_CLASS;
    div.style.left = `${box.l - origin.left - ISSUE_PAD_X}px`;
    div.style.top = `${box.t - origin.top - ISSUE_PAD_Y}px`;
    div.style.width = `${box.r - box.l + ISSUE_PAD_X * 2}px`;
    div.style.height = `${box.b - box.t + ISSUE_PAD_Y * 2}px`;
    if (onConfirm) {
      // Dải sát mép trên của viền: rê chuột hoặc chạm vào thì hiện dấu ✓ để xác nhận ô nhịp này đúng
      const hot = document.createElement('div');
      hot.className = 'ed-issue-hot';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'ed-issue-ok';
      ok.textContent = '✓';
      ok.title = t('viewer.canvas.measureOkTitle');
      ok.setAttribute('aria-label', t('viewer.canvas.measureOkLabel', { n: measureIndex + 1 }));
      hot.appendChild(ok);
      // Không để cử chỉ chọn vùng / bỏ chọn của khung nhạc bắt sự kiện này
      hot.addEventListener('pointerdown', (e) => e.stopPropagation());
      hot.addEventListener('click', (e) => {
        e.stopPropagation();
        hot.classList.toggle('is-open');
      });
      ok.addEventListener('click', () => onConfirm(measureIndex));
      div.appendChild(hot);
    }
    host.appendChild(div);
  }
};

/**
 * Tô nền các ô nhịp có góp ý (mục 4.2) và đặt bong bóng số lượng ở góc trên bên phải ô cuối của mỗi đoạn (các góp ý cùng
 * kết thúc ở một ô gộp chung một bong bóng). Nền không bắt sự kiện nên vẫn bấm chọn nốt bình thường.
 */
const drawCommentBoxes = (
  host: HTMLElement,
  ranges: readonly CommentRange[],
  onBubble?: (ids: string[]) => void,
): void => {
  host.querySelectorAll(`.${COMMENT_BOX_CLASS}, .${COMMENT_BUBBLE_CLASS}`).forEach((el) => el.remove());
  if (ranges.length === 0) return;
  const covered = new Map<number, boolean>(); // ô → có góp ý đang chọn phủ lên không
  for (const r of ranges) {
    for (let i = r.start; i <= r.end; i++) covered.set(i, (covered.get(i) ?? false) || !!r.active);
  }
  const origin = host.getBoundingClientRect();
  const boxes = collectMeasureBoxes(host, (i) => covered.has(i));
  for (const [measureIndex, box] of boxes) {
    const div = document.createElement('div');
    div.className = covered.get(measureIndex) ? `${COMMENT_BOX_CLASS} is-active` : COMMENT_BOX_CLASS;
    div.style.left = `${box.l - origin.left - LOOP_PAD_X}px`;
    div.style.top = `${box.t - origin.top - LOOP_PAD_Y}px`;
    div.style.width = `${box.r - box.l + LOOP_PAD_X * 2}px`;
    div.style.height = `${box.b - box.t + LOOP_PAD_Y * 2}px`;
    host.appendChild(div);
  }
  const byEnd = new Map<number, string[]>();
  for (const r of ranges) byEnd.set(r.end, [...(byEnd.get(r.end) ?? []), r.id]);
  for (const [end, ids] of byEnd) {
    const box = boxes.get(end);
    if (!box) continue;
    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = COMMENT_BUBBLE_CLASS;
    bubble.textContent = String(ids.length);
    bubble.title = t('scores.comments.bubbleTitle', { count: ids.length, measure: end + 1 });
    bubble.setAttribute('aria-label', bubble.title);
    bubble.style.left = `${box.r - origin.left + LOOP_PAD_X - 10}px`;
    bubble.style.top = `${box.t - origin.top - LOOP_PAD_Y - 10}px`;
    // Không để cử chỉ chọn vùng / bỏ chọn của khung nhạc bắt sự kiện này
    bubble.addEventListener('pointerdown', (e) => e.stopPropagation());
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      onBubble?.(ids);
    });
    host.appendChild(bubble);
  }
};

/**
 * Đưa bản nhạc của OSMD về `semitones` nửa cung (so với giọng viết trong file). Chỉ dựng lại đồ họa khi giá trị đổi; `load()`
 * tạo bản nhạc mới ở giọng gốc nên sau mỗi lần nạp phải gọi lại.
 */
const syncTranspose = (osmd: OpenSheetMusicDisplay, semitones: number): void => {
  const sheet = osmd.Sheet;
  if (!sheet || sheet.Transpose === semitones) return;
  sheet.Transpose = semitones;
  osmd.updateGraphic();
};

/** Chiều cao ước lượng của khung thêm nốt (px), để quyết định mở lên hay xuống. */
const POPOVER_HEIGHT = 190;

/** Nốt mờ ở chỗ sẽ thêm nốt: đầu nốt, dòng kẻ phụ và tên nốt. */
function NoteGhost({ spot }: { spot: StaffSpot }) {
  const w = spot.halfStep * 2.6;
  const h = spot.halfStep * 2;
  return (
    <div className="ed-ghost" style={{ left: spot.x, top: spot.y }}>
      {ledgerLines(spot.line).map((k) => (
        <span
          key={k}
          className="ed-ghost__ledger"
          style={{ left: -w, width: w * 2, top: (k - spot.line) * spot.halfStep }}
        />
      ))}
      <span className="ed-ghost__head" style={{ left: -w / 2, top: -h / 2, width: w, height: h }} />
      <span className="ed-ghost__label" style={{ left: w, top: -h * 1.6 }}>
        {solfegeName(spot.step, spot.octave)}
      </span>
    </div>
  );
}

/**
 * Vùng vẽ bản nhạc bằng OpenSheetMusicDisplay (font nhạc Bravura có sẵn trong thư viện).
 * Giữ một đối tượng OSMD cho mỗi MusicXML; đổi zoom hoặc chế độ chỉ vẽ lại, không nạp lại XML.
 * Khi có `doc` (chế độ sửa), mỗi lần `revision` đổi thì nạp lại XML từ `doc`, vẽ lại và giữ nguyên vị trí cuộn.
 * Hỗ trợ Ctrl+cuộn chuột và chụm hai ngón để thu phóng.
 */
export default function ScoreCanvas({
  xml,
  zoom,
  mode,
  onZoomChange,
  onRendered,
  onProgress,
  onError,
  doc = null,
  revision = 0,
  selected = EMPTY_SET,
  issueMeasures = EMPTY_NUMBERS,
  lockBoxes = EMPTY_LOCKS,
  focusMeasure = null,
  playing = EMPTY_SET,
  mutedStaves = EMPTY_SET,
  followMeasure = null,
  onMeasureClick,
  loopRange = null,
  transpose = 0,
  inverted = false,
  onMeasureRange,
  commentRanges = EMPTY_COMMENTS,
  onCommentBubble,
  onSelectNotes,
  onDragPitch,
  inputMode = false,
  inputDuration,
  onInsertNote,
  onConfirmMeasure,
  onEditHeader,
  onEditTempo,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const hoverRef = useRef({ x: 0, y: 0, frame: 0 });
  // Nốt mờ báo chỗ sẽ thêm; khung chọn nốt (gắn với revision lúc mở để tự đóng khi bản nhạc đổi)
  const [ghost, setGhost] = useState<StaffSpot | null>(null);
  const [popover, setPopover] = useState<{ spot: StaffSpot; revision: number } | null>(null);
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** Đoạn ô nhịp đang được kéo chọn (Shift + kéo), để tô khung ngay khi kéo. */
  const [dragRange, setDragRange] = useState<{ start: number; end: number } | null>(null);
  // Revision của nội dung OSMD đang giữ, để biết khi nào cần nạp lại
  const loadedRevision = useRef(0);
  // loadId > 0: đã nạp xong MusicXML (tăng theo mỗi lần nạp); drawnKey: cấu hình đã vẽ xong gần nhất
  const [loadId, setLoadId] = useState(0);
  // Đổi theme (thuộc tính data-theme trên <html>) thì vẽ lại để OSMD lấy màu mới
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  const [drawnKey, setDrawnKey] = useState('');
  const wantedKey = loadId > 0 ? `${loadId}|${zoom}|${mode}|${transpose}` : '';
  const busy = wantedKey === '' || drawnKey !== wantedKey;

  const [textEdit, setTextEdit] = useState<{
    kind: TextKind;
    left: number;
    top: number;
    revision: number;
    header: HeaderState;
    tempo: TempoInfo | null;
  } | null>(null);
  /** Mở khung sửa chữ đầu bản nhạc ngay dưới vùng chữ được bấm. */
  const openText = onEditHeader
    ? (kind: TextKind, rect: DOMRect) => {
        const current = doc;
        if (!current) return;
        setTextEdit({
          kind,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)),
          top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 300)),
          revision,
          header: readHeader(current),
          tempo: readTempo(current),
        });
      }
    : undefined;

  // Giữ các giá trị mới nhất cho các callback sự kiện mà không phải đăng ký lại
  const latest = useRef({
    zoom,
    mode,
    onZoomChange,
    onRendered,
    onProgress,
    onError,
    doc,
    revision,
    selected,
    playing,
    mutedStaves,
    loopRange,
    transpose,
    issueMeasures,
    lockBoxes,
    onConfirmMeasure,
    openText,
    commentRanges,
    onCommentBubble,
  });
  useEffect(() => {
    latest.current = {
      zoom,
      mode,
      onZoomChange,
      onRendered,
      onProgress,
      onError,
      doc,
      revision,
      selected,
      playing,
      mutedStaves,
      loopRange,
      transpose,
      issueMeasures,
      lockBoxes,
      onConfirmMeasure,
      openText,
      commentRanges,
      onCommentBubble,
    };
  });

  /** Tính trang đang ở giữa vùng nhìn (hoặc % cuộn ngang) và báo lên trang cha. */
  const reportProgress = useCallback(() => {
    const scroller = scrollRef.current;
    const host = hostRef.current;
    if (!scroller || !host) return;
    if (latest.current.mode === 'scroll') {
      const max = scroller.scrollWidth - scroller.clientWidth;
      latest.current.onProgress(max > 0 ? Math.round((scroller.scrollLeft / max) * 100) : 0);
      return;
    }
    const box = scroller.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    const pages = Array.from(host.querySelectorAll('svg'));
    let current = 1;
    pages.forEach((svg, index) => {
      if (svg.getBoundingClientRect().top <= middle) current = index + 1;
    });
    latest.current.onProgress(current);
  }, []);

  /** Sau mỗi lần vẽ: gắn id nốt, tô vùng chọn và các ô nhịp sai. Không làm hỏng việc vẽ nếu ghép lỗi. */
  const decorate = useCallback((osmd: OpenSheetMusicDisplay) => {
    const host = hostRef.current;
    const current = latest.current.doc;
    if (!host || !current) return;
    try {
      bindNoteIds(osmd, current, host);
      applySelection(host, latest.current.selected);
      applyPlaying(host, latest.current.playing);
      applyMutedTracks(host, latest.current.mutedStaves);
      drawLoopBoxes(host, latest.current.loopRange);
      drawIssueBoxes(host, latest.current.issueMeasures, (i) => latest.current.onConfirmMeasure?.(i));
      drawCommentBoxes(host, latest.current.commentRanges, (ids) => latest.current.onCommentBubble?.(ids));
      drawLockBoxes(host, latest.current.lockBoxes);
      if (latest.current.openText) drawTextHotspots(host, current, (k, r) => latest.current.openText?.(k, r));
    } catch {
      // chỉ mất khả năng chọn nốt, bản nhạc vẫn xem được
    }
  }, []);

  // Nạp thư viện và MusicXML khi XML đổi
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    (async () => {
      try {
        const { OpenSheetMusicDisplay: Osmd, TransposeCalculator } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        const osmd = new Osmd(host, {
          autoResize: false, // tự vẽ lại bằng ResizeObserver
          backend: 'svg',
          drawTitle: true,
          drawSubtitle: true,
          drawComposer: true,
          drawPartNames: false,
        });
        osmd.TransposeCalculator = new TransposeCalculator(); // cần có thì `Sheet.Transpose` mới có tác dụng
        const source = latest.current.doc;
        loadedRevision.current = latest.current.revision;
        const text = source ? source.serialize() : xml;
        osmd.setOptions(breakOptions(text));
        await osmd.load(text);
        if (cancelled) return;
        osmdRef.current = osmd;
        setLoadId((n) => n + 1);
      } catch {
        if (!cancelled) latest.current.onError();
      }
    })();
    return () => {
      cancelled = true;
      setLoadId(0);
      try {
        osmdRef.current?.clear();
      } catch {
        // khung vẽ đang được gỡ
      }
      osmdRef.current = null;
      host.replaceChildren();
    };
  }, [xml]);

  // Vẽ (lại) khi đã nạp xong hoặc đổi zoom, chế độ, độ rộng khung
  useEffect(() => {
    const osmd = osmdRef.current;
    const scroller = scrollRef.current;
    if (loadId === 0 || !osmd || !scroller) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const draw = () => {
      if (cancelled) return;
      try {
        const horizontal = mode === 'scroll';
        const top = scroller.scrollTop;
        const left = scroller.scrollLeft;
        osmd.setOptions({
          renderSingleHorizontalStaffline: horizontal,
          pageFormat: horizontal ? 'Endless' : 'A4 P',
          pageBackgroundColor: readCssColor('--ui-paper', 'white'),
          defaultColorMusic: readCssColor('--ui-staff-ink', 'black'),
        });
        osmd.zoom = zoom / 100;
        if (latest.current.doc) applyHeaderStyle(osmd, readHeader(latest.current.doc));
        syncTranspose(osmd, transpose);
        osmd.render();
        decorate(osmd);
        // Vẽ lại làm khung co lại tạm thời nên trả về vị trí cuộn cũ (đổi zoom thì giữ tương đối)
        scroller.scrollTop = top;
        scroller.scrollLeft = left;
        const pages = horizontal ? 1 : Math.max(1, osmd.GraphicSheet?.MusicPages?.length ?? 1);
        latest.current.onRendered(pages);
        reportProgress();
        setDrawnKey(`${loadId}|${zoom}|${mode}|${transpose}`);
      } catch {
        latest.current.onError();
      }
    };

    timer = setTimeout(draw, RENDER_DEBOUNCE_MS);

    let lastWidth = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth) return;
      lastWidth = scroller.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(draw, RENDER_DEBOUNCE_MS);
    });
    observer.observe(scroller);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [loadId, zoom, mode, transpose, themeTick, reportProgress, decorate]);

  // Nội dung `doc` đổi (sửa, hoàn tác, khôi phục nháp): nạp lại XML, vẽ lại, giữ vị trí cuộn. Gộp trong 150ms.
  useEffect(() => {
    const osmd = osmdRef.current;
    const scroller = scrollRef.current;
    if (loadId === 0 || !osmd || !scroller || !doc || revision === loadedRevision.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const top = scroller.scrollTop;
      const left = scroller.scrollLeft;
      try {
        const text = doc.serialize();
        osmd.setOptions(breakOptions(text));
        await osmd.load(text);
        if (cancelled) return;
        applyHeaderStyle(osmd, readHeader(doc));
        syncTranspose(osmd, latest.current.transpose);
        osmd.render();
        loadedRevision.current = revision;
        decorate(osmd);
        scroller.scrollTop = top;
        scroller.scrollLeft = left;
        reportProgress();
      } catch {
        if (!cancelled) latest.current.onError();
      }
    }, EDIT_REDRAW_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [revision, doc, loadId, decorate, reportProgress]);

  // Đổi vùng chọn: chỉ đổi class CSS, rồi cuộn nốt chọn vào vùng nhìn nếu đang ở ngoài
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    applySelection(host, selected);
    if (selected.size > 0) {
      host.querySelector(`.${SELECTED_CLASS}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [selected]);

  // Nốt đang vang: chỉ đổi class CSS
  useEffect(() => {
    if (hostRef.current) applyPlaying(hostRef.current, playing);
  }, [playing]);

  // Khung đoạn A-B (hoặc đoạn đang kéo chọn): vẽ lại khi giá trị đổi, không vẽ lại chỉ vì tham chiếu đổi
  const shownStart = dragRange ? dragRange.start : (loopRange?.start ?? -1);
  const shownEnd = dragRange ? dragRange.end : (loopRange?.end ?? -1);
  const shownActive = dragRange ? true : (loopRange?.active ?? false);
  useEffect(() => {
    const host = hostRef.current;
    if (host) drawLoopBoxes(host, shownStart < 0 ? null : { start: shownStart, end: shownEnd, active: shownActive });
  }, [shownStart, shownEnd, shownActive]);

  // Khuông bị tắt tiếng: chỉ đổi class CSS
  useEffect(() => {
    if (hostRef.current) applyMutedTracks(hostRef.current, mutedStaves);
  }, [mutedStaves]);

  // Phát: giữ ô nhịp đang phát trong khung nhìn
  useEffect(() => {
    const scroller = scrollRef.current;
    const host = hostRef.current;
    if (scroller && host && followMeasure !== null) keepMeasureVisible(scroller, host, followMeasure);
  }, [followMeasure]);

  // Tô lại ô nhịp sai khi danh sách đổi
  useEffect(() => {
    const host = hostRef.current;
    if (host) drawIssueBoxes(host, issueMeasures, (i) => latest.current.onConfirmMeasure?.(i));
  }, [issueMeasures]);

  // Tô lại các đoạn có góp ý khi danh sách đổi (so theo nội dung, không theo tham chiếu mảng)
  const commentKey = commentRanges.map((r) => `${r.id}:${r.start}-${r.end}${r.active ? '*' : ''}`).join('|');
  useEffect(() => {
    const host = hostRef.current;
    if (host) drawCommentBoxes(host, latest.current.commentRanges, (ids) => latest.current.onCommentBubble?.(ids));
  }, [commentKey]);

  // Vẽ lại viền khóa khi người khác đổi vùng đang sửa (so theo nội dung, không theo tham chiếu mảng)
  const lockKey = lockBoxes.map((l) => `${l.measureIndex}:${l.colorIndex}:${l.label}`).join('|');
  useEffect(() => {
    const host = hostRef.current;
    if (host) drawLockBoxes(host, latest.current.lockBoxes);
  }, [lockKey]);

  // Cuộn tới ô nhịp được yêu cầu (bấm cảnh báo trên thanh trạng thái)
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !focusMeasure) return;
    const target = Array.from(host.querySelectorAll('[data-note-id]')).find(
      (el) => Number(MEASURE_OF_ID.exec(el.getAttribute('data-note-id') ?? '')?.[1]) === focusMeasure.index,
    );
    target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [focusMeasure]);

  // Ctrl+cuộn chuột (hoặc chụm trên touchpad) để thu phóng; cuộn thường để xem tiếp
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = clampZoom(latest.current.zoom - Math.sign(e.deltaY) * 10);
      if (next !== latest.current.zoom) latest.current.onZoomChange(next);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  // Chụm hai ngón trên iPad/điện thoại: thu phóng theo tỉ lệ khoảng cách hai ngón
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let startDistance = 0;
    let startZoom = 0;
    const distance = (e: TouchEvent) =>
      Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDistance = distance(e);
      startZoom = latest.current.zoom;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDistance === 0) return;
      e.preventDefault();
      const next = clampZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (startZoom * distance(e)) / startDistance)));
      if (next !== latest.current.zoom) latest.current.onZoomChange(next);
    };
    const onEnd = () => {
      startDistance = 0;
    };
    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: false });
    scroller.addEventListener('touchend', onEnd);
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
    };
  }, []);

  /** Bắt sự kiện ủy quyền trên khung: bấm nốt để chọn, Shift+bấm để thêm/bớt, bấm ra ngoài để bỏ chọn. */
  const handleClick = (e: MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!onSelectNotes) {
      const measure = onMeasureClick ? measureOfEvent(e.nativeEvent) : null;
      if (measure !== null) onMeasureClick?.(measure, e.shiftKey);
      return;
    }
    const ids = noteIdsFromEvent(e.nativeEvent);
    if (ids.length === 0 && e.shiftKey) return;
    onSelectNotes(ids, e.shiftKey);
    if (e.shiftKey) return;
    // Cảm ứng không đi qua pointer-down: bấm khuông / dấu lặng cũng mở khung thêm nốt
    const onRest = latest.current.doc?.getInfo(ids[0])?.isRest === true;
    if (ids.length === 0) openPopover(e.clientX, e.clientY);
    else if (onRest) openPopover(e.clientX, e.clientY, true);
  };

  /** Kích thước một bậc nhạc (nửa khoảng cách giữa hai dòng kẻ): theo đơn vị SVG và theo px màn hình. Zoom nằm trong tỉ lệ viewBox → màn hình. */
  const stepSize = () => {
    const unit = (osmdRef.current?.EngravingRules as { UnitInPixels?: number } | undefined)?.UnitInPixels ?? 10;
    const user = unit / 2;
    const svg = hostRef.current?.querySelector('svg');
    const viewBoxWidth = svg?.viewBox.baseVal.width ?? 0;
    const scale = svg && viewBoxWidth > 0 ? svg.getBoundingClientRect().width / viewBoxWidth : 1;
    return { user, screen: user * scale };
  };

  /** Vị trí khuông ứng với điểm màn hình, hoặc null. */
  const locate = (x: number, y: number): StaffSpot | null => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    const current = latest.current.doc;
    if (!osmd || !host || !current) return null;
    try {
      return locateSpot(osmd, current, host, x, y);
    } catch {
      return null; // hình học OSMD không đọc được: chỉ mất tính năng thêm nốt
    }
  };

  /** Mở khung thêm nốt tại điểm bấm; `restOnly`: chỉ mở khi điểm bấm trúng dấu lặng. */
  const openPopover = (x: number, y: number, restOnly = false) => {
    if (!inputMode || !onInsertNote) return;
    const spot = locate(x, y);
    if (!spot || (restOnly && spot.restEntry === null)) return;
    setGhost(null);
    setPopover({ spot, revision });
  };

  /** Rê chuột (chế độ Nhập nốt): cập nhật nốt mờ, gộp theo khung hình. */
  const hover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!inputMode || !onInsertNote || popover) {
      if (ghost) setGhost(null);
      return;
    }
    const current = latest.current.doc;
    const overNote = noteIdsFromEvent(e.nativeEvent).some((id) => current?.getInfo(id)?.isRest === false);
    hoverRef.current.x = e.clientX;
    hoverRef.current.y = e.clientY;
    if (overNote) {
      if (ghost) setGhost(null);
      return;
    }
    if (hoverRef.current.frame) return;
    hoverRef.current.frame = requestAnimationFrame(() => {
      hoverRef.current.frame = 0;
      setGhost(locate(hoverRef.current.x, hoverRef.current.y));
    });
  };

  const hasDuration = (e: DragEvent<HTMLDivElement>) =>
    !!onInsertNote && e.dataTransfer.types.includes(DURATION_DRAG_TYPE);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDuration(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setGhost(locate(e.clientX, e.clientY));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDuration(e)) return;
    e.preventDefault();
    setGhost(null);
    let choice: DurationChoice | null = null;
    try {
      const data = JSON.parse(e.dataTransfer.getData(DURATION_DRAG_TYPE)) as { type?: string; dots?: number };
      if (data.type && data.type in DURATION_QUARTERS)
        choice = { type: data.type as DurationType, dots: data.dots === 1 || data.dots === 2 ? data.dots : 0 };
    } catch {
      // dữ liệu kéo không hợp lệ: bỏ qua
    }
    const spot = locate(e.clientX, e.clientY);
    if (choice && spot) onInsertNote?.(spotTarget(spot), choice, 'auto');
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollRef.current;
    if (!scroller || e.button !== 0 || e.pointerType === 'touch') return;
    if (popover) setPopover(null);
    // Bỏ qua khi bấm vào thanh cuộn
    const box = scroller.getBoundingClientRect();
    if (e.clientX - box.left >= scroller.clientWidth || e.clientY - box.top >= scroller.clientHeight) return;
    if (e.shiftKey && !onSelectNotes && onMeasureRange) {
      const from = measureOfEvent(e.nativeEvent);
      gestureRef.current = { kind: 'measures', x0: e.clientX, y0: e.clientY, from, to: from, moved: false };
      scroller.setPointerCapture(e.pointerId);
      return;
    }
    const ids = noteIdsFromEvent(e.nativeEvent);
    if (ids.length > 0) {
      const el = (e.target as Element).closest(`[${NOTE_ID_ATTR}]`) as SVGGElement | null;
      if (!onDragPitch || !el) return;
      gestureRef.current = { kind: 'note', ids, el, y0: e.clientY, moved: false, steps: 0 };
    } else {
      if (!onSelectNotes) return;
      gestureRef.current = { kind: 'band', x0: e.clientX, y0: e.clientY, moved: false };
    }
    scroller.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') hover(e);
      return;
    }
    if (g.kind === 'band') {
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_THRESHOLD) return;
      g.moved = true;
      setBand({
        x: Math.min(g.x0, e.clientX),
        y: Math.min(g.y0, e.clientY),
        w: Math.abs(e.clientX - g.x0),
        h: Math.abs(e.clientY - g.y0),
      });
      return;
    }
    if (g.kind === 'measures') {
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < DRAG_THRESHOLD) return;
      g.moved = true;
      const measure = measureAtPoint(e.clientX, e.clientY);
      if (measure !== null) {
        g.from ??= measure;
        g.to = measure;
      }
      if (g.from !== null && g.to !== null) {
        const start = Math.min(g.from, g.to);
        const end = Math.max(g.from, g.to);
        setDragRange((prev) => (prev && prev.start === start && prev.end === end ? prev : { start, end }));
      }
      return;
    }
    const dy = e.clientY - g.y0;
    if (!g.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    g.moved = true;
    const size = stepSize();
    g.steps = Math.round(-dy / size.screen);
    // Trong lúc kéo chỉ dịch nhóm SVG (bóng mờ, bám theo bậc); thả chuột mới áp lệnh
    g.el.style.transform = `translateY(${-g.steps * size.user}px)`;
    g.el.style.opacity = '0.55';
  };

  const finishGesture = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (scrollRef.current?.hasPointerCapture(e.pointerId)) scrollRef.current.releasePointerCapture(e.pointerId);
    if (g.kind === 'note') {
      g.el.style.transform = '';
      g.el.style.opacity = '';
    } else if (g.kind === 'band') {
      setBand(null);
    } else {
      setDragRange(null);
    }
    // Khung đang giữ con trỏ (setPointerCapture) nên sự kiện click sau đó trỏ vào khung chứ không vào nốt:
    // bấm thường (không kéo) phải xử lý chọn nốt ngay tại đây, rồi bỏ qua click đi kèm.
    // Sau khi thả chuột trình duyệt vẫn bắn thêm sự kiện click, bỏ qua nó
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
    if (g.kind === 'measures') {
      if (cancelled) return;
      // Shift + bấm (không kéo): để trang cha xử lý như chọn lần lượt A rồi B
      if (!g.moved) {
        if (g.from !== null) onMeasureClick?.(g.from, true);
      } else if (g.from !== null && g.to !== null) {
        onMeasureRange?.(Math.min(g.from, g.to), Math.max(g.from, g.to));
      }
      return;
    }
    if (!g.moved) {
      if (cancelled) return;
      if (g.kind === 'note') {
        onSelectNotes?.(g.ids, e.shiftKey);
        // Nhập nốt: bấm vào dấu lặng mở khung thay dấu lặng bằng nốt
        const onRest = latest.current.doc?.getInfo(g.ids[0])?.isRest === true;
        if (onRest && !e.shiftKey) openPopover(e.clientX, e.clientY, true);
      } else if (!e.shiftKey) {
        onSelectNotes?.([], false);
        openPopover(e.clientX, e.clientY);
      }
      return;
    }
    if (cancelled) return;
    if (g.kind === 'note') {
      if (g.steps !== 0) onDragPitch?.(g.ids, g.steps);
      return;
    }
    const left = Math.min(g.x0, e.clientX);
    const right = Math.max(g.x0, e.clientX);
    const top = Math.min(g.y0, e.clientY);
    const bottom = Math.max(g.y0, e.clientY);
    const ids: string[] = [];
    hostRef.current?.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right < left || r.left > right || r.bottom < top || r.top > bottom) return;
      const raw = el.getAttribute(NOTE_IDS_ATTR) ?? el.getAttribute(NOTE_ID_ATTR) ?? '';
      ids.push(...raw.split(' ').filter(Boolean));
    });
    onSelectNotes?.(ids, e.shiftKey);
  };

  const activeText = textEdit && textEdit.revision === revision ? textEdit : null;
  const activePopover = popover && popover.revision === revision ? popover : null;
  const shownGhost = activePopover ? activePopover.spot : ghost;

  return (
    <div
      ref={scrollRef}
      className={`sv-canvas sv-canvas--${mode}${inverted ? ' sv-canvas--inverted' : ''}`}
      onScroll={() => {
        reportProgress();
        if (popover) setPopover(null);
      }}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishGesture(e, false)}
      onPointerCancel={(e) => finishGesture(e, true)}
      onPointerLeave={() => setGhost(null)}
      onDragOver={handleDragOver}
      onDragLeave={() => setGhost(null)}
      onDrop={handleDrop}
      aria-busy={busy}
      tabIndex={0}
      aria-label={t('viewer.canvas.label')}
    >
      {busy && (
        <div className="sv-canvas__busy" role="status">
          <span className="sv-spinner" aria-hidden="true" /> {t('viewer.canvas.drawing')}
        </div>
      )}
      <div ref={hostRef} className="sv-canvas__host" />
      {activeText && (
        <TextEditPopover
          key={`${activeText.kind}-${activeText.revision}`}
          kind={activeText.kind}
          left={activeText.left}
          top={activeText.top}
          header={activeText.header}
          tempo={activeText.tempo}
          onApplyHeader={(field, text, style) => onEditHeader?.(field, text, style) ?? false}
          onApplyTempo={(info) => onEditTempo?.(info) ?? false}
          onClose={() => setTextEdit(null)}
        />
      )}
      {shownGhost && <NoteGhost spot={shownGhost} />}
      {activePopover && (
        <NoteInsertPopover
          key={`${activePopover.spot.measureIndex}-${activePopover.spot.beforeEntry}-${Math.round(activePopover.spot.y)}`}
          target={spotTarget(activePopover.spot)}
          left={Math.max(8, Math.min(activePopover.spot.x + 16, window.innerWidth - 272))}
          top={Math.max(
            8,
            activePopover.spot.y + 18 + POPOVER_HEIGHT > window.innerHeight
              ? activePopover.spot.y - POPOVER_HEIGHT - 12
              : activePopover.spot.y + 18,
          )}
          initialDuration={inputDuration ?? { type: 'quarter', dots: 0 }}
          onAdd={(target, choice, accidental) => onInsertNote?.(target, choice, accidental) ?? false}
          onClose={() => setPopover(null)}
        />
      )}
      {band && <div className="ed-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
    </div>
  );
}
