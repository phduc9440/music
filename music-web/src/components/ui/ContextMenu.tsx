import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './context-menu.css';

/** Một dòng của menu chuột phải. */
export type MenuItem =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      /** Phím tắt hiện mờ ở bên phải (chỉ để nhắc, menu không tự bắt phím). */
      shortcut?: string;
      /** Dòng phụ nhỏ dưới nhãn. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Lý do bị tắt, hiện khi rê chuột. */
      disabledReason?: string;
      /** Menu con (mở khi rê chuột hoặc phím →). */
      children?: MenuItem[];
      onSelect?: () => void;
    }
  | { type: 'separator'; id: string }
  | { type: 'header'; id: string; label: string };

type ActionItem = Extract<MenuItem, { id: string; label: string }> & { type?: 'item' };

const isAction = (item: MenuItem): item is ActionItem => item.type === undefined || item.type === 'item';
const enabled = (item: MenuItem): item is ActionItem => isAction(item) && !item.disabled;

/** Khoảng cách tối thiểu tới mép màn hình (px). */
const EDGE = 8;

interface PanelProps {
  items: MenuItem[];
  /** Điểm mở menu gốc, hoặc khung của dòng cha với menu con. */
  anchor: { x: number; y: number } | DOMRect;
  level: number;
  label?: string;
  /** Có tiêu đề (ví dụ tên bản nhạc) ở đầu menu gốc. */
  title?: ReactNode;
  autoFocus: boolean;
  onCloseAll: () => void;
  onBack?: () => void;
}

/** Một tầng menu: tự đặt trong màn hình, điều khiển bằng chuột và bàn phím (↑ ↓ Home End Enter → ← Esc). */
function MenuPanel({ items, anchor, level, label, title, autoFocus, onCloseAll, onBack }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const [openSub, setOpenSub] = useState<{ index: number; rect: DOMRect; focus: boolean } | null>(null);
  const hoverTimer = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (anchor instanceof DOMRect) {
      left = anchor.right - 4;
      if (left + width > vw - EDGE) left = Math.max(EDGE, anchor.left - width + 4);
      top = anchor.top - 6;
    } else {
      left = anchor.x;
      top = anchor.y;
      if (left + width > vw - EDGE) left = Math.max(EDGE, anchor.x - width);
      if (top + height > vh - EDGE) top = Math.max(EDGE, anchor.y - height);
    }
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - height - EDGE));
    setPos({ left, top });
  }, [anchor]);

  // Mở menu thì đưa tiêu điểm vào và sáng dòng đầu tiên bấm được (chỉ một lần, không chạy lại khi trang vẽ lại các mục)
  const focused = useRef(false);
  useEffect(() => {
    if (!autoFocus || !pos || focused.current) return;
    focused.current = true;
    ref.current?.focus({ preventScroll: true });
    setActive(items.findIndex(enabled));
  }, [autoFocus, pos, items]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const buttonAt = (index: number) => ref.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`) ?? null;

  const openChildren = (index: number, focus: boolean) => {
    const button = buttonAt(index);
    if (!button) return;
    setOpenSub({ index, rect: button.getBoundingClientRect(), focus });
  };

  const choose = (item: ActionItem, index: number) => {
    if (item.disabled) return;
    if (item.children?.length) {
      openChildren(index, true);
      return;
    }
    onCloseAll();
    item.onSelect?.();
  };

  const move = (delta: 1 | -1) => {
    if (items.length === 0) return;
    let i = active;
    for (let step = 0; step < items.length; step++) {
      i = (i + delta + items.length) % items.length;
      if (enabled(items[i])) break;
    }
    setActive(i);
    buttonAt(i)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const item = items[active];
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home') setActive(items.findIndex(enabled));
    else if (e.key === 'End') setActive(items.length - 1 - [...items].reverse().findIndex(enabled));
    else if ((e.key === 'Enter' || e.key === ' ') && item && isAction(item)) choose(item, active);
    else if (e.key === 'ArrowRight' && item && isAction(item) && item.children?.length) openChildren(active, true);
    else if (e.key === 'ArrowLeft' && onBack) onBack();
    else if (e.key === 'Escape') {
      if (onBack) onBack();
      else onCloseAll();
    } else if (e.key === 'Tab') onCloseAll();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const sub = openSub ? items[openSub.index] : null;

  return (
    <>
      <div
        ref={ref}
        className="ui-ctx"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        data-level={level}
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: 'hidden' }}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {title && <div className="ui-ctx__title">{title}</div>}
        {items.map((item, index) => {
          if (item.type === 'separator') return <div key={item.id} className="ui-ctx__sep" role="separator" />;
          if (item.type === 'header') {
            return (
              <div key={item.id} className="ui-ctx__header" role="presentation">
                {item.label}
              </div>
            );
          }
          const hasChildren = !!item.children?.length;
          const isActive = index === active;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-index={index}
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? openSub?.index === index : undefined}
              aria-disabled={item.disabled || undefined}
              title={item.disabled ? item.disabledReason : undefined}
              className={`ui-ctx__item${item.danger ? ' is-danger' : ''}${isActive ? ' is-active' : ''}${
                item.disabled ? ' is-disabled' : ''
              }`}
              tabIndex={-1}
              onMouseEnter={() => {
                setActive(index);
                window.clearTimeout(hoverTimer.current);
                hoverTimer.current = window.setTimeout(() => {
                  if (hasChildren && !item.disabled) openChildren(index, false);
                  else setOpenSub(null);
                }, 120);
              }}
              onClick={() => choose(item, index)}
            >
              <span className="ui-ctx__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ui-ctx__label">
                {item.label}
                {item.hint && <span className="ui-ctx__hint">{item.hint}</span>}
              </span>
              {item.shortcut && <kbd className="ui-ctx__kbd">{item.shortcut}</kbd>}
              {hasChildren && (
                <svg className="ui-ctx__chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
      {sub && isAction(sub) && sub.children && openSub && (
        <MenuPanel
          key={sub.id}
          items={sub.children}
          anchor={openSub.rect}
          level={level + 1}
          label={sub.label}
          autoFocus={openSub.focus}
          onCloseAll={onCloseAll}
          onBack={() => {
            setOpenSub(null);
            ref.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}

export interface ContextMenuProps {
  /** Toạ độ màn hình nơi bấm chuột phải. */
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  /** Nhãn cho trình đọc màn hình. */
  label?: string;
  /** Dòng tiêu đề nhỏ ở đầu menu (ví dụ "Nốt Đô 4 · ô 12"). */
  title?: ReactNode;
}

/**
 * Menu chuột phải dùng chung (thư viện, trình chỉnh sửa): vẽ vào `document.body`, tự lật để không tràn màn hình, có
 * menu con, đóng khi bấm ra ngoài / cuộn / đổi kích thước cửa sổ / Esc.
 */
export default function ContextMenu({ x, y, items, onClose, label, title }: ContextMenuProps) {
  const [anchor] = useState(() => ({ x, y }));
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node && Array.from(document.querySelectorAll('.ui-ctx')).some((m) => m.contains(target));
    const onPointer = (e: Event) => {
      if (!inside(e.target)) close();
    };
    // Bỏ qua cú cuộn ngay sau khi mở (trang có thể tự cuộn nốt vừa được chọn vào vùng nhìn)
    const openedAt = performance.now();
    const onScroll = (e: Event) => {
      if (performance.now() - openedAt < 300 || inside(e.target)) return;
      close();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [close]);

  return createPortal(
    <MenuPanel items={items} anchor={anchor} level={0} label={label} title={title} autoFocus onCloseAll={close} />,
    document.body,
  );
}
