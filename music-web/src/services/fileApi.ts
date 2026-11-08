import apiClient from './client';

/**
 * Với request responseType 'blob', thân lỗi của BE cũng là Blob nên err.response.data.message không đọc được. Hàm này
 * đọc Blob đó thành JSON và gắn lại vào err.response.data để getErrorMessage/getErrorCode dùng bình thường.
 */
export const unwrapBlobError = async (err: unknown): Promise<unknown> => {
  const response = (err as { response?: { data?: unknown } } | null)?.response;
  if (response?.data instanceof Blob) {
    try {
      response.data = JSON.parse(await response.data.text());
    } catch {
      // Thân lỗi không phải JSON (ví dụ trang lỗi của proxy): giữ nguyên
    }
  }
  return err;
};

/** Kích hoạt tải một Blob về máy bằng thẻ <a download>; thu hồi URL chậm một nhịp để trình duyệt kịp bắt đầu tải. */
export const saveBlob = (blob: Blob, fileName: string): void => {
  // Bỏ ký tự không hợp lệ trong tên file (Windows/macOS) để tên tải về không bị đổi lung tung
  // eslint-disable-next-line no-control-regex
  const safeName = fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'download';
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

/**
 * Tải file dạng blob kèm token. Link tải của BE có dạng "/api/files/{id}/download" còn baseURL của axios
 * đã có sẵn "/api" nên phải bỏ tiền tố "/api".
 */
export const fetchFileBlob = async (downloadUrl: string): Promise<Blob> => {
  const path = downloadUrl.replace(/^\/api/, '');
  try {
    const response = await apiClient.get<Blob>(path, { responseType: 'blob' });
    return response.data;
  } catch (err) {
    throw await unwrapBlobError(err);
  }
};

/** Tải file về máy: lấy blob rồi kích hoạt thẻ <a download>. */
export const downloadFile = async (downloadUrl: string, fileName: string): Promise<void> => {
  saveBlob(await fetchFileBlob(downloadUrl), fileName);
};
