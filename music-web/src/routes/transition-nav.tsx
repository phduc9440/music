import { forwardRef } from 'react';
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom';
import type { LinkProps, NavLinkProps } from 'react-router-dom';
import { useTransitionAllowed } from './transition-allowed';

/**
 * Link và NavLink có sẵn hiệu ứng chuyển trang bằng View Transitions (mục 5.6), dùng thay cho bản của react-router-dom
 * trong toàn app. Tự tắt khi trình duyệt không hỗ trợ (React Router bỏ qua), khi người dùng bật "Giảm chuyển động" và khi
 * đi vào hoặc ra khỏi Editor/Player. Hook tương ứng cho navigate() nằm ở useTransitionNavigate.ts.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ viewTransition, ...props }, ref) {
  const allowed = useTransitionAllowed();
  return <RouterLink ref={ref} viewTransition={viewTransition ?? allowed(props.to)} {...props} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ viewTransition, ...props }, ref) {
  const allowed = useTransitionAllowed();
  return <RouterNavLink ref={ref} viewTransition={viewTransition ?? allowed(props.to)} {...props} />;
});
