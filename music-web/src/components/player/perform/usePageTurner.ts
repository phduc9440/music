import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

const NEXT_KEYS = new Set(['PageDown', 'ArrowRight', 'ArrowDown', ' ']);
const PREV_KEYS = new Set(['PageUp', 'ArrowLeft', 'ArrowUp']);

interface PageTurnerOptions {
  /** Tắt khi đang mở danh sách bài hay bảng cài đặt, để phím không lật trang phía sau. */
  enabled: boolean;
  onNext: () => void;
  onPrev: () => void;
  onList: () => void;
  onExit: () => void;
}

/**
 * Lật trang bằng phím (đa số bàn đạp Bluetooth gửi PageDown/PageUp hoặc phím mũi tên) và bằng chạm nửa phải/trái vùng
 * hiển thị. Trả về hàm xử lý cú chạm để gắn vào vùng hiển thị.
 */
export function usePageTurner(options: PageTurnerOptions): { onStageClick: (e: MouseEvent<HTMLElement>) => void } {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const { enabled, onNext, onPrev, onList, onExit } = latest.current;
      if (e.key === 'Escape') {
        onExit();
        return;
      }
      if (!enabled) return;
      if (NEXT_KEYS.has(e.key)) onNext();
      else if (PREV_KEYS.has(e.key)) onPrev();
      else if (e.key === 'l' || e.key === 'L') onList();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onStageClick = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!latest.current.enabled) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left + box.width / 2) latest.current.onPrev();
    else latest.current.onNext();
  }, []);

  return { onStageClick };
}
