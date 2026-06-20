import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { userApi } from '../api';
import { User } from '../types';
import ChangePasswordModal from '../components/ChangePasswordModal';

export default function UserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await userApi.getMe();
        setUser(response.data.result);
      } catch (error) {
        toast.error('Failed to load profile');
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/');
  };

  if (isLoading) return <div>Loading...</div>;

  const displayName = user?.fullName || user?.username || 'User';

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <span style={{ fontWeight: 600 }}>{displayName}</span>
          <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Logout</button>
        </div>
      </nav>

      <div className="dashboard-container" style={{ maxWidth: '600px' }}>
        <div className="glass-container" style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '100px', height: '100px', 
            background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))', 
            borderRadius: '50%', margin: '0 auto 1.5rem', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '2.5rem', fontWeight: 'bold', color: 'white' 
          }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>{displayName}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>@{user?.username}</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{user?.email || 'email@example.com'}</p>

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', textAlign: 'left' }}>
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--surface-border)', paddingBottom: '0.5rem' }}>Account Details</h3>
            <div className="d-flex justify-content-between mb-4">
              <span style={{ color: 'var(--text-secondary)' }}>Role:</span>
              <span className="badge badge-user">{user?.role || 'USER'}</span>
            </div>
            <div className="d-flex justify-content-between mb-4">
              <span style={{ color: 'var(--text-secondary)' }}>Account ID:</span>
              <span style={{ fontFamily: 'monospace' }}>{user?.id}</span>
            </div>
            <div className="d-flex justify-content-center mt-4">
              <button onClick={() => setIsPasswordModalOpen(true)} className="btn btn-primary" style={{ padding: '0.5rem 1.5rem' }}>
                Change Password
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <ChangePasswordModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)} 
      />
    </>
  );
}
