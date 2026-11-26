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

export interface AlertOptions {
  title: string;
  message: string;
  /** Dòng phụ nhỏ dưới tiêu đề (ví dụ thời gian gửi). */
  meta?: string;
  closeLabel?: string;
  icon?: 'info' | 'megaphone';
}

export interface DialogApi {
  /** Hộp thoại xác nhận của web (thay cho window.confirm): true nếu bấm xác nhận. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Hộp thoại nhập một dòng chữ (thay cho window.prompt): chuỗi đã nhập, hoặc null nếu bấm hủy. */
  prompt: (options: PromptOptions) => Promise<string | null>;
  /** Hộp thoại để đọc nội dung dài (thay cho window.alert), đóng bằng một nút. */
  alert: (options: AlertOptions) => Promise<void>;
}

export const DialogContext = createContext<DialogApi | null>(null);

/** Dùng trong component nằm dưới DialogProvider (đã gắn ở App). */
export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog phải dùng bên trong DialogProvider'); // i18n-ignore: lỗi cho lập trình viên
  return api;
}
