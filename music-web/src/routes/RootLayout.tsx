import { Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import DialogProvider from '../components/ui/DialogProvider';
import { useTheme } from '../theme/useTheme';

/** Gốc của mọi route: hộp thoại dùng chung và thông báo nổi (theo theme đang dùng). */
export default function RootLayout() {
  const { resolved } = useTheme();
  return (
    <DialogProvider>
      <Outlet />
      <ToastContainer theme={resolved} position="bottom-right" />
    </DialogProvider>
  );
}
