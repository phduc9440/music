import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { GoogleLogin } from '@react-oauth/google';
import { authApi, userApi, adminApi } from '../services';

interface GoogleAuthButtonProps {
  setIsLoading: (loading: boolean) => void;
}

export default function GoogleAuthButton({ setIsLoading }: GoogleAuthButtonProps) {
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) return;
    setIsLoading(true);
    try {
      const response = await authApi.googleLogin({ idToken: credentialResponse.credential });
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
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Google Login failed');
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
