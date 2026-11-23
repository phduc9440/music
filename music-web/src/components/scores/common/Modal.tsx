import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../../i18n/core';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Lớp CSS thêm cho hộp thoại (ví dụ để mở rộng chiều ngang). */
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Các phần tử nhận được focus trong hộp thoại, theo thứ tự Tab. */
const focusablesIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert'));

/**
 * Hộp thoại dùng chung: đóng bằng phím Esc hoặc bấm ra ngoài. Quản lý focus như hộp thoại chuẩn: mở thì đưa focus vào
 * trong (giữ ô có autoFocus nếu có), Tab / Shift+Tab chỉ đi vòng trong hộp, đóng thì trả focus về chỗ đã mở hộp.
 */
export default function Modal({ title, onClose, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Giữ onClose mới nhất mà không chạy lại phần gắn focus (nhiều nơi truyền hàm mới mỗi lần render)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.contains(document.activeElement)) {
      const items = focusablesIn(dialog);
      // Ưu tiên ô nhập / nút trong nội dung hơn nút đóng ở góc
      const preferred = items.find((el) => !el.classList.contains('sc-icon-btn')) ?? items[0];
      (preferred ?? dialog).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusablesIn(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={className ? `sc-modal ${className}` : 'sc-modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sc-modal__header">
          <h3>{title}</h3>
          <button className="sc-icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
