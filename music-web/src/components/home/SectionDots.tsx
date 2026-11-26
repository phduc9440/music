import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import './screens.css';

type Screen = { el: HTMLElement; label: string };

const sameScreens = (a: Screen[], b: Screen[]) =>
  a.length === b.length && a.every((s, i) => s.el === b[i].el && s.label === b[i].label);

/**
 * Dải chấm điều hướng theo màn hình: mỗi phần tử có `data-screen` (giá trị là nhãn) bên trong `root` là một chấm. Chấm
 * của màn đang cắt ngang giữa khung nhìn sáng lên; bấm chấm thì cuộn tới màn đó. Tự quét lại khi các màn thay đổi (dữ
 * liệu tải xong làm hiện thêm mục, đổi ngôn ngữ làm đổi nhãn).
 */
export default function SectionDots({ root, label }: { root: RefObject<HTMLElement | null>; label: string }) {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let io: IntersectionObserver | null = null;
    let current: Screen[] = [];

    const scan = () => {
      const list = [...host.querySelectorAll<HTMLElement>('[data-screen]')].map((el) => ({
        el,
        label: el.dataset.screen ?? '',
      }));
      if (sameScreens(list, current)) return;
      current = list;
      io?.disconnect();
      if (list.length === 0) {
        setScreens([]);
        return;
      }
      // Observer luôn gọi lại một lần ngay khi bắt đầu quan sát, nên danh sách chấm được cập nhật ở đó luôn
      io = new IntersectionObserver(
        (entries) => {
          setScreens((prev) => (sameScreens(prev, list) ? prev : list));
          for (const e of entries) {
            if (e.isIntersecting) setActive(list.findIndex((s) => s.el === e.target));
          }
        },
        { rootMargin: '-50% 0px -50% 0px' },
      );
      list.forEach((s) => io?.observe(s.el));
    };

    scan();
    const mo = new MutationObserver(scan);
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-screen'] });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, [root]);

  if (screens.length < 2) return null;
  return (
    <nav className="scr-dots" aria-label={label}>
      {screens.map((s, i) => (
        <button
          key={i}
          type="button"
          className="scr-dots__dot"
          aria-label={s.label}
          aria-current={i === active ? 'true' : undefined}
          onClick={() => s.el.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span className="scr-dots__label" aria-hidden="true">
            {s.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
