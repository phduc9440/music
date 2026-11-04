import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { ZOOM_MAX, ZOOM_MIN, clampZoom } from '../../utils/viewer';
import type { ViewMode } from '../../utils/viewer';

interface Props {
  /** Nội dung MusicXML. */
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
}

/** Chờ sau lần đổi zoom/kích thước cuối cùng rồi mới vẽ lại (ms). */
const RENDER_DEBOUNCE_MS = 200;

/**
 * Vùng vẽ bản nhạc bằng OpenSheetMusicDisplay (font nhạc Bravura có sẵn trong thư viện).
 * Giữ một đối tượng OSMD cho mỗi MusicXML; đổi zoom hoặc chế độ chỉ vẽ lại, không nạp lại XML.
 * Hỗ trợ Ctrl+cuộn chuột và chụm hai ngón để thu phóng.
 */
export default function ScoreCanvas({ xml, zoom, mode, onZoomChange, onRendered, onProgress, onError }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  // loadId > 0: đã nạp xong MusicXML (tăng theo mỗi lần nạp); drawnKey: cấu hình đã vẽ xong gần nhất
  const [loadId, setLoadId] = useState(0);
  const [drawnKey, setDrawnKey] = useState('');
  const wantedKey = loadId > 0 ? `${loadId}|${zoom}|${mode}` : '';
  const busy = wantedKey === '' || drawnKey !== wantedKey;

  // Giữ các giá trị mới nhất cho các callback sự kiện mà không phải đăng ký lại
  const latest = useRef({ zoom, mode, onZoomChange, onRendered, onProgress, onError });
  useEffect(() => {
    latest.current = { zoom, mode, onZoomChange, onRendered, onProgress, onError };
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
        await osmd.load(xml);
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
        osmd.setOptions({
          renderSingleHorizontalStaffline: horizontal,
          pageFormat: horizontal ? 'Endless' : 'A4 P',
          pageBackgroundColor: '#ffffff',
        });
        osmd.zoom = zoom / 100;
        osmd.render();
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
  }, [loadId, zoom, mode, reportProgress]);

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

  return (
    <div
      ref={scrollRef}
      className={`sv-canvas sv-canvas--${mode}`}
      onScroll={reportProgress}
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
    </div>
  );
}
