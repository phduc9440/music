import { useContext } from 'react';
import { ThemeContext } from './theme-context';
import type { ThemeContextValue } from './theme-context';

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme phải nằm trong <ThemeProvider>');
  return value;
}
