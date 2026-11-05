import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * allowedRole="USER": any signed-in account (ADMIN has every USER permission).
 * allowedRole="ADMIN": ADMIN only; a USER is sent back to their profile.
 * This is a UI guard only; the backend rejects non-admin calls to /api/admin/** with 403.
 */
const ProtectedRoute = ({ children, allowedRole }: { children: React.ReactNode; allowedRole: 'USER' | 'ADMIN' }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || !role) return <Navigate to="/auth/login" />;
  if (allowedRole === 'ADMIN' && role !== 'ADMIN') return <Navigate to="/profile" />;

  return children;
};

export default ProtectedRoute;
