import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import Pagination from '../../../components/scores/common/Pagination';
import { scoreApi } from '../../../services';
import type { PageResult, TrashedScore } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import '../../../components/scores/scores.css';
import './ScoreLibrary.css';

const PAGE_SIZE = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Số ngày còn lại trước khi bị xóa hẳn (tối thiểu 0). */
const daysLeft = (purgeAt: string): number =>
  Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / DAY_MS));

/** Trang /scores/trash: bản nhạc đã xóa, giữ 30 ngày để khôi phục hoặc xóa hẳn. */
export default function ScoreTrash() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResult<TrashedScore> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<TrashedScore | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await scoreApi.trash({ page, size: PAGE_SIZE });
      // Xóa/khôi phục hết bản cuối của trang thì lùi về trang trước
      if (res.data.result.content.length === 0 && page > 0) {
        setPage(page - 1);
        return;
      }
      setData(res.data.result);
    } catch {
      toast.error('Không tải được thùng rác');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải dữ liệu khi đổi trang
    void load();
  }, [load]);

  const handleRestore = async (score: TrashedScore) => {
    setBusyId(score.id);
    try {
      await scoreApi.restore(score.id);
      toast.success('Đã khôi phục bản nhạc');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không khôi phục được, vui lòng thử lại'));
    } finally {
      setBusyId(null);
    }
  };

  const closePurge = () => {
    setPurging(null);
    setTyped('');
    setError('');
  };

  const handlePurge = async () => {
    if (!purging) return;
    setBusyId(purging.id);
    setError('');
    try {
      await scoreApi.purge(purging.id);
      toast.success('Đã xóa hẳn bản nhạc');
      closePurge();
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Không xóa được, vui lòng thử lại'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Thùng rác</h1>
            <p>Bản nhạc đã xóa được giữ 30 ngày rồi mới bị xóa hẳn.</p>
          </div>
          <button className="sc-btn" onClick={() => navigate('/scores')}>
            ‹ Về thư viện
          </button>
        </header>

        {loading && <div className="sc-skeleton sc-skeleton--hero" aria-busy="true" />}

        {!loading && data && data.content.length === 0 && (
          <div className="sc-empty">
            <h3>Thùng rác trống</h3>
            <p>Bản nhạc bạn xóa sẽ nằm ở đây để có thể khôi phục.</p>
          </div>
        )}

        {data && data.content.length > 0 && (
          <ul className="sc-trash">
            {data.content.map((s) => (
              <li key={s.id} className="sc-trash__item">
                <div className="sc-trash__info">
                  <h3 title={s.title}>{s.title}</h3>
                  <p>{s.composer || 'Chưa rõ tác giả'}</p>
                  <p className="sc-trash__meta">
                    Xóa hẳn sau {daysLeft(s.purgeAt)} ngày
                    {s.deletedByAdmin ? ' · Do quản trị viên gỡ' : ''}
                    {s.deleteReason ? ` · Lý do: ${s.deleteReason}` : ''}
                  </p>
                </div>
                <div className="sc-trash__actions">
                  <button className="sc-btn" disabled={busyId !== null} onClick={() => handleRestore(s)}>
                    Khôi phục
                  </button>
                  <button className="sc-btn sc-btn--danger" disabled={busyId !== null} onClick={() => setPurging(s)}>
                    Xóa hẳn
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {data && (
          <Pagination page={page} totalPages={data.totalPages} totalElements={data.totalElements} onChange={setPage} />
        )}
      </main>

      {purging && (
        <Modal title="Xóa hẳn bản nhạc" onClose={closePurge}>
          <p className="sc-delete__text">
            Toàn bộ file (ảnh gốc, MusicXML, MIDI, ...) và lịch sử xử lý sẽ bị xóa <strong>vĩnh viễn</strong>, không
            khôi phục được. Gõ <code>{purging.title}</code> để xác nhận.
          </p>
          <input
            className="sc-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Nhập lại tên bản nhạc"
            autoFocus
          />
          {error && <div className="sc-error">{error}</div>}
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={closePurge} disabled={busyId !== null}>
              Hủy
            </button>
            <button
              className="sc-btn sc-btn--danger-solid"
              onClick={handlePurge}
              disabled={busyId !== null || typed.trim() !== purging.title.trim()}
            >
              {busyId === purging.id ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
