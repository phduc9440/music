import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from '../routes/transition-nav';
import { useNavigate } from '../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import { authApi } from '../services';
import { completeLogin } from '../utils/auth';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { Icon } from '../components/ui';
import NoteField from '../components/ui/NoteField';
import PianoBackdrop from '../components/ui/PianoBackdrop';
import ThemeToggle from '../theme/ThemeToggle';
import { t, translateError } from '../i18n/core';
import LanguageToggle from '../i18n/LanguageToggle';
import './login.css';

/** Quên mật khẩu đi ba bước tách riêng: forgot (nhập email) → verify (nhập OTP) → reset (đặt mật khẩu mới). */
type ViewMode = 'login' | 'register' | 'forgot' | 'verify' | 'reset';

const RESET_STEPS: Partial<Record<ViewMode, number>> = { forgot: 1, verify: 2, reset: 3 };
/** Mã lỗi phiên đặt lại mật khẩu hết hạn hoặc sai (BE: RESET_SESSION_INVALID): phải xin mã OTP mới. */
const RESET_SESSION_INVALID = 1019;

type ApiErr = {
  response?: { data?: { code?: number; message?: string; result?: { retryAfterSeconds?: number } } };
  message?: string;
};

const apiError = (error: unknown) => translateError(error, (error as ApiErr).message || t('auth.genericError'));

/** Số giây phải chờ khi backend báo xin mã OTP quá sớm (OTP_REQUEST_TOO_SOON). */
const retryAfter = (error: unknown) => (error as ApiErr).response?.data?.result?.retryAfterSeconds ?? 0;

const STAGE_POINTS = [
  { icon: 'upload', key: 'capture' },
  { icon: 'edit', key: 'edit' },
  { icon: 'play', key: 'practice' },
] as const;

/** Ô mật khẩu có nút hiện / ẩn (nhãn đọc được bằng trình đọc màn hình, trạng thái qua aria-pressed). */
function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input {...props} type={show ? 'text' : 'password'} />
      <button
        type="button"
        className="pw-field__toggle"
        aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={show}
        onClick={() => setShow((v) => !v)}
      >
        <Icon name={show ? 'lock' : 'eye'} size={18} />
      </button>
    </div>
  );
}

export default function Login() {
  // Link mời dạng /auth/login?ref=MÃ: mở sẵn form đăng ký và điền mã giới thiệu
  const [inviteCode] = useState(
    () => new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase() ?? '',
  );
  const [viewMode, setViewMode] = useState<ViewMode>(inviteCode ? 'register' : 'login');
  const [referralCode, setReferralCode] = useState(inviteCode);

  // Form State
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Mã phiên nhận được sau khi OTP đúng; chỉ có nó mới đặt được mật khẩu mới
  const [resetToken, setResetToken] = useState('');

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

  /** Chuyển màn hình; rời luồng quên mật khẩu thì xóa OTP, mã phiên và mật khẩu đã gõ. */
  const goTo = (mode: ViewMode) => {
    if (!RESET_STEPS[mode]) {
      setOtp('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setViewMode(mode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === 'reset' && newPassword !== confirmPassword) {
      toast.error(t('auth.passwordMismatch'));
      return;
    }
    setIsLoading(true);

    try {
      if (viewMode === 'login') {
        const response = await authApi.login({ username: email, password });
        const target = await completeLogin(response.data.result);
        toast.success(t('auth.toast.signedIn'));
        navigate(from ?? target, { replace: true });
      } else if (viewMode === 'register') {
        await authApi.register({ password, email, fullName, referralCode: referralCode.trim() || undefined });
        toast.success(t('auth.toast.registered'));
        setViewMode('login');
      } else if (viewMode === 'forgot') {
        await authApi.forgotPassword({ email });
        toast.success(t('auth.toast.otpSent'));
        setResendIn(60);
        setOtp('');
        setViewMode('verify');
      } else if (viewMode === 'verify') {
        // Bước 2: chỉ kiểm tra OTP; đúng mới mở bước đặt mật khẩu mới
        const res = await authApi.verifyResetOtp({ email, otp: otp.trim() });
        setResetToken(res.data.result.resetToken);
        setOtp('');
        toast.success(t('auth.toast.otpVerified'));
        setViewMode('reset');
      } else if (viewMode === 'reset') {
        await authApi.resetPassword({ email, resetToken, newPassword });
        toast.success(t('auth.toast.passwordReset'));
        setPassword('');
        goTo('login');
      }
    } catch (error) {
      toast.error(apiError(error));
      // Phiên đặt mật khẩu hết hạn (quá 10 phút): OTP cũ đã dùng, quay lại bước nhập mã để xin mã mới
      if (viewMode === 'reset' && (error as ApiErr).response?.data?.code === RESET_SESSION_INVALID) {
        setResetToken('');
        setViewMode('verify');
      }
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
    if (viewMode === 'verify') return t('auth.subtitle.verify');
    if (viewMode === 'reset') return t('auth.subtitle.reset');
    return '';
  };

  const getButtonText = () => {
    if (isLoading) return t('auth.button.processing');
    if (viewMode === 'login') return t('auth.button.login');
    if (viewMode === 'register') return t('auth.button.register');
    if (viewMode === 'forgot') return t('auth.button.forgot');
    if (viewMode === 'verify') return t('auth.button.verify');
    if (viewMode === 'reset') return t('auth.button.reset');
    return '';
  };

  return (
    <div className="auth-wrapper">
      <aside className="auth-stage">
        <Link to="/" className="auth-back">
          <Icon name="arrowLeft" size={16} />
          {t('auth.home')}
        </Link>
        <span className="auth-stage__glow" aria-hidden="true" />
        <span className="auth-stage__notes" aria-hidden="true">
          <NoteField />
        </span>
        <div className="auth-stage__body">
          <span className="auth-stage__brand">
            <span className="auth-stage__logo" aria-hidden="true">
              <Icon name="music" size={18} />
            </span>
            Music App
          </span>
          <h2>{t('home.guest.heroTitle')}</h2>
          <p>{t('home.guest.heroLead')}</p>
          <ul className="auth-stage__points">
            {STAGE_POINTS.map((p) => (
              <li key={p.key}>
                <span aria-hidden="true">
                  <Icon name={p.icon} size={16} />
                </span>
                <strong>{t(`home.guest.steps.${p.key}.title`)}</strong>
              </li>
            ))}
          </ul>
        </div>
        <PianoBackdrop />
      </aside>
      <div className="auth-theme">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-logo" aria-hidden="true">
            <Icon name="music" size={22} />
          </div>
          <h1>Music App</h1>
          {RESET_STEPS[viewMode] && (
            <div className="auth-step">{t('auth.step', { current: RESET_STEPS[viewMode], total: 3 })}</div>
          )}
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
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                // Đã gửi mã thì khóa email; muốn đổi email bấm "Đổi email" để quay lại bước 1
                disabled={(viewMode === 'verify' || viewMode === 'reset') && email !== ''}
              />
              {viewMode === 'verify' && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem', textAlign: 'left' }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      goTo('forgot');
                    }}
                  >
                    {t('auth.changeEmail')}
                  </a>
                </div>
              )}
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
                <PasswordInput
                  id="password"
                  className="form-control"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={viewMode === 'register' ? 8 : undefined}
                  autoComplete={viewMode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {/* Mã giới thiệu (chỉ khi đăng ký, không bắt buộc) */}
            {viewMode === 'register' && (
              <div className="form-group">
                <label htmlFor="referralCode">{t('auth.referralCode')}</label>
                <input
                  type="text"
                  id="referralCode"
                  className="form-control"
                  placeholder={t('auth.referralCodePlaceholder')}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  maxLength={16}
                  autoComplete="off"
                />
              </div>
            )}

            {/* Bước 2: chỉ nhập mã OTP */}
            {viewMode === 'verify' && (
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
                  autoFocus
                  pattern="\d{6}"
                />
                <div
                  style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: 'var(--ui-text-2)', textAlign: 'left' }}
                >
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

            {/* Bước 3: chỉ hiện sau khi OTP đúng; đặt mật khẩu mới và nhập lại để kiểm tra */}
            {viewMode === 'reset' && (
              <>
                <div className="form-group">
                  <label htmlFor="newPassword">{t('auth.newPassword')}</label>
                  <PasswordInput
                    id="newPassword"
                    className="form-control"
                    placeholder={t('auth.newPasswordPlaceholder')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
                  <PasswordInput
                    id="confirmPassword"
                    className="form-control"
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={confirmPassword !== '' && confirmPassword !== newPassword}
                  />
                  {confirmPassword !== '' && confirmPassword !== newPassword && (
                    <div
                      role="alert"
                      style={{
                        marginTop: '0.4rem',
                        fontSize: '0.8125rem',
                        color: 'var(--ui-danger)',
                        textAlign: 'left',
                      }}
                    >
                      {t('auth.passwordMismatch')}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Forgot Password Link (Only in Login) */}
            {viewMode === 'login' && (
              <div style={{ textAlign: 'right', marginBottom: '1rem', fontSize: '0.875rem' }}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    goTo('forgot');
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
            {/* Đăng ký bằng Google vẫn giữ được mã giới thiệu đã nhập */}
            {viewMode === 'register' && (
              <GoogleAuthButton setIsLoading={setIsLoading} redirectTo={from} referralCode={referralCode} />
            )}

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
              {RESET_STEPS[viewMode] && (
                <>
                  <span>{t('auth.rememberedPassword')} </span>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      goTo('login');
                    }}
                  >
                    {t('auth.backToLogin')}
                  </a>
                </>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
