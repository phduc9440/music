import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface HeroMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Chữ nhỏ bên phải (ví dụ lý do không bấm được). */
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  label: string;
  icon?: ReactNode;
  items: HeroMenuItem[];
  /** Chỉ hiện biểu tượng (nút "⋯"); tên nằm ở aria-label và chú thích. */
  iconOnly?: boolean;
}

/**
 * Nút menu thả xuống ở hàng thao tác của trang chi tiết (X-01): gom các việc ít dùng để hàng chính chỉ còn vài nút. Bấm ra
 * ngoài hoặc nhấn Esc thì đóng; mũi tên lên/xuống di chuyển giữa các mục.
 */
export default function HeroMenu({ label, icon, items, iconOnly }: Props) {
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

  const moveFocus = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  };

  if (items.length === 0) return null;
  return (
    <div className="sc-menu" ref={ref}>
      <button
        type="button"
        className={`sc-btn${iconOnly ? ' sd-actions__icon' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {!iconOnly && label}
      </button>
      {open && (
        <ul className="sc-menu__list sd-menu" role="menu" onKeyDown={moveFocus}>
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="sc-menu__item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                <span className="sd-menu__label">
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
