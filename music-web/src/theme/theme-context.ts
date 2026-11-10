import { createContext } from 'react';
import type { ResolvedTheme, ThemePreference } from './theme';

export interface ThemeContextValue {
  /** Lựa chọn của người dùng (sáng, tối, theo hệ thống). */
  preference: ThemePreference;
  /** Theme đang áp dụng; dùng để vẽ lại các thành phần cần màu từ CSS (biểu đồ, toast). */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
