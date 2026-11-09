import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { authApi } from '../services';
import { completeLogin } from '../utils/auth';

interface GoogleAuthButtonProps {
  setIsLoading: (loading: boolean) => void;
  /** Trang cần quay lại sau khi đăng nhập (mặc định theo vai trò). */
  redirectTo?: string;
}

const errorText = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message ||
  (error instanceof Error ? error.message : '') ||
  'Đăng nhập bằng Google thất bại';

export default function GoogleAuthButton({ setIsLoading, redirectTo }: GoogleAuthButtonProps) {
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setIsLoading(true);
    try {
      const response = await authApi.googleLogin({ idToken: credentialResponse.credential });
      const target = await completeLogin(response.data.result);
      toast.success('Đăng nhập thành công');
      navigate(redirectTo ?? target, { replace: true });
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      {/* Đường kẻ "hoặc" (màu lấy từ token để thấy rõ trên nền sáng) */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ui-border)' }} />
        <span style={{ fontSize: 'var(--ui-text-sm)', color: 'var(--ui-text-3)' }}>hoặc</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ui-border)' }} />
      </div>
      <GoogleLogin
        onSuccess={handleGoogleSuccess}
        onError={() => toast.error('Đăng nhập bằng Google thất bại')}
        theme="outline"
        shape="rectangular"
        text="signin_with"
      />
    </div>
  );
}
