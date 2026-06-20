import { useState } from 'react';
import { toast } from 'react-toastify';
import { authApi } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: Props) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword({ oldPassword, newPassword });
      toast.success('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="glass-container modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>Change Password</h3>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={oldPassword} 
              onChange={e => setOldPassword(e.target.value)} 
              required 
            />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              required 
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              required 
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
