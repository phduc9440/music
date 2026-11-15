import { useEffect, useRef } from 'react';

/** Phần tử vào màn hình thì thêm "reveal--in" (CSS ở styles/motion.css lo chuyển động và tắt khi giảm chuyển động). */
function createObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  const observer: IntersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--in');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  return observer;
}

/**
 * Hiện dần khi cuộn tới (mục 5.6): gắn ref vào phần tử có class "reveal"; khi phần tử vào màn hình thì thêm class
 * "reveal--in". CSS lo chuyển động và tắt hẳn khi người dùng bật "Giảm chuyển động" trong hệ điều hành.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = createObserver();
    if (!observer) {
      el.classList.add('reveal--in');
      return;
    }
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

const SELECTOR = '.reveal-item:not(.reveal--in), .reveal:not(.reveal--in)';

/**
 * Đặt một lần ở gốc app: mọi phần tử "reveal-item" (thẻ trong lưới) hay "reveal" xuất hiện trong trang, kể cả thẻ tải sau
 * khi gọi API, đều tự hiện dần khi cuộn tới. Nhờ vậy trang chỉ cần thêm class, không phải tự gắn ref.
 */
export function useRevealAll(): void {
  useEffect(() => {
    const observer = createObserver();
    const seen = new WeakSet<Element>();
    let queued = false;

    const scan = () => {
      queued = false;
      document.querySelectorAll(SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (observer) observer.observe(el);
        else el.classList.add('reveal--in');
      });
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(scan);
    };

    scan();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, []);
}
