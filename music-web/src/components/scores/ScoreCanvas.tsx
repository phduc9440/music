import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  NOTE_ID_ATTR,
  NOTE_IDS_ATTR,
  SELECTED_CLASS,
  applySelection,
  bindNoteIds,
  noteIdsFromEvent,
} from '../../editor/osmdBridge';
import type { ScoreDocument } from '../../editor/ScoreDocument';
import { ZOOM_MAX, ZOOM_MIN, clampZoom } from '../../utils/viewer';
import type { ViewMode } from '../../utils/viewer';
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

/** Vẽ viền đỏ quanh các ô nhịp sai độ dài, tính từ vùng chiếm của các nốt đã gắn id trong ô đó. */
const drawIssueBoxes = (host: HTMLElement, measures: ReadonlySet<number>): void => {
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
  for (const box of boxes.values()) {
    const div = document.createElement('div');
    div.className = ISSUE_BOX_CLASS;
    div.style.left = `${box.l - origin.left - ISSUE_PAD_X}px`;
    div.style.top = `${box.t - origin.top - ISSUE_PAD_Y}px`;
    div.style.width = `${box.r - box.l + ISSUE_PAD_X * 2}px`;
    div.style.height = `${box.b - box.t + ISSUE_PAD_Y * 2}px`;
    host.appendChild(div);
  }
};

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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Revision của nội dung OSMD đang giữ, để biết khi nào cần nạp lại
  const loadedRevision = useRef(0);
  // loadId > 0: đã nạp xong MusicXML (tăng theo mỗi lần nạp); drawnKey: cấu hình đã vẽ xong gần nhất
  const [loadId, setLoadId] = useState(0);
  const [drawnKey, setDrawnKey] = useState('');
  const wantedKey = loadId > 0 ? `${loadId}|${zoom}|${mode}` : '';
  const busy = wantedKey === '' || drawnKey !== wantedKey;

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
      drawIssueBoxes(host, latest.current.issueMeasures);
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
    if (host) drawIssueBoxes(host, issueMeasures);
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
  };

  /** Số px (màn hình / đơn vị SVG) của một bậc nhạc: nửa khoảng cách giữa hai dòng kẻ = 5 đơn vị × zoom. */
  const stepSize = () => {
    const unit = (osmdRef.current?.EngravingRules as { UnitInPixels?: number } | undefined)?.UnitInPixels ?? 10;
    const user = (unit / 2) * (latest.current.zoom / 100);
    const svg = hostRef.current?.querySelector('svg');
    const viewBoxWidth = svg?.viewBox.baseVal.width ?? 0;
    const scale = svg && viewBoxWidth > 0 ? svg.getBoundingClientRect().width / viewBoxWidth : 1;
    return { user, screen: user * scale };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollRef.current;
    if (!scroller || e.button !== 0 || e.pointerType === 'touch') return;
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
    if (!g) return;
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
    if (!g.moved) return; // bấm thường: để onClick xử lý
    // Sau khi kéo trình duyệt vẫn bắn thêm sự kiện click, bỏ qua nó
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 50);
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

  return (
    <div
      ref={scrollRef}
      className={`sv-canvas sv-canvas--${mode}`}
      onScroll={reportProgress}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finishGesture(e, false)}
      onPointerCancel={(e) => finishGesture(e, true)}
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
      {band && <div className="ed-band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
    </div>
  );
}
