import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import type { NavigateOptions, To } from 'react-router-dom';
import { useTransitionAllowed } from './transition-allowed';

/** useNavigate có sẵn hiệu ứng chuyển trang bằng View Transitions (mục 5.6); dùng thay cho bản của react-router-dom. */
export function useNavigate() {
  const navigate = useRouterNavigate();
  const allowed = useTransitionAllowed();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === 'number') return navigate(to);
      return navigate(to, { viewTransition: allowed(to), ...options });
    },
    [navigate, allowed],
  );
}
