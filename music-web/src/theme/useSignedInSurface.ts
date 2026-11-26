import { useEffect } from 'react';

/**
 * Giao diện đã đăng nhập (người dùng và admin): gắn class ui-signed-in lên <html> để thẻ / khung nội dung nền trắng thay
 * vì kem cam (tokens.css, :root.ui-signed-in). Gắn lên <html> để cả hộp thoại render ra ngoài layout cũng theo.
 */
export function useSignedInSurface(): void {
  useEffect(() => {
    document.documentElement.classList.add('ui-signed-in');
    return () => document.documentElement.classList.remove('ui-signed-in');
  }, []);
}
