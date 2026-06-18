import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authApi, userApi, adminApi } from '../api';

export default function Login() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLoginMode) {
        const response = await authApi.login({ username, password });
        localStorage.setItem('token', response.data.result.token);

        try {
          const userRes = await userApi.getMe();
          localStorage.setItem('role', 'USER');
          toast.success('Login successful!');
          navigate('/user');
        } catch (err) {
          try {
            const adminRes = await adminApi.getMe();
            localStorage.setItem('role', 'ADMIN');
            toast.success('Login successful!');
            navigate('/admin');
          } catch (err2) {
             toast.error('Could not fetch user/admin profile.');
          }
        }
      } else {
        await authApi.register({ username, password, email, fullName });
        toast.success('Registration successful! Please login.');
        setIsLoginMode(true);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="glass-container auth-card">
        <h1>Music App</h1>
        <p>{isLoginMode ? 'Welcome back! Please login to your account.' : 'Create a new account to get started.'}</p>
        
        <form onSubmit={handleSubmit}>
          {!isLoginMode && (
            <>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  className="form-control" 
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="fullName">Full Name</label>
                <input 
                  type="text" 
                  id="fullName" 
                  className="form-control" 
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input 
              type="text" 
              id="username" 
              className="form-control" 
              placeholder="Enter username" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              className="form-control" 
              placeholder="Enter password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required 
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={isLoading}>
            {isLoading ? 'Processing...' : (isLoginMode ? 'Login' : 'Register')}
          </button>
          
          <div style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
            <span>{isLoginMode ? "Don't have an account? " : "Already have an account? "}</span> 
            <a href="#" onClick={(e) => { e.preventDefault(); setIsLoginMode(!isLoginMode); }}>
              {isLoginMode ? 'Register now' : 'Login now'}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
