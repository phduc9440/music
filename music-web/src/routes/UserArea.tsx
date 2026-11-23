import { useLocation } from 'react-router-dom';
import UserLayout from '../components/layout/UserLayout';
import GuestHome from '../pages/home/GuestHome';
import GuestLayout from '../components/layout/GuestLayout';
import ProtectedRoute from './ProtectedRoute';
import { isGuest } from '../utils/session';

/**
 * Trang công khai: khách chưa đăng nhập xem được mà không bị bắt đăng nhập (chỉ đọc; việc cần tài khoản như bình chọn,
 * trả lời, lưu playlist, mua gói hiện nút đăng nhập). /forum/new và /forum/threads/:id/edit vẫn cần đăng nhập.
 */
const GUEST_PATHS = [/^\/explore$/, /^\/composers(\/[^/]+)?$/, /^\/pricing$/, /^\/forum$/, /^\/forum\/threads\/[^/]+$/];

/**
 * Khung của khu người dùng. Riêng trang chủ "/" có hai bản cùng đường dẫn (mục 5.3): khách chưa đăng nhập thấy trang
 * giới thiệu, người đã đăng nhập thấy trang làm việc trong khung chung. Các trang khác vẫn bắt đăng nhập như cũ.
 * Giống ProtectedRoute, đây chỉ là chặn ở giao diện; quyền thật do backend kiểm tra.
 */
export default function UserArea() {
  const { pathname } = useLocation();
  if (pathname === '/' && isGuest()) return <GuestHome />;
  if (isGuest() && GUEST_PATHS.some((re) => re.test(pathname))) return <GuestLayout />;
  return (
    <ProtectedRoute allowedRole="USER">
      <UserLayout />
    </ProtectedRoute>
  );
}
