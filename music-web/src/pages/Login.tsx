import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi, userApi, adminApi } from '../services';
import GoogleAuthButton from '../components/GoogleAuthButton';

type ViewMode = 'login' | 'register' | 'forgot' | 'reset';

export default function Login() {
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (viewMode === 'login') {
        const response = await authApi.login({ username, password });
        localStorage.setItem('token', response.data.result.token);

        try {
          await userApi.getMe();
          localStorage.setItem('role', 'USER');
          toast.success('Login successful!');
          navigate('/profile');
        } catch (err) {
          try {
            await adminApi.getMe();
            localStorage.setItem('role', 'ADMIN');
            toast.success('Login successful!');
            navigate('/admin');
          } catch (err2) {
            toast.error('Could not fetch user/admin profile.');
          }
        }
      } else if (viewMode === 'register') {
        await authApi.register({ username, password, email, fullName });
        toast.success('Registration successful! Please login.');
        setViewMode('login');
      } else if (viewMode === 'forgot') {
        await authApi.forgotPassword({ email });
        toast.success('OTP has been sent to your email.');
        setViewMode('reset');
      } else if (viewMode === 'reset') {
        await authApi.resetPassword({ email, otp, newPassword });
        toast.success('Password has been reset successfully! Please login.');
        setViewMode('login');
        setPassword('');
        setOtp('');
        setNewPassword('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    if (viewMode === 'login') return 'Welcome back! Please login to your account.';
    if (viewMode === 'register') return 'Create a new account to get started.';
    if (viewMode === 'forgot') return 'Enter your email to receive an OTP.';
    if (viewMode === 'reset') return 'Enter OTP and your new password.';
    return '';
  };

  const getButtonText = () => {
    if (isLoading) return 'Processing...';
    if (viewMode === 'login') return 'Login';
    if (viewMode === 'register') return 'Register';
    if (viewMode === 'forgot') return 'Send OTP';
    if (viewMode === 'reset') return 'Reset Password';
    return '';
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-container auth-card">
        <h1>Music App</h1>
        <p>{getTitle()}</p>

        <form onSubmit={handleSubmit}>
          {/* Email (Used in Register, Forgot, Reset) */}
          {viewMode !== 'login' && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                className="form-control"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={viewMode === 'reset' && email !== ''}
              />
            </div>
          )}

          {/* Full Name (Used only in Register) */}
          {viewMode === 'register' && (
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                className="form-control"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          {/* Username (Used in Login, Register) */}
          {(viewMode === 'login' || viewMode === 'register') && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                className="form-control"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          {/* Password (Used in Login, Register) */}
          {(viewMode === 'login' || viewMode === 'register') && (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                className="form-control"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {/* OTP (Used in Reset) */}
          {viewMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="otp">OTP Code</label>
              <input
                type="text"
                id="otp"
                className="form-control"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                maxLength={6}
              />
            </div>
          )}

          {/* New Password (Used in Reset) */}
          {viewMode === 'reset' && (
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                className="form-control"
                placeholder="Enter new password"
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
                Forgot password?
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

          {viewMode === 'login' && <GoogleAuthButton setIsLoading={setIsLoading} />}

          {/* Bottom links */}
          <div style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
            {viewMode === 'login' && (
              <>
                <span>Don't have an account? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('register');
                  }}
                >
                  Register now
                </a>
              </>
            )}
            {viewMode === 'register' && (
              <>
                <span>Already have an account? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  Login now
                </a>
              </>
            )}
            {(viewMode === 'forgot' || viewMode === 'reset') && (
              <>
                <span>Remember your password? </span>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setViewMode('login');
                  }}
                >
                  Back to Login
                </a>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
