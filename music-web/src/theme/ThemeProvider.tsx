import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { userApi } from '../services/auth/userApi';
import { ThemeContext } from './theme-context';
import {
  THEME_CHANGE_EVENT,
  applyTheme,
  getStoredPreference,
  storePreference,
  systemPrefersDark,
  toServerTheme,
} from './theme';
import type { ResolvedTheme, ThemePreference } from './theme';

/**
 * Giữ lựa chọn theme của người dùng: áp lên <html>, lưu ở trình duyệt, đẩy lên server khi đã đăng nhập (để đồng bộ giữa
 * các máy) và tự đổi khi hệ điều hành đổi sáng/tối lúc đang chọn "theo hệ thống".
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  // Hệ điều hành đang ở chế độ tối? Chỉ dùng khi lựa chọn là "theo hệ thống"
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  // Áp theme lên <html> mỗi khi theme đang dùng đổi
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Hệ điều hành đổi sáng/tối thì cập nhật (có tác dụng khi đang chọn "theo hệ thống")
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Lựa chọn đổi từ bên ngoài React (vừa tải hồ sơ có lựa chọn lưu trên server)
  useEffect(() => {
    const onExternal = (event: Event) => setPreferenceState((event as CustomEvent<ThemePreference>).detail);
    window.addEventListener(THEME_CHANGE_EVENT, onExternal);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onExternal);
  }, []);

  // Đổi ở tab khác thì tab này đổi theo
  useEffect(() => {
    const onStorage = () => setPreferenceState(getStoredPreference());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    storePreference(next);
    setPreferenceState(next);
    // Đã đăng nhập thì lưu lên server; lỗi mạng chỉ mất đồng bộ, giao diện vẫn đổi bình thường
    if (localStorage.getItem('role')) {
      userApi.updateTheme(toServerTheme(next)).catch(() => undefined);
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
