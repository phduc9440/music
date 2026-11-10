import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Trang chỉ dành cho người chưa đăng nhập (trang chủ giới thiệu, đăng nhập, đăng ký...). Người đã đăng nhập mà gõ
 * thẳng đường dẫn vào thì được chuyển về hồ sơ. Giống ProtectedRoute, đây chỉ là chặn ở giao diện: phiên hết hạn thì
 * lần gọi API đầu tiên nhận 401 và dọn phiên, rồi đưa người dùng về trang đăng nhập.
 */
const GuestRoute = ({ children }: { children: React.ReactNode }) => {
  if (localStorage.getItem('role')) return <Navigate to="/profile" replace />;
  return children;
};

export default GuestRoute;
