import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, allowedRole }: { children: JSX.Element, allowedRole: string }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) return <Navigate to="/auth/login" />;
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={role === 'ADMIN' ? '/admin' : '/profile'} />;
  }

  return children;
};

export default ProtectedRoute;
