import { useLocation } from 'react-router-dom';
import UserLayout from '../components/layout/UserLayout';
import GuestHome from '../pages/home/GuestHome';
import ProtectedRoute from './ProtectedRoute';

/**
 * Khung của khu người dùng. Riêng trang chủ "/" có hai bản cùng đường dẫn (mục 5.3): khách chưa đăng nhập thấy trang
 * giới thiệu, người đã đăng nhập thấy trang làm việc trong khung chung. Các trang khác vẫn bắt đăng nhập như cũ.
 * Giống ProtectedRoute, đây chỉ là chặn ở giao diện; quyền thật do backend kiểm tra.
 */
export default function UserArea() {
  const { pathname } = useLocation();
  if (pathname === '/' && !localStorage.getItem('role')) return <GuestHome />;
  return (
    <ProtectedRoute allowedRole="USER">
      <UserLayout />
    </ProtectedRoute>
  );
}
