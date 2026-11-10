import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import type { IconName } from '../components/ui';
import { THEME_PREFERENCES } from './theme';
import type { ThemePreference } from './theme';
import { useTheme } from './useTheme';
import './theme-toggle.css';

const OPTIONS: Record<ThemePreference, { label: string; icon: IconName }> = {
  light: { label: 'Sáng', icon: 'sun' },
  dark: { label: 'Tối', icon: 'moon' },
  system: { label: 'Theo hệ thống', icon: 'monitor' },
};

/** Nút chọn giao diện Sáng / Tối / Theo hệ thống, dùng ở thanh trên của trang người dùng, quản trị và trang khách. */
export default function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="theme-toggle" ref={ref}>
      <button
        type="button"
        className="theme-toggle__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Giao diện: ${OPTIONS[preference].label}`}
        title={`Giao diện: ${OPTIONS[preference].label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={resolved === 'dark' ? 'moon' : 'sun'} size={18} />
      </button>
      {open && (
        <div className="theme-toggle__panel" role="menu">
          {THEME_PREFERENCES.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={preference === key}
              className={`theme-toggle__item${preference === key ? ' theme-toggle__item--active' : ''}`}
              onClick={() => {
                setPreference(key);
                setOpen(false);
              }}
            >
              <Icon name={OPTIONS[key].icon} size={16} />
              {OPTIONS[key].label}
              {preference === key && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
