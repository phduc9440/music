import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { sharingApi } from '../../services';
import { ACCESS_LEVEL_LABELS, getErrorCode } from '../../utils/score';
import '../../components/scores/scores.css';

/** Trang /s/:token: mở liên kết chia sẻ, nhận quyền rồi chuyển sang bản nhạc. */
export default function JoinShared() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const started = useRef(false); // tránh gọi hai lần khi React StrictMode chạy effect hai lần

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    sharingApi
      .join(token)
      .then((res) => {
        const { scoreId, accessLevel } = res.data.result;
        toast.success(`Bạn có quyền: ${ACCESS_LEVEL_LABELS[accessLevel]}`);
        navigate(`/scores/${scoreId}`, { replace: true });
      })
      .catch((err) => {
        setError(
          getErrorCode(err) === 2401
            ? 'Liên kết không hợp lệ hoặc đã bị chủ sở hữu tắt.'
            : 'Không mở được liên kết, vui lòng thử lại.',
        );
      });
  }, [token, navigate]);

  return (
    <div className="sc-page">
      <main className="sc-container">
        {error ? (
          <div className="sc-empty">
            <h3>Không mở được liên kết</h3>
            <p>{error}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate('/scores')}>
              Về thư viện
            </button>
          </div>
        ) : (
          <div className="sc-skeleton sc-skeleton--hero" aria-busy="true" />
        )}
      </main>
    </div>
  );
}
