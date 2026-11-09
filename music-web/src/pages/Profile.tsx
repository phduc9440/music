import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi, userApi } from '../services';
import { AuthProvider } from '../types';
import type { Member } from '../types';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { roleLabel } from '../utils/auth';
import '../components/scores/scores.css';
import './scores/ScoreLibrary.css';
import './Profile.css';

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
        toast.error('Không tải được hồ sơ');
        handleLogout();
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [applyMember, handleLogout]);

  if (isLoading) {
    return (
      <div className="sc-page">
        <main className="sc-container" aria-busy="true">
          <div className="sc-skeleton sc-skeleton--hero" />
        </main>
      </div>
    );
  }

  const displayName = user?.fullName || user?.email || 'Tài khoản';
  const isGoogle = user?.authProvider === AuthProvider.GOOGLE;

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Hồ sơ của tôi</h1>
            <p>Thông tin cá nhân hiển thị với những người bạn chia sẻ bản nhạc.</p>
          </div>
        </header>

        <div className="pf-grid">
          <section className="pf-card pf-identity">
            <div className="pf-avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : displayName.charAt(0).toUpperCase()}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
            <h2 className="pf-name">{displayName}</h2>
            <p className="pf-email">{user?.email}</p>
            {user && <span className="sc-chip sc-chip--accent">{roleLabel(user)}</span>}
            <div className="pf-actions">
              <button type="button" className="sc-btn sc-btn--sm" disabled={isUploading} onClick={() => fileInput.current?.click()}>
                {isUploading ? 'Đang tải…' : 'Đổi ảnh'}
              </button>
              {user?.avatarUrl && (
                <button type="button" className="sc-btn sc-btn--sm sc-btn--danger" disabled={isUploading} onClick={handleAvatarDelete}>
                  Xóa ảnh
                </button>
              )}
            </div>
            <p className="pf-hint">JPG hoặc PNG, tối đa 2MB</p>
          </section>

          <div className="pf-stack">
            <section className="pf-card">
              <h2 className="pf-card__title">Thông tin cá nhân</h2>
              <form onSubmit={handleSave}>
                <label className="sc-label" htmlFor="pf-name">
                  Họ tên
                </label>
                <input
                  id="pf-name"
                  className="sc-input"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                  maxLength={255}
                />
                <label className="sc-label" htmlFor="pf-phone">
                  Số điện thoại
                </label>
                <input
                  id="pf-phone"
                  className="sc-input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={30}
                />
                <label className="sc-label" htmlFor="pf-address">
                  Địa chỉ
                </label>
                <input
                  id="pf-address"
                  className="sc-input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  maxLength={255}
                />
                <div className="pf-form-actions">
                  <button type="submit" className="sc-btn sc-btn--primary" disabled={isSaving}>
                    {isSaving ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </section>

            <section className="pf-card">
              <h2 className="pf-card__title">Tài khoản</h2>
              <dl className="pf-dl">
                <div>
                  <dt>Đăng nhập bằng</dt>
                  <dd>{isGoogle ? 'Google' : 'Email / mật khẩu'}</dd>
                </div>
                <div>
                  <dt>Vai trò</dt>
                  <dd>{user ? roleLabel(user) : '—'}</dd>
                </div>
                <div>
                  <dt>Mã tài khoản</dt>
                  <dd className="pf-mono">{user?.id}</dd>
                </div>
              </dl>
              {!isGoogle && (
                <div className="pf-form-actions">
                  <button type="button" className="sc-btn" onClick={() => setIsPasswordModalOpen(true)}>
                    Đổi mật khẩu
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </div>
  );
}
