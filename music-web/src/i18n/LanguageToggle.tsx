import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/ui';
import { LOCALES } from './core';
import type { Locale } from './core';
import { useChangeLocale, useI18n } from './useI18n';
import '../theme/theme-toggle.css';
import './language-toggle.css';

/** Tên mỗi ngôn ngữ luôn viết bằng chính ngôn ngữ đó để người dùng nhận ra dù đang ở ngôn ngữ nào. */
const NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' }; // i18n-ignore

/** Nút đổi ngôn ngữ VI / EN ở thanh trên (trang người dùng, quản trị, khách và đăng nhập). */
export default function LanguageToggle() {
  const { locale, t } = useI18n();
  const changeLocale = useChangeLocale();
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

  const label = t('common.language.label', { name: NAMES[locale] });

  return (
    <div className="theme-toggle language-toggle" ref={ref}>
      <button
        type="button"
        className="theme-toggle__trigger language-toggle__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="globe" size={16} />
        {locale.toUpperCase()}
      </button>
      {open && (
        <div className="theme-toggle__panel" role="menu">
          {LOCALES.map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={locale === key}
              lang={key}
              className={`theme-toggle__item${locale === key ? ' theme-toggle__item--active' : ''}`}
              onClick={() => {
                changeLocale(key);
                setOpen(false);
              }}
            >
              {NAMES[key]}
              {locale === key && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
