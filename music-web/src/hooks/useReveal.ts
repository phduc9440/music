import { useEffect, useRef } from 'react';

/**
 * Hiện dần khi cuộn tới (mục 5.6): gắn ref vào phần tử có class "reveal"; khi phần tử vào màn hình thì thêm class
 * "reveal--in". CSS lo chuyển động và tắt hẳn khi người dùng bật "Giảm chuyển động" trong hệ điều hành.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('reveal--in');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
