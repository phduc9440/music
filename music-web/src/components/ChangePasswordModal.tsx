import { useState } from 'react';
import { toast } from 'react-toastify';
import { authApi } from '../services';
import { t, translateError } from '../i18n/core';

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
      toast.error(t('profile.password.mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await authApi.changePassword({ oldPassword, newPassword });
      toast.success(t('profile.password.changed'));
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (error) {
      toast.error(translateError(error, t('profile.password.failed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="auth-card modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3>{t('common.header.changePassword')}</h3>
          <button onClick={onClose} className="modal-close" disabled={isLoading}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('profile.password.current')}</label>
            <input
              type="password"
              className="form-control"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('profile.password.new')}</label>
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
            <label>{t('profile.password.confirm')}</label>
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
            {isLoading ? t('scores.edit.saving') : t('common.header.changePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
