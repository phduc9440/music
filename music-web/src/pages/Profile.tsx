import { useCallback, useEffect, useRef, useState } from 'react';
import NotificationBell from '../components/NotificationBell';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi, userApi } from '../services';
import { AuthProvider } from '../types';
import type { Member } from '../types';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { roleLabel } from '../utils/auth';

export default function UserProfile() {
  const [user, setUser] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', address: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const applyMember = useCallback((m: Member) => {
    setUser(m);
    setForm({ fullName: m.fullName ?? '', phone: m.phone ?? '', address: m.address ?? '' });
  }, []);

  const handleLogout = useCallback(() => {
    authApi.logout().catch(() => undefined);
    localStorage.removeItem('role');
    navigate('/');
  }, [navigate]);

  const errMsg = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await userApi.updateMe(form);
      applyMember(res.data.result);
      toast.success('Đã cập nhật thông tin');
    } catch (error) {
      toast.error(errMsg(error, 'Cập nhật thất bại'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error('Ảnh đại diện phải là JPG hoặc PNG, tối đa 2MB');
      return;
    }
    setIsUploading(true);
    try {
      const res = await userApi.uploadAvatar(file);
      setUser(res.data.result);
      toast.success('Đã cập nhật ảnh đại diện');
    } catch (error) {
      toast.error(errMsg(error, 'Tải ảnh thất bại'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setIsUploading(true);
    try {
      const res = await userApi.deleteAvatar();
      setUser(res.data.result);
      toast.success('Đã xóa ảnh đại diện');
    } catch (error) {
      toast.error(errMsg(error, 'Xóa ảnh thất bại'));
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await userApi.getMe();
        applyMember(response.data.result);
      } catch {
        toast.error('Failed to load profile');
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [applyMember, handleLogout]);

  if (isLoading) return <div>Loading...</div>;

  const displayName = user?.fullName || user?.email || 'User';

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <NotificationBell />
          {localStorage.getItem('role') === 'ADMIN' && (
            <button
              className="btn"
              onClick={() => navigate('/admin')}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Quản trị
            </button>
          )}
          <button
            className="btn"
            onClick={() => navigate('/scores')}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Bản nhạc của tôi
          </button>
          <span style={{ fontWeight: 600 }}>{displayName}</span>
          <button
            onClick={handleLogout}
            className="btn btn-danger"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-container" style={{ maxWidth: '600px' }}>
        <div className="glass-container" style={{ textAlign: 'center' }}>
          <div style={{ margin: '0 auto 1.5rem', width: '100px' }}>
            <div
              style={{
                width: '100px',
                height: '100px',
                backgroundColor: 'var(--primary-color)',
                borderRadius: '50%',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                fontWeight: 'bold',
                color: 'white',
              }}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn"
                disabled={isUploading}
                onClick={() => fileInput.current?.click()}
                style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
              >
                {isUploading ? '...' : 'Đổi ảnh'}
              </button>
              {user?.avatarUrl && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isUploading}
                  onClick={handleAvatarDelete}
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Xóa
                </button>
              )}
            </div>
          </div>

          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.75rem' }}>{displayName}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{user?.email || 'email@example.com'}</p>

          <form onSubmit={handleSave} style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label>Họ tên</label>
              <input
                className="form-control"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                maxLength={255}
              />
            </div>
            <div className="form-group">
              <label>Số điện thoại</label>
              <input
                className="form-control"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={30}
              />
            </div>
            <div className="form-group">
              <label>Địa chỉ</label>
              <input
                className="form-control"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={255}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </form>

          <div
            style={{
              background: 'var(--background-dark)',
              border: '1px solid var(--surface-border)',
              padding: '1.5rem',
              borderRadius: '12px',
              textAlign: 'left',
            }}
          >
            <h3
              style={{
                marginBottom: '1rem',
                borderBottom: '1px solid var(--surface-border)',
                paddingBottom: '0.5rem',
              }}
            >
              Account Details
            </h3>
            <div className="d-flex justify-content-between mb-4">
              <span style={{ color: 'var(--text-secondary)' }}>Role:</span>
              <span className="badge badge-user">{user ? roleLabel(user) : 'USER'}</span>
            </div>
            <div className="d-flex justify-content-between mb-4">
              <span style={{ color: 'var(--text-secondary)' }}>Account ID:</span>
              <span style={{ fontFamily: 'monospace' }}>{user?.id}</span>
            </div>
            <div className="d-flex justify-content-center mt-4">
              {user?.authProvider !== AuthProvider.GOOGLE && (
                <button
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1.5rem' }}
                >
                  Change Password
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </>
  );
}
