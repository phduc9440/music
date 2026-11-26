import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { ZOOM_DEFAULT, ZOOM_STEP, clampZoom, loadViewerPrefs, saveViewerPrefs } from '../../../../utils/viewer';
import type { ViewMode } from '../../../../utils/viewer';

/**
 * Phần "khung xem" của Editor: thu phóng, chế độ Trang / Cuộn ngang (nhớ trong trình duyệt), vị trí đọc, toàn màn hình
 * và phím tắt + / - / 0 / ?.
 */
export function useViewerChrome(rootRef: RefObject<HTMLDivElement | null>, canEdit: boolean, openHelp: () => void) {
  const [prefs, setPrefs] = useState(loadViewerPrefs);
  const [progress, setProgress] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const { zoom, mode } = prefs;

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveViewerPrefs(next);
      return next;
    });
  }, []);

  const setZoom = useCallback((value: number) => updatePrefs({ zoom: clampZoom(value) }), [updatePrefs]);
  const setMode = (value: ViewMode) => {
    updatePrefs({ mode: value });
    setProgress(1);
  };

  // Phím tắt: + / - / 0 để thu phóng, ? mở bảng phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') setZoom(zoom + ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') setZoom(zoom - ZOOM_STEP);
      else if (e.key === '0') setZoom(ZOOM_DEFAULT);
      else if (e.key === '?' && canEdit) openHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, setZoom, canEdit, openHelp]);

  // Theo dõi trạng thái toàn màn hình (người dùng có thể thoát bằng Esc)
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [rootRef]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      // trình duyệt không cho phép toàn màn hình: bỏ qua
    }
  };

  return {
    zoom,
    mode,
    setZoom,
    setMode,
    progress,
    setProgress,
    pageCount,
    setPageCount,
    fullscreen,
    toggleFullscreen,
  };
}
