import { getExtension } from './score';

/**
 * File khách thả vào trang chủ trước khi đăng nhập. Giữ trong bộ nhớ (đăng nhập là chuyển trang trong app, không tải
 * lại trang) để trang tải lên lấy lại sau khi đăng nhập xong. Tải lại trình duyệt thì mất, người dùng chọn lại file.
 */
let pending: File[] | null = null;

const IMPORT_EXTENSIONS = ['musicxml', 'xml', 'mxl', 'mid', 'midi'];

/** Toàn bộ là MusicXML/MIDI thì đi đường nhập file, còn lại (PDF, ảnh) đi đường số hóa OMR. */
export const isImportBatch = (files: File[]): boolean =>
  files.length > 0 && files.every((f) => IMPORT_EXTENSIONS.includes(getExtension(f.name)));

export function setPendingUpload(files: File[]): void {
  pending = files.length > 0 ? files : null;
}

/** Xem file đang chờ (nếu có), chưa xóa. Trang dùng file gọi clearPendingUpload sau khi đã lấy. */
export function peekPendingUpload(): File[] | null {
  return pending;
}

export function clearPendingUpload(): void {
  pending = null;
}
