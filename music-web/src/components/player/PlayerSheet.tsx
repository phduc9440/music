import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface SheetTab {
  id: string;
  label: string;
}

interface Props {
  tabs: readonly SheetTab[];
  /** Id tab đang chọn (phải nằm trong `tabs`). */
  active: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Nút đã mở sheet: nhận lại focus khi đóng. */
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Nội dung của tab đang chọn. */
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet "Tùy chọn phát" trên điện thoại: vẽ vào document.body (thanh Player có backdrop-filter nên mọi phần tử
 * position: fixed bên trong nó bị tính theo thanh chứ không theo màn hình). Có hàng tab, khóa cuộn trang, Esc hoặc bấm
 * nền để đóng, Tab không thoát ra ngoài sheet.
 */
export function PlayerSheet({ tabs, active, onSelect, onClose, returnFocusRef, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;
  // Giữ onClose mới nhất mà không phải đăng ký lại sự kiện mỗi lần render
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Mở: focus vào tab đang chọn. Đóng: khóa cuộn được trả lại và focus về nút "⋯".
  useEffect(() => {
    const sheet = sheetRef.current;
    const trigger = returnFocusRef.current;
    sheet?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.tabIndex >= 0 && el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!sheetRef.current?.contains(current)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onSelect(tabs[next].id);
    sheetRef.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(tabs[next].id))}`)?.focus();
  };

  return createPortal(
    <div className="pl-sheet-root">
      <div className="pl-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={sheetRef} className="pl-sheet" role="dialog" aria-modal="true" aria-label="Tùy chọn phát">
        <div className="pl-sheet__grip" aria-hidden="true" />
        <div className="pl-sheet__tabs" role="tablist" aria-label="Nhóm tùy chọn">
          {tabs.map((tab, i) => {
            const selected = tab.id === active;
            return (
              <button
                key={tab.id}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                className={`pl-sheet__tab${selected ? ' pl-sheet__tab--active' : ''}`}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div id={panelId} className="pl-sheet__body" role="tabpanel" aria-labelledby={tabId(active)}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
