import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Thẻ nghiêng 3D theo con trỏ: rê chuột trên một phần tử khớp `selector` (bên trong `root`) thì phần tử nhận các biến
 * CSS --tilt-x, --tilt-y (độ nghiêng) và --glare-x, --glare-y (vị trí vệt sáng). CSS lo phần vẽ. Chỉ bật với chuột
 * thật (hover + pointer fine) và khi không bật "Giảm chuyển động". Một listener cho cả trang (uỷ quyền sự kiện).
 */
export function useTilt3D(root: RefObject<HTMLElement | null>, selector: string, maxDeg = 7) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let current: HTMLElement | null = null;
    let raf = 0;
    let last: PointerEvent | null = null;

    const reset = (card: HTMLElement) => {
      card.classList.remove('is-tilting');
      for (const v of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) card.style.removeProperty(v);
    };

    const paint = () => {
      raf = 0;
      if (!last || !current) return;
      const r = current.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (last.clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (last.clientY - r.top) / r.height));
      current.style.setProperty('--tilt-x', `${((0.5 - py) * 2 * maxDeg).toFixed(2)}deg`);
      current.style.setProperty('--tilt-y', `${((px - 0.5) * 2 * maxDeg).toFixed(2)}deg`);
      current.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`);
      current.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`);
    };

    const onMove = (e: PointerEvent) => {
      if (!fine.matches || motion.matches || e.pointerType !== 'mouse') return;
      const card = (e.target as Element | null)?.closest<HTMLElement>(selector) ?? null;
      if (card !== current) {
        if (current) reset(current);
        current = card && el.contains(card) ? card : null;
        current?.classList.add('is-tilting');
      }
      last = e;
      if (current && !raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      if (current) reset(current);
      current = null;
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      if (current) reset(current);
    };
  }, [root, selector, maxDeg]);
}
