import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi } from '../services';
import { completeLogin } from '../utils/auth';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { Icon } from '../components/ui';
import ThemeToggle from '../theme/ThemeToggle';
import { t, translateError } from '../i18n/core';
import LanguageToggle from '../i18n/LanguageToggle';

type ViewMode = 'login' | 'register' | 'forgot' | 'reset';

type ApiErr = { response?: { data?: { message?: string; result?: { retryAfterSeconds?: number } } }; message?: string };

const apiError = (error: unknown) => translateError(error, (error as ApiErr).message || t('auth.genericError'));

/** Số giây phải chờ khi backend báo xin mã OTP quá sớm (OTP_REQUEST_TOO_SOON). */
const retryAfter = (error: unknown) => (error as ApiErr).response?.data?.result?.retryAfterSeconds ?? 0;

export default function Login() {
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Form State
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  // Đếm ngược trước khi được xin mã OTP mới (khớp giới hạn 60 giây của backend)
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from; // trang đang định vào trước khi bị chuyển sang đăng nhập

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (viewMode === 'login') {
        const response = await authApi.login({ username: email, password });
        const target = await completeLogin(response.data.result);
        toast.success(t('auth.toast.signedIn'));
        navigate(from ?? target, { replace: true });
      } else if (viewMode === 'register') {
        await authApi.register({ password, email, fullName });
        toast.success(t('auth.toast.registered'));
        setViewMode('login');
      } else if (viewMode === 'forgot') {
        await authApi.forgotPassword({ email });
        toast.success(t('auth.toast.otpSent'));
        setResendIn(60);
        setViewMode('reset');
      } else if (viewMode === 'reset') {
        await authApi.resetPassword({ email, otp, newPassword });
        toast.success(t('auth.toast.passwordReset'));
        setViewMode('login');
        setPassword('');
        setOtp('');
        setNewPassword('');
      }
    } catch (error) {
      toast.error(apiError(error));
      const wait = retryAfter(error);
      if (wait) setResendIn(wait);
    } finally {
      setIsLoading(false);
    }
  };

  const resendOtp = async () => {
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email });
      toast.success(t('auth.toast.otpResent'));
      setResendIn(60);
    } catch (error) {
      toast.error(apiError(error));
      const wait = retryAfter(error);
      if (wait) setResendIn(wait);
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    if (viewMode === 'login') return t('auth.subtitle.login');
    if (viewMode === 'register') return t('auth.subtitle.register');
    if (viewMode === 'forgot') return t('auth.subtitle.forgot');
    if (viewMode === 'reset') return t('auth.subtitle.reset');
    return '';
  };

  const getButtonText = () => {
    if (isLoading) return t('auth.button.processing');
    if (viewMode === 'login') return t('auth.button.login');
    if (viewMode === 'register') return t('auth.button.register');
    if (viewMode === 'forgot') return t('auth.button.forgot');
    if (viewMode === 'reset') return t('auth.button.reset');
    return '';
  };

  return (
    <div className="auth-wrapper">
      <Link to="/" className="auth-back">
        <Icon name="arrowLeft" size={16} />
        {t('auth.home')}
      </Link>
      <div className="auth-theme">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="auth-logo" aria-hidden="true">
          <Icon name="music" size={22} />
        </div>
        <h1>Music App</h1>
        <p>{getTitle()}</p>

        <form onSubmit={handleSubmit}>
          {/* Email (also the login identifier) */}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              className="form-control"
              placeholder="ban@vidu.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={viewMode === 'reset' && email !== ''}
            />
          </div>

          {/* Full Name (Used only in Register) */}
          {viewMode === 'register' && (
            <div className="form-group">
              <label htmlFor="fullName">{t('auth.fullName')}</label>
              <input
                type="text"
                id="fullName"
                className="form-control"
                placeholder={t('auth.fullNamePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          {/* Password (Used in Login, Register) */}
          {(viewMode === 'login' || viewMode === 'register') && (
            <div className="form-group">
              <label htmlFor="password">{t('auth.password')}</label>
              <input
                type="password"
                id="password"
                className="form-control"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={viewMode === 'register' ? 8 : undefined}
              />
            </div>
          )}

          {/* OTP (Used in Reset) */}
          {viewMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="otp">{t('auth.otp')}</label>
              <input
                type="text"
                id="otp"
                className="form-control"
                placeholder={t('auth.otpPlaceholder')}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: 'var(--ui-text-2)', textAlign: 'left' }}>
                {t('auth.noCode')}{' '}
                {resendIn > 0 ? (
                  <span>{t('auth.resendIn', { count: resendIn })}</span>
                ) : (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (!isLoading) resendOtp();
                    }}
                  >
                    {t('auth.resend')}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* New Password (Used in Reset) */}
          {viewMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="newPassword">{t('auth.newPassword')}</label>
              <input
                type="password"
                id="newPassword"
                className="form-control"
                placeholder={t('auth.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          )}

          {/* Forgot Password Link (Only in Login) */}
          {viewMode === 'login' && (
            <div style={{ textAlign: 'right', marginBottom: '1rem', fontSize: '0.875rem' }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setViewMode('forgot');
                }}
              >
                {t('auth.forgotLink')}
              </a>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: viewMode === 'login' ? '0' : '1rem' }}
            disabled={isLoading}
          >
            {getButtonText()}
          </button>

          {viewMode === 'login' && <GoogleAuthButton setIsLoading={setIsLoading} redirectTo={from} />}

          {/* Bottom links */}
          <div style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
            {viewMode === 'login' && (
              <>
                <span>{t('auth.noAccount')} </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('register');
                  }}
                >
                  {t('auth.registerNow')}
                </a>
              </>
            )}
            {viewMode === 'register' && (
              <>
                <span>{t('auth.haveAccount')} </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  {t('auth.button.login')}
                </a>
              </>
            )}
            {(viewMode === 'forgot' || viewMode === 'reset') && (
              <>
                <span>{t('auth.rememberedPassword')} </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  {t('auth.backToLogin')}
                </a>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
