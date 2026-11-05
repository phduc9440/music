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
} from '../../editor/osmdBridge';
import { DURATION_QUARTERS } from '../../editor/durations';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../../editor/durations';
import type { ScoreDocument } from '../../editor/ScoreDocument';
import { DURATION_DRAG_TYPE, ledgerLines, locateSpot, solfegeName, spotTarget } from '../../editor/staffHit';
import type { StaffSpot } from '../../editor/staffHit';
import { ZOOM_MAX, ZOOM_MIN, clampZoom } from '../../utils/viewer';
import type { ViewMode } from '../../utils/viewer';
import { applyHeaderStyle, readHeader } from '../../editor/header';
import type { HeaderField, HeaderState, TextStyle } from '../../editor/header';
import { readTempo } from '../../editor/tempo';
import type { TempoInfo } from '../../editor/tempo';
import NoteInsertPopover from './NoteInsertPopover';
import TextEditPopover from './TextEditPopover';
import type { TextKind } from './TextEditPopover';
import '../../editor/editor.css';

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
  /** Thêm nốt tại vị trí trên khuông (bấm hoặc kéo-thả); trả về true nếu thêm được. Có prop này thì canvas nhận kéo-thả. */
  onInsertNote?: (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice) => boolean;
}

/** Cử chỉ chuột/bút đang diễn ra: kéo khung chọn vùng, hoặc kéo một nốt. */
type Gesture =
  | { kind: 'band'; x0: number; y0: number; moved: boolean }
  | { kind: 'note'; ids: string[]; el: SVGGElement; y0: number; moved: boolean; steps: number };

/** Chờ sau lần đổi zoom/kích thước cuối cùng rồi mới vẽ lại (ms). */
const RENDER_DEBOUNCE_MS = 200;
/** Gộp các thao tác sửa liên tiếp (ví dụ giữ phím ↑) thành một lần vẽ (ms). */
const EDIT_REDRAW_MS = 150;
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_NUMBERS: ReadonlySet<number> = new Set();
const MEASURE_OF_ID = /^(?:p\d+-)?m(\d+)-/;
const ISSUE_BOX_CLASS = 'ed-issue-box';
/** Quãng kéo tối thiểu (px) để coi là kéo chứ không phải bấm. */
const DRAG_THRESHOLD = 5;
/** Khoảng đệm quanh các nốt của ô nhịp sai khi vẽ viền (px). */
const ISSUE_PAD_X = 10;
const ISSUE_PAD_Y = 22;

const TEXT_HOT_CLASS = 'ed-text-hot';

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
    div.title = 'Bấm để sửa';
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

/** Vẽ viền đỏ quanh các ô nhịp sai độ dài, tính từ vùng chiếm của các nốt đã gắn id trong ô đó. */
const drawIssueBoxes = (
  host: HTMLElement,
  measures: ReadonlySet<number>,
  onConfirm?: (measureIndex: number) => void,
): void => {
  host.querySelectorAll(`.${ISSUE_BOX_CLASS}`).forEach((el) => el.remove());
  if (measures.size === 0) return;
  const origin = host.getBoundingClientRect();
  const boxes = new Map<number, { l: number; t: number; r: number; b: number }>();
  host.querySelectorAll(`[${NOTE_ID_ATTR}]`).forEach((el) => {
    const match = MEASURE_OF_ID.exec(el.getAttribute(NOTE_ID_ATTR) ?? '');
    if (!match || !measures.has(Number(match[1]))) return;
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
      ok.title = 'Ô nhịp này đúng (ví dụ ô lấy đà): bỏ cảnh báo';
      ok.setAttribute('aria-label', `Xác nhận ô ${measureIndex + 1} đúng`);
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
  focusMeasure = null,
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
  // Revision của nội dung OSMD đang giữ, để biết khi nào cần nạp lại
  const loadedRevision = useRef(0);
  // loadId > 0: đã nạp xong MusicXML (tăng theo mỗi lần nạp); drawnKey: cấu hình đã vẽ xong gần nhất
  const [loadId, setLoadId] = useState(0);
  const [drawnKey, setDrawnKey] = useState('');
  const wantedKey = loadId > 0 ? `${loadId}|${zoom}|${mode}` : '';
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
    issueMeasures,
    onConfirmMeasure,
    openText,
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
      issueMeasures,
      onConfirmMeasure,
      openText,
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
      drawIssueBoxes(host, latest.current.issueMeasures, (i) => latest.current.onConfirmMeasure?.(i));
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
        const { OpenSheetMusicDisplay: Osmd } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        const osmd = new Osmd(host, {
          autoResize: false, // tự vẽ lại bằng ResizeObserver
          backend: 'svg',
          drawTitle: true,
          drawSubtitle: true,
          drawComposer: true,
          drawPartNames: false,
        });
        const source = latest.current.doc;
        loadedRevision.current = latest.current.revision;
        await osmd.load(source ? source.serialize() : xml);
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
          pageBackgroundColor: '#ffffff',
        });
        osmd.zoom = zoom / 100;
        if (latest.current.doc) applyHeaderStyle(osmd, readHeader(latest.current.doc));
        osmd.render();
        decorate(osmd);
        // Vẽ lại làm khung co lại tạm thời nên trả về vị trí cuộn cũ (đổi zoom thì giữ tương đối)
        scroller.scrollTop = top;
        scroller.scrollLeft = left;
        const pages = horizontal ? 1 : Math.max(1, osmd.GraphicSheet?.MusicPages?.length ?? 1);
        latest.current.onRendered(pages);
        reportProgress();
        setDrawnKey(`${loadId}|${zoom}|${mode}`);
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
  }, [loadId, zoom, mode, reportProgress, decorate]);

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
        await osmd.load(doc.serialize());
        if (cancelled) return;
        applyHeaderStyle(osmd, readHeader(doc));
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

  // Tô lại ô nhịp sai khi danh sách đổi
  useEffect(() => {
    const host = hostRef.current;
    if (host) drawIssueBoxes(host, issueMeasures, (i) => latest.current.onConfirmMeasure?.(i));
  }, [issueMeasures]);

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
    if (!onSelectNotes) return;
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
      const data = JSON.parse(e.dataTransfer.getData(DURATION_DRAG_TYPE)) as { type?: string; dotted?: boolean };
      if (data.type && data.type in DURATION_QUARTERS)
        choice = { type: data.type as DurationType, dotted: !!data.dotted };
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
    } else {
      setBand(null);
    }
    // Khung đang giữ con trỏ (setPointerCapture) nên sự kiện click sau đó trỏ vào khung chứ không vào nốt:
    // bấm thường (không kéo) phải xử lý chọn nốt ngay tại đây, rồi bỏ qua click đi kèm.
    // Sau khi thả chuột trình duyệt vẫn bắn thêm sự kiện click, bỏ qua nó
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
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
      className={`sv-canvas sv-canvas--${mode}`}
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
      aria-label="Bản nhạc"
    >
      {busy && (
        <div className="sv-canvas__busy" role="status">
          <span className="sv-spinner" aria-hidden="true" /> Đang vẽ bản nhạc...
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
          initialDuration={inputDuration ?? { type: 'quarter', dotted: false }}
          onAdd={(target, choice, accidental) => onInsertNote?.(target, choice, accidental) ?? false}
          onClose={() => setPopover(null)}
        />
      )}
      {band && <div className="ed-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
    </div>
  );
}
