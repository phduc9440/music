import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconMore } from '../viewer/ViewerIcons';
import { t } from '../../../i18n/core';

export interface MoreMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Chữ nhỏ bên phải (thường là phím tắt). */
  hint?: string;
  onClick: () => void;
}

/**
 * Menu "⋯" cuối thanh trên: gom các việc ít dùng (lịch sử phiên bản, toàn màn hình, phím tắt...) để thanh trên gọn.
 * Bấm ra ngoài hoặc nhấn Esc thì đóng.
 */
export default function ToolbarMoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="sc-menu" ref={ref}>
      <button
        className="sc-btn sv-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('editor.toolbar.more')}
        title={t('editor.toolbar.more')}
        onClick={() => setOpen(!open)}
      >
        <IconMore />
      </button>
      {open && (
        <ul className="sc-menu__list sv-more" role="menu">
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                role="menuitem"
                className="sc-menu__item"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                <span className="sv-more__label">
                  {item.icon}
                  {item.label}
                </span>
                {item.hint && <span className="sc-menu__hint">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
