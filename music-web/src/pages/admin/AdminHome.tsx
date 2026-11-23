import { Navigate, useOutletContext } from 'react-router-dom';
import type { AdminOutletContext } from '../../components/admin/AdminLayout';
import { visibleMenu } from '../../components/admin/adminMenu';
import Skeleton from '../../components/ui/Skeleton';
import { hasAdminPermission } from '../../utils/auth';
import AdminDashboard from './AdminDashboard';

/**
 * Trang /admin: bảng điều khiển nếu có quyền xem, không thì chuyển tới mục đầu tiên mà vai trò này được thấy (vai trò
 * tự tạo có thể không có quyền xem bảng điều khiển).
 */
export default function AdminHome() {
  const { admin } = useOutletContext<AdminOutletContext>();
  if (!admin) return <Skeleton lines={4} />;
  if (hasAdminPermission(admin, 'DASHBOARD_VIEW')) return <AdminDashboard />;
  const first = visibleMenu(admin)[0]?.items[0];
  return first ? <Navigate to={first.to} replace /> : <Navigate to="/" replace />;
}
