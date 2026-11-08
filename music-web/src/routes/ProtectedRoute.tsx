import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * allowedRole="USER": any signed-in account (ADMIN has every USER permission).
 * allowedRole="ADMIN": ADMIN only; a USER is sent back to their profile.
 * This is a UI guard only; the backend rejects non-admin calls to /api/admin/** with 403.
 */
const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode; allowedRole: 'USER' | 'ADMIN' }) => {
  const location = useLocation();
  const role = localStorage.getItem('role');

  // Nhớ trang đang định vào (ví dụ liên kết chia sẻ /s/xxx) để quay lại sau khi đăng nhập
  if (!role) return <Navigate to="/auth/login" state={{ from: location.pathname + location.search }} />;
  if (allowedRole === 'ADMIN' && role !== 'ADMIN') return <Navigate to="/profile" />;

  return children;
};

export default ProtectedRoute;
