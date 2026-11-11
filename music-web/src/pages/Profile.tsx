import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import { authApi, userApi } from '../services';
import { AuthProvider } from '../types';
import type { Member } from '../types';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ReferralCard from '../components/ReferralCard';
import { roleLabel } from '../utils/auth';
import '../components/scores/scores.css';
import './scores/library/ScoreLibrary.css';
import './Profile.css';
import { t } from '../i18n/core';

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
      toast.success(t('profile.updated'));
    } catch (error) {
      toast.error(errMsg(error, t('profile.updateFailed')));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error(t('errors.1014'));
      return;
    }
    setIsUploading(true);
    try {
      const res = await userApi.uploadAvatar(file);
      setUser(res.data.result);
      toast.success(t('profile.avatarUpdated'));
    } catch (error) {
      toast.error(errMsg(error, t('profile.avatarFailed')));
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setIsUploading(true);
    try {
      const res = await userApi.deleteAvatar();
      setUser(res.data.result);
      toast.success(t('profile.avatarRemoved'));
    } catch (error) {
      toast.error(errMsg(error, t('profile.avatarRemoveFailed')));
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
        toast.error(t('profile.loadFailed'));
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
        <main className="sc-container sc-container--form" aria-busy="true">
          <div className="sc-skeleton sc-skeleton--hero" />
        </main>
      </div>
    );
  }

  const displayName = user?.fullName || user?.email || t('common.header.account');
  const isGoogle = user?.authProvider === AuthProvider.GOOGLE;

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('common.header.profile')}</h1>
            <p>{t('profile.subtitle')}</p>
          </div>
        </header>

        <div className="pf-grid">
          <section className="reveal-item pf-card pf-identity">
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
              <button
                type="button"
                className="sc-btn sc-btn--sm"
                disabled={isUploading}
                onClick={() => fileInput.current?.click()}
              >
                {isUploading ? t('common.loading') : t('profile.changeAvatar')}
              </button>
              {user?.avatarUrl && (
                <button
                  type="button"
                  className="sc-btn sc-btn--sm sc-btn--danger"
                  disabled={isUploading}
                  onClick={handleAvatarDelete}
                >
                  {t('profile.removeAvatar')}
                </button>
              )}
            </div>
            <p className="pf-hint">{t('profile.avatarHint')}</p>
          </section>

          <div className="pf-stack">
            <section className="reveal-item pf-card">
              <h2 className="reveal-item pf-card__title">{t('profile.personal')}</h2>
              <form onSubmit={handleSave}>
                <label className="sc-label" htmlFor="pf-name">
                  {t('auth.fullName')}
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
                  {t('profile.phone')}
                </label>
                <input
                  id="pf-phone"
                  className="sc-input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={30}
                />
                <label className="sc-label" htmlFor="pf-address">
                  {t('profile.address')}
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
                    {isSaving ? t('scores.edit.saving') : t('scores.edit.saveChanges')}
                  </button>
                </div>
              </form>
            </section>

            <section className="reveal-item pf-card">
              <h2 className="reveal-item pf-card__title">{t('common.footer.account')}</h2>
              <dl className="pf-dl">
                <div>
                  <dt>{t('profile.signInWith')}</dt>
                  <dd>{isGoogle ? 'Google' : t('profile.emailPassword')}</dd>
                </div>
                <div>
                  <dt>{t('profile.role')}</dt>
                  <dd>{user ? roleLabel(user) : '—'}</dd>
                </div>
              </dl>
              {!isGoogle && (
                <div className="pf-form-actions">
                  <button type="button" className="sc-btn" onClick={() => setIsPasswordModalOpen(true)}>
                    {t('common.header.changePassword')}
                  </button>
                </div>
              )}
            </section>

            <ReferralCard />
          </div>
        </div>
      </main>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
    </div>
  );
}
