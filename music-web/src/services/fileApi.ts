import apiClient from './client';

/**
 * Tải file dạng blob kèm token. Link tải của BE có dạng "/api/files/{id}/download" còn baseURL của axios
 * đã có sẵn "/api" nên phải bỏ tiền tố "/api".
 */
export const fetchFileBlob = async (downloadUrl: string): Promise<Blob> => {
  const path = downloadUrl.replace(/^\/api/, '');
  const response = await apiClient.get<Blob>(path, { responseType: 'blob' });
  return response.data;
};

/** Tải file về máy: lấy blob rồi kích hoạt thẻ <a download>. */
export const downloadFile = async (downloadUrl: string, fileName: string): Promise<void> => {
  const blob = await fetchFileBlob(downloadUrl);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
};
