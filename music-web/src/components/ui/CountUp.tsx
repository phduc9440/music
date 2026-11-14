import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../../i18n/core';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Số đếm tăng dần từ 0 khi cuộn tới (skill ui-ux-pro-max: chỉ đổi giá trị, easing ease-out, 1,2 giây). Người bật
 * "Giảm chuyển động" hoặc trình duyệt không có IntersectionObserver thấy ngay giá trị cuối.
 */
export default function CountUp({ value, duration = 1200 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const instant = prefersReducedMotion() || typeof IntersectionObserver === 'undefined';

  useEffect(() => {
    const el = ref.current;
    if (!el || instant) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, instant]);

  return <span ref={ref}>{formatNumber(instant ? value : shown)}</span>;
}
