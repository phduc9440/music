import { useEffect } from 'react';

/**
 * Bật chế độ "mỗi màn một section" cho trang đang mở: gắn lớp `scr-snap` lên <html> (CSS trong screens.css quyết định có
 * cuộn hít hay không theo bề rộng màn và "Giảm chuyển động") và khai báo `--scr-top` là chiều cao thanh dính ở đầu trang,
 * để màn hít vào ngay dưới thanh đó. Rời trang thì gỡ ra.
 */
export function useScreenSnap(top: string) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('scr-snap');
    html.style.setProperty('--scr-top', top);
    return () => {
      html.classList.remove('scr-snap');
      html.style.removeProperty('--scr-top');
    };
  }, [top]);
}
