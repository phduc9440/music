import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { GoogleLogin } from '@react-oauth/google';
import { authApi } from '../services';
import { completeLogin } from '../utils/auth';

interface GoogleAuthButtonProps {
  setIsLoading: (loading: boolean) => void;
  /** Trang cần quay lại sau khi đăng nhập (mặc định theo vai trò). */
  redirectTo?: string;
}

export default function GoogleAuthButton({ setIsLoading, redirectTo }: GoogleAuthButtonProps) {
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) return;
    setIsLoading(true);
    try {
      const response = await authApi.googleLogin({ idToken: credentialResponse.credential });
      const target = await completeLogin(response.data.result);
      toast.success('Login successful!');
      navigate(redirectTo ?? target, { replace: true });
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Google Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '1rem' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
        <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)' }}>OR</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
      </div>
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => toast.error('Google Login failed')}
        theme="filled_black"
        shape="rectangular"
      />
    </div>
  );
}
