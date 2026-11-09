import { useState } from 'react';
import { toast } from 'react-toastify';
import { authApi } from '../services';

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
      toast.error('Mật khẩu mới nhập lại không khớp');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword({ oldPassword, newPassword });
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (error) {
      toast.error(
        (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Không đổi được mật khẩu',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="auth-card modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>Đổi mật khẩu</h3>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Mật khẩu hiện tại</label>
            <input
              type="password"
              className="form-control"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Mật khẩu mới (ít nhất 8 ký tự)</label>
            <input
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="form-group">
            <label>Nhập lại mật khẩu mới</label>
            <input
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={isLoading}
          >
            {isLoading ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </form>
      </div>
    </div>
  );
}
