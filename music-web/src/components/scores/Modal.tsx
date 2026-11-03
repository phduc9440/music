import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Hộp thoại dùng chung: đóng bằng phím Esc hoặc bấm ra ngoài. */
export default function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sc-modal-overlay" onClick={onClose}>
      <div className="sc-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sc-modal__header">
          <h3>{title}</h3>
          <button className="sc-icon-btn" onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
