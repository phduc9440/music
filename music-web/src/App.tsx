import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import UserProfile from './pages/User';
import AdminDashboard from './pages/Admin';

const ProtectedRoute = ({ children, allowedRole }: { children: JSX.Element, allowedRole: string }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) return <Navigate to="/" />;
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={role === 'ADMIN' ? '/admin' : '/user'} />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route 
          path="/user" 
          element={
            <ProtectedRoute allowedRole="USER">
              <UserProfile />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute allowedRole="ADMIN">
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
      </Routes>
      <ToastContainer theme="dark" position="bottom-right" />
    </Router>
  );
}

export default App;
