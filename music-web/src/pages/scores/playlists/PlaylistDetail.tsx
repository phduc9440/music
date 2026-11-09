import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import { playlistApi, scoreApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import { DIFFICULTY_LABELS } from '../../../utils/score';
import type { Playlist, PlaylistItem, ScoreSummary } from '../../../types';
import '../../../components/scores/scores.css';

/** Trang /playlists/:id: xem bài trong playlist, thêm/xóa bài, kéo thả đổi thứ tự (mục 3.10). */
export default function PlaylistDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([playlistApi.get(id), playlistApi.items(id)])
      .then(([p, i]) => {
        setPlaylist(p.data.result);
        setItems(i.data.result);
      })
      .catch(() => {
        toast.error('Không tải được playlist');
        navigate('/playlists');
      });
  }, [id, navigate]);

  const run = useCallback(
    async (action: () => Promise<{ data: { result: PlaylistItem[] } }>, fallback: string) => {
      setBusy(true);
      try {
        const res = await action();
        setItems(res.data.result);
        return true;
      } catch (err) {
        toast.error(getErrorMessage(err, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const remove = (scoreId: string) => run(() => playlistApi.removeScore(id, scoreId), 'Không bỏ được bài khỏi playlist');

  const drop = async (target: number) => {
    if (!items || dragIndex === null || dragIndex === target) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setItems(next); // cập nhật ngay, BE trả lại danh sách chuẩn (hoặc báo lỗi thì tải lại)
    const ok = await run(
      () =>
        playlistApi.reorder(
          id,
          next.map((i) => i.scoreId),
        ),
      'Không đổi được thứ tự',
    );
    if (!ok) playlistApi.items(id).then((res) => setItems(res.data.result));
  };

  return (
    <div className="sc-page">
      <div className="sc-backbar">
        <button type="button" className="sc-backlink" onClick={() => navigate('/playlists')}>
          ‹ Playlist
        </button>
      </div>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{playlist?.name ?? 'Playlist'}</h1>
            <p>{playlist?.description || (items ? `${items.length} bài` : '')}</p>
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
            + Thêm bài
          </button>
        </header>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>Playlist chưa có bài nào</h3>
            <p>Bấm “Thêm bài” để chọn từ thư viện của bạn.</p>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p>Kéo thả để đổi thứ tự luyện tập.</p>
            <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              {items.map((item, index) => (
                <li
                  key={item.scoreId}
                  draggable={!busy}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    drop(index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className="sc-empty"
                  style={{
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'grab',
                    opacity: dragIndex === index ? 0.5 : 1,
                  }}
                >
                  <strong>{index + 1}</strong>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0 }}>{item.title}</h3>
                    <p style={{ margin: 0 }}>
                      {[
                        item.composer,
                        item.difficulty ? DIFFICULTY_LABELS[item.difficulty] : null,
                        item.measureCount ? `${item.measureCount} ô nhịp` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Chưa có thông tin'}
                    </p>
                  </div>
                  <button className="sc-btn sc-btn--sm" onClick={() => navigate(`/scores/${item.scoreId}`)}>
                    Mở bài
                  </button>
                  <button className="sc-btn sc-btn--sm sc-btn--danger" disabled={busy} onClick={() => remove(item.scoreId)}>
                    Bỏ
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      {adding && items && (
        <AddScoreModal
          existing={new Set(items.map((i) => i.scoreId))}
          onClose={() => setAdding(false)}
          onAdd={(scoreId) => run(() => playlistApi.addScore(id, scoreId), 'Không thêm được bài')}
        />
      )}
    </div>
  );
}

interface AddScoreModalProps {
  existing: Set<string>;
  onClose: () => void;
  onAdd: (scoreId: string) => Promise<boolean>;
}

/** Chọn bài từ thư viện của tôi (tìm theo tên), bài đã có trong playlist thì khóa nút. */
function AddScoreModal({ existing, onClose, onAdd }: AddScoreModalProps) {
  const [keyword, setKeyword] = useState('');
  const [scores, setScores] = useState<ScoreSummary[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      scoreApi
        .list({ keyword: keyword.trim() || undefined, size: 30 })
        .then((res) => setScores(res.data.result.content))
        .catch(() => toast.error('Không tải được thư viện'));
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  return (
    <Modal title="Thêm bài vào playlist" onClose={onClose}>
      <input
        className="sc-input"
        placeholder="Tìm theo tên bài..."
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        autoFocus
      />
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 12, display: 'grid', gap: 8 }}>
        {scores && scores.length === 0 && <p>Không tìm thấy bài nào.</p>}
        {scores?.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong>{s.title}</strong>
              {s.composer && <div>{s.composer}</div>}
            </div>
            <button className="sc-btn sc-btn--sm" disabled={existing.has(s.id)} onClick={() => onAdd(s.id)}>
              {existing.has(s.id) ? 'Đã thêm' : 'Thêm'}
            </button>
          </div>
        ))}
      </div>
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}
