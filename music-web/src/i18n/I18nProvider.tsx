import { Fragment, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { applyDocumentLanguage, getLocale, subscribeLocale } from './core';

/**
 * Giữ ngôn ngữ đang dùng cho toàn app. Đổi ngôn ngữ thì dựng lại toàn bộ cây giao diện (key = ngôn ngữ) để mọi chuỗi,
 * kể cả những chuỗi tra bằng hàm t() ngoài component hay nằm trong hằng số, đều lấy lại theo ngôn ngữ mới. Đổi ngôn ngữ
 * là thao tác hiếm nên chấp nhận mất trạng thái tạm của trang (ô đang nhập...); các nút đổi ngôn ngữ chỉ có ở thanh trên,
 * không có ở trình soạn thảo toàn màn hình.
 */
export default function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  useEffect(() => applyDocumentLanguage(), [locale]);
  return <Fragment key={locale}>{children}</Fragment>;
}
