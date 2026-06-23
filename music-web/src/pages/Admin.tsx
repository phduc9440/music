import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { adminApi } from '../services';
import type { User } from '../types';
import ChangePasswordModal from '../components/ChangePasswordModal';

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  
  // Form State
  const [formId, setFormId] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    loadAdmin();
    loadAccounts();
  }, []);

  const loadAdmin = async () => {
    try {
      const res = await adminApi.getMe();
      setAdmin(res.data.result);
    } catch (error) {
      toast.error('Failed to load admin profile');
    }
  };

  const loadAccounts = async () => {
    try {
      const res = await adminApi.getAccounts({ page: 1, size: 20 });
      setAccounts(res.data.result.data || []);
    } catch (error) {
      toast.error('Failed to load accounts');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/');
  };

  const openModal = (editMode = false, acc?: User) => {
    setIsEditMode(editMode);
    setIsModalOpen(true);
    if (editMode && acc) {
      setFormId(acc.id);
      setUsername(acc.username);
      setEmail(acc.email);
      setFullName(acc.fullName);
      setPassword('');
    } else {
      setFormId('');
      setUsername('');
      setEmail('');
      setFullName('');
      setPassword('');
    }
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { username, email, fullName };
    if (password) payload.password = password;

    try {
      if (isEditMode) {
        await adminApi.updateAccount(formId, payload);
        toast.success('Account updated successfully');
      } else {
        await adminApi.createAccount(payload);
        toast.success('Account created successfully');
      }
      closeModal();
      loadAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save account');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      try {
        await adminApi.deleteAccount(id);
        toast.success('Account deleted successfully');
        loadAccounts();
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Failed to delete account');
      }
    }
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">Admin Panel</div>
        <div className="navbar-nav">
          <span style={{ fontWeight: 600 }}>{admin?.fullName || 'Admin'}</span>
          {admin?.authProvider !== 'GOOGLE' && (
            <button onClick={() => setIsPasswordModalOpen(true)} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Change Password</button>
          )}
          <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Logout</button>
        </div>
      </nav>

      <div className="dashboard-container">
        <div className="glass-container">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>Account Management</h2>
            <button onClick={() => openModal(false)} className="btn btn-primary">Add Account</button>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Full Name</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{acc.id.substring(0,8)}...</td>
                    <td>{acc.username}</td>
                    <td>{acc.email}</td>
                    <td>{acc.fullName}</td>
                    <td><span className={`badge ${acc.role === 'ADMIN' ? 'badge-admin' : 'badge-user'}`}>{acc.role}</span></td>
                    <td>
                      <div className="d-flex gap-2">
                        <button onClick={() => openModal(true, acc)} className="btn btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Edit</button>
                        <button onClick={() => handleDelete(acc.id)} className="btn btn-danger" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={`modal-overlay ${isModalOpen ? 'active' : ''}`}>
        <div className="glass-container modal-content">
          <div className="modal-header">
            <h3>{isEditMode ? 'Edit Account' : 'Add Account'}</h3>
            <button onClick={closeModal} className="modal-close">&times;</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Username</label>
              <input type="text" className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" className="form-control" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" className="form-control" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password {isEditMode && '(Leave empty to keep current)'}</label>
              <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required={!isEditMode} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Save Account</button>
          </form>
        </div>
      </div>

      <ChangePasswordModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)} 
      />
    </>
  );
}
