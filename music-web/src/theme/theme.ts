/*
 * Logic theme không phụ thuộc React: đọc/ghi lựa chọn, tính theme đang dùng và đặt data-theme lên <html>.
 * Đoạn script trong index.html làm đúng ba việc đầu của file này trước khi React chạy; sửa một nơi thì sửa cả nơi kia.
 */

/** Lựa chọn của người dùng. "system" là theo cài đặt sáng/tối của hệ điều hành. */
export type ThemePreference = 'light' | 'dark' | 'system';
/** Theme đang áp dụng lên giao diện. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
/** Phát khi lựa chọn đổi từ bên ngoài React (ví dụ vừa tải hồ sơ có lựa chọn đã lưu trên server). */
export const THEME_CHANGE_EVENT = 'app-theme-change';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

/** Lựa chọn đã lưu trong trình duyệt; chưa có hoặc không đọc được thì theo hệ thống. */
export function getStoredPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : 'system';
  } catch {
    return 'system'; // trình duyệt chặn localStorage (chế độ riêng tư...)
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // không lưu được thì chỉ mất lựa chọn sau khi tải lại trang
  }
}

/** Hệ điều hành đang ở chế độ tối? */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Đặt data-theme lên <html>; tokens.css đổi toàn bộ biến màu theo thuộc tính này. */
export function applyTheme(theme: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/** Giá trị server (LIGHT/DARK/SYSTEM) sang lựa chọn ở web; null (chưa chọn) thì không đổi gì. */
export function fromServerTheme(value: string | null | undefined): ThemePreference | null {
  const lower = value?.toLowerCase();
  return isPreference(lower) ? lower : null;
}

export function toServerTheme(preference: ThemePreference): 'LIGHT' | 'DARK' | 'SYSTEM' {
  return preference.toUpperCase() as 'LIGHT' | 'DARK' | 'SYSTEM';
}

/**
 * Áp lựa chọn đã lưu trên server khi vừa đăng nhập hoặc tải hồ sơ, để giao diện đi theo tài khoản giữa các máy.
 * Chưa từng chọn (null) thì giữ lựa chọn của trình duyệt này.
 */
export function adoptServerTheme(value: string | null | undefined): void {
  const preference = fromServerTheme(value);
  if (!preference) return;
  storePreference(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: preference }));
}
