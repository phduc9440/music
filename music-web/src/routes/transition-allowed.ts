import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import type { To } from 'react-router-dom';

/** Không thêm hiệu ứng chuyển trang khi đi vào hoặc ra khỏi Editor/Player (mục 5.6). */
const NO_MOTION_PAGE = /\/(edit|play)\/?$|^\/dev\//;

const pathOf = (to: To): string => {
  const raw = typeof to === 'string' ? to : (to.pathname ?? '');
  return raw.split(/[?#]/)[0];
};

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Hàm cho biết chuyển tới "to" có dùng View Transitions không (tắt khi giảm chuyển động hoặc liên quan Editor/Player). */
export const useTransitionAllowed = () => {
  const { pathname } = useLocation();
  return useCallback(
    (to: To): boolean => !reducedMotion() && !NO_MOTION_PAGE.test(pathname) && !NO_MOTION_PAGE.test(pathOf(to)),
    [pathname],
  );
};
