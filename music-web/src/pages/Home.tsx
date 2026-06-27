import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div
      className="auth-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div className="glass-container" style={{ maxWidth: '600px', padding: '3rem' }}>
        <h1
          style={{
            fontSize: '3rem',
            marginBottom: '1rem',
            background: 'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Welcome to MusicApp
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#e0e0e0', marginBottom: '2rem' }}>
          Discover the best tunes, manage your playlists, and enjoy a seamless auditory experience.
        </p>
        <button
          className="btn btn-primary"
          style={{ fontSize: '1.1rem', padding: '0.75rem 2rem' }}
          onClick={() => navigate('/auth/login')}
        >
          Login to your account
        </button>
      </div>
    </div>
  );
}
