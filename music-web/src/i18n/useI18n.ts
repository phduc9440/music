import { useCallback, useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale, t, toServerLocale } from './core';
import type { Locale } from './core';
import { userApi } from '../services';

/** Ngôn ngữ đang dùng và hàm t() cho component (cùng hàm t() dùng được ngoài component). */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  return { locale, t };
}

/** Chọn ngôn ngữ: đổi ngay, lưu ở trình duyệt, đã đăng nhập thì lưu lên server để đi theo tài khoản. */
export function useChangeLocale() {
  return useCallback((locale: Locale) => {
    setLocale(locale);
    // Lỗi mạng chỉ mất đồng bộ giữa các máy, giao diện vẫn đổi bình thường
    if (localStorage.getItem('role')) userApi.updateLocale(toServerLocale(locale)).catch(() => undefined);
  }, []);
}
