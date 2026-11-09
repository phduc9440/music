import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: nút xác nhận màu đỏ (xóa, khóa...); mặc định primary. */
  tone?: 'primary' | 'danger';
}

export interface PromptOptions extends ConfirmOptions {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  /** Bắt buộc nhập (không cho xác nhận khi để trống). */
  required?: boolean;
}

export interface DialogApi {
  /** Hộp thoại xác nhận của web (thay cho window.confirm): true nếu bấm xác nhận. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Hộp thoại nhập một dòng chữ (thay cho window.prompt): chuỗi đã nhập, hoặc null nếu bấm hủy. */
  prompt: (options: PromptOptions) => Promise<string | null>;
}

export const DialogContext = createContext<DialogApi | null>(null);

/** Dùng trong component nằm dưới DialogProvider (đã gắn ở App). */
export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog phải dùng bên trong DialogProvider');
  return api;
}
