import { Outlet, ScrollRestoration } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import DialogProvider from '../components/ui/DialogProvider';
import { useRevealAll } from '../hooks/useReveal';
import { useTheme } from '../theme/useTheme';

/**
 * Gốc của mọi route: hộp thoại dùng chung và thông báo nổi (theo theme đang dùng). ScrollRestoration đưa trang mới về đầu
 * trang khi chuyển trang (kể cả khi trang trước đã cuộn xuống cuối) và khôi phục đúng vị trí cũ khi bấm Quay lại.
 */
export default function RootLayout() {
  const { resolved } = useTheme();
  useRevealAll();
  return (
    <DialogProvider>
      <Outlet />
      <ScrollRestoration />
      <ToastContainer theme={resolved} position="bottom-right" />
    </DialogProvider>
  );
}
