import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi } from '../services';
import { completeLogin } from '../utils/auth';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { Icon } from '../components/ui';
import ThemeToggle from '../theme/ThemeToggle';

type ViewMode = 'login' | 'register' | 'forgot' | 'reset';

type ApiErr = { response?: { data?: { message?: string; result?: { retryAfterSeconds?: number } } }; message?: string };

const apiError = (error: unknown) =>
  (error as ApiErr).response?.data?.message || (error as ApiErr).message || 'Có lỗi xảy ra, vui lòng thử lại';

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
        toast.success('Đăng nhập thành công');
        navigate(from ?? target, { replace: true });
      } else if (viewMode === 'register') {
        await authApi.register({ password, email, fullName });
        toast.success('Đăng ký thành công, vui lòng đăng nhập');
        setViewMode('login');
      } else if (viewMode === 'forgot') {
        await authApi.forgotPassword({ email });
        toast.success('Nếu email đã đăng ký, mã OTP sẽ được gửi tới hộp thư trong ít phút');
        setResendIn(60);
        setViewMode('reset');
      } else if (viewMode === 'reset') {
        await authApi.resetPassword({ email, otp, newPassword });
        toast.success('Đã đặt lại mật khẩu, vui lòng đăng nhập');
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
      toast.success('Đã gửi lại mã OTP');
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
    if (viewMode === 'login') return 'Đăng nhập để vào thư viện bản nhạc của bạn.';
    if (viewMode === 'register') return 'Tạo tài khoản mới để bắt đầu.';
    if (viewMode === 'forgot') return 'Nhập email để nhận mã OTP.';
    if (viewMode === 'reset') return 'Nhập mã OTP và mật khẩu mới.';
    return '';
  };

  const getButtonText = () => {
    if (isLoading) return 'Đang xử lý…';
    if (viewMode === 'login') return 'Đăng nhập';
    if (viewMode === 'register') return 'Đăng ký';
    if (viewMode === 'forgot') return 'Gửi mã OTP';
    if (viewMode === 'reset') return 'Đặt lại mật khẩu';
    return '';
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-theme">
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
              <label htmlFor="fullName">Họ tên</label>
              <input
                type="text"
                id="fullName"
                className="form-control"
                placeholder="Nguyễn Văn A"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          {/* Password (Used in Login, Register) */}
          {(viewMode === 'login' || viewMode === 'register') && (
            <div className="form-group">
              <label htmlFor="password">Mật khẩu</label>
              <input
                type="password"
                id="password"
                className="form-control"
                placeholder="Nhập mật khẩu"
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
              <label htmlFor="otp">Mã OTP</label>
              <input
                type="text"
                id="otp"
                className="form-control"
                placeholder="6 chữ số"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <div style={{ marginTop: '0.4rem', fontSize: '0.8125rem', color: 'var(--ui-text-2)', textAlign: 'left' }}>
                Không nhận được mã?{' '}
                {resendIn > 0 ? (
                  <span>Gửi lại sau {resendIn} giây</span>
                ) : (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (!isLoading) resendOtp();
                    }}
                  >
                    Gửi lại mã
                  </a>
                )}
              </div>
            </div>
          )}

          {/* New Password (Used in Reset) */}
          {viewMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="newPassword">Mật khẩu mới</label>
              <input
                type="password"
                id="newPassword"
                className="form-control"
                placeholder="Ít nhất 8 ký tự"
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
                Quên mật khẩu?
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
                <span>Chưa có tài khoản? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('register');
                  }}
                >
                  Đăng ký ngay
                </a>
              </>
            )}
            {viewMode === 'register' && (
              <>
                <span>Đã có tài khoản? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  Đăng nhập
                </a>
              </>
            )}
            {(viewMode === 'forgot' || viewMode === 'reset') && (
              <>
                <span>Đã nhớ mật khẩu? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  Quay lại đăng nhập
                </a>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
