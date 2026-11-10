import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '../ui';
import { isGroupActive, isItemActive } from './nav';
import type { NavGroup } from './nav';

interface Props {
  group: NavGroup;
  pathname: string;
  /** Gọi khi người dùng chọn một mục (để đóng ngăn điều hướng trên điện thoại). */
  onNavigate: () => void;
}

/**
 * Một nhóm điều hướng. Máy tính: nút mở menu thả xuống (đóng khi bấm ra ngoài, nhấn Esc hoặc chọn mục).
 * Điện thoại: nhóm hiện sẵn dưới dạng tiêu đề và danh sách trong ngăn điều hướng (CSS quyết định, không cần JS).
 */
export default function NavDropdown({ group, pathname, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isGroupActive(group, pathname);

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

  const panelId = `nav-group-${group.id}`;

  return (
    <div className={`app-navgroup${open ? ' app-navgroup--open' : ''}`} ref={ref}>
      <button
        type="button"
        className={`app-nav__item app-navgroup__trigger${active ? ' app-nav__item--active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {group.label}
        <Icon name="chevronDown" size={14} />
      </button>
      <div className="app-navgroup__label">{group.label}</div>
      <div id={panelId} className="app-navgroup__panel" role="menu">
        {group.items.map((item) => {
          const itemActive = isItemActive(item, pathname);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              role="menuitem"
              className={() => `app-navgroup__item${itemActive ? ' app-navgroup__item--active' : ''}`}
              aria-current={itemActive ? 'page' : undefined}
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
