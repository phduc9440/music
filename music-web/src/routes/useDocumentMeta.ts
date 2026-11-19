import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { t } from '../i18n/core';
import { faviconHref } from './favicon';
import { PAGE_META_ROUTES } from './pageMetaRoutes';
import type { FaviconGlyph } from './pageMetaRoutes';

function resolve(pathname: string): { title: string | null; glyph: FaviconGlyph } {
  const route = PAGE_META_ROUTES.find((r) => matchPath({ path: r.pattern, end: true }, pathname));
  if (route) return { title: t(`meta.titles.${route.key}`), glyph: route.glyph };
  // Trong khung admin mà không khớp route nào, hoặc đường dẫn lạ ở gốc: trang 404
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  return { title: t('meta.notFound'), glyph: inAdmin ? 'admin' : 'alert' };
}

/** Đặt tiêu đề và biểu tượng của tab trình duyệt theo trang đang xem (và khu vực quản trị). */
export function useDocumentMeta(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const { title, glyph } = resolve(pathname);
    const app = t('meta.app');
    const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
    const suffix = inAdmin ? `${app} · ${t('meta.admin')}` : app;
    // Trang chủ "/" không có tiêu đề riêng: chỉ hiện tên ứng dụng
    document.title = pathname === '/' || !title ? suffix : `${title} · ${suffix}`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = faviconHref(pathname === '/' ? 'note' : glyph);
  }, [pathname]);
}
