import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

/** Bề rộng dải mỏng khi thu gọn (khớp CSS .is-rail / .sv-side-rail). */
export const SIDEBAR_RAIL = 52;
const KEY_STEP = 20;

export interface SidebarResizeOptions {
  /** Khóa localStorage để nhớ độ rộng và trạng thái thu gọn. */
  storageKey: string;
  /** Cột nằm bên nào: cột phải kéo sang trái mới là nới rộng. */
  side: 'left' | 'right';
  min: number;
  max: number;
  defaultWidth: number;
  /** Kéo hẹp hơn mức này thì cột thu thành dải mỏng (mặc định: 60% của min). */
  collapseAt?: number;
}

interface Layout {
  width: number;
  collapsed: boolean;
}

/**
 * Cột bên kéo ra / kéo vào được: kéo tay kéo ở mép trong để đổi độ rộng, kéo hẳn vào thì thu thành dải mỏng, kéo dải ra
 * (hoặc bấm mở) thì hiện lại. Nhấp đúp hoặc Enter trên tay kéo để thu / mở; ←/→ chỉnh độ rộng, Home thu gọn, End rộng
 * nhất. Độ rộng và trạng thái thu gọn được nhớ trong localStorage.
 */
export function useSidebarResize({ storageKey, side, min, max, defaultWidth, collapseAt }: SidebarResizeOptions) {
  const clamp = useCallback((w: number) => Math.min(max, Math.max(min, Math.round(w))), [min, max]);
  const collapseBelow = collapseAt ?? Math.round(min * 0.6);

  const [layout, setLayout] = useState<Layout>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Layout> | null;
      return {
        width: typeof raw?.width === 'number' ? clamp(raw.width) : defaultWidth,
        collapsed: raw?.collapsed === true,
      };
    } catch {
      return { width: defaultWidth, collapsed: false };
    }
  });
  const [dragging, setDragging] = useState(false);
  // w0: độ rộng lúc bắt đầu kéo (dải mỏng nếu đang thu gọn); keep: độ rộng trả lại khi mở ra sau lúc kéo hẳn vào
  const drag = useRef<{ x0: number; w0: number; keep: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // hết chỗ hoặc bị chặn: chỉ mất phần ghi nhớ
    }
  }, [storageKey, layout]);

  const toggle = useCallback(() => setLayout((l) => ({ ...l, collapsed: !l.collapsed })), []);
  const expand = useCallback(() => setLayout((l) => (l.collapsed ? { ...l, collapsed: false } : l)), []);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, w0: layout.collapsed ? SIDEBAR_RAIL : layout.width, keep: layout.width };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = e.clientX - start.x0;
    const next = start.w0 + (side === 'left' ? dx : -dx);
    // Kéo hẳn vào thì thu gọn nhưng nhớ độ rộng lúc bắt đầu kéo, mở ra không bị hẹp lại ở mức tối thiểu
    setLayout(next < collapseBelow ? { width: start.keep, collapsed: true } : { width: clamp(next), collapsed: false });
  };

  const endDrag = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const outward = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
      const delta = e.key === outward ? KEY_STEP : -KEY_STEP;
      setLayout((l) => {
        if (l.collapsed) return delta > 0 ? { ...l, collapsed: false } : l;
        const next = l.width + delta;
        return next < min ? { ...l, collapsed: true } : { width: clamp(next), collapsed: false };
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setLayout((l) => ({ ...l, collapsed: true }));
    } else if (e.key === 'End') {
      e.preventDefault();
      setLayout({ width: max, collapsed: false });
    }
  };

  return {
    width: layout.width,
    collapsed: layout.collapsed,
    dragging,
    max,
    toggle,
    expand,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick: toggle,
      onKeyDown,
    },
  };
}

export type SidebarResize = ReturnType<typeof useSidebarResize>;
