import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Nội dung nút mở (biểu tượng, nhãn ngắn). */
  trigger: ReactNode;
  /** Tên đọc được của nút và của hộp thoại. */
  label: string;
  /** Gợi ý khi rê chuột lên nút; mặc định dùng `label`. */
  title?: string;
  /** Khóa nút (không mở được). */
  disabled?: boolean;
  /** Thêm class cho nút (ví dụ để tô sáng khi đang bật). */
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * Nút mở hộp nổi của thanh Player (Tempo, Mixer, A-B...): đóng khi bấm ra ngoài hoặc nhấn Esc. Trên điện thoại hộp
 * hiện như tấm trượt từ đáy (xem player.css). Hộp có role="dialog" nên phím tắt của trang /play không chen vào.
 */
export function PlayerPopover({ trigger, label, title, disabled, buttonClassName, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pl-pop" ref={ref}>
      <button
        type="button"
        className={`pl-chip${open ? ' pl-chip--open' : ''}${buttonClassName ? ` ${buttonClassName}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open && !disabled}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={title ?? label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && !disabled && (
        <div id={panelId} className="pl-pop__panel" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
