import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import NotificationBell from '../../components/NotificationBell';
import Modal from '../../components/scores/Modal';
import PlaylistFormModal from '../../components/scores/PlaylistFormModal';
import { playlistApi } from '../../services';
import { getErrorMessage } from '../../utils/score';
import type { Playlist } from '../../types';
import '../../components/scores/scores.css';

/** Trang /playlists: tạo, sửa, xóa playlist luyện tập (bấm Mở để quản lý bài trong playlist, mục 3.10). */
export default function Playlists() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Playlist[] | null>(null);
  const [editing, setEditing] = useState<Playlist | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    playlistApi
      .list()
      .then((res) => setItems(res.data.result))
      .catch(() => toast.error('Không tải được danh sách playlist'));
  }, []);

  useEffect(load, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await playlistApi.remove(deleting.id);
      toast.success('Đã xóa playlist');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không xóa được playlist'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <NotificationBell />
          <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores')}>
            ‹ Thư viện
          </button>
        </div>
      </nav>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Playlist của tôi</h1>
            <p>{items ? `${items.length} playlist` : 'Playlist luyện tập theo mục tiêu'}</p>
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => setEditing('new')}>
            + Tạo playlist
          </button>
        </header>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>Chưa có playlist nào</h3>
            <p>Tạo playlist để gom các bài luyện tập theo mục tiêu.</p>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="sc-grid">
            {items.map((p) => (
              <div key={p.id} className="sc-empty" style={{ textAlign: 'left' }}>
                <h3>{p.name}</h3>
                <p>{p.description || 'Chưa có mô tả'}</p>
                <p>{p.scoreCount} bài</p>
                <div className="sc-modal__actions">
                  <button className="sc-btn sc-btn--sm sc-btn--primary" onClick={() => navigate(`/playlists/${p.id}`)}>
                    Mở
                  </button>
                  <button className="sc-btn sc-btn--sm" onClick={() => setEditing(p)}>
                    Sửa
                  </button>
                  <button className="sc-btn sc-btn--sm sc-btn--danger" onClick={() => setDeleting(p)}>
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <PlaylistFormModal
          playlist={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}

      {deleting && (
        <Modal title="Xóa playlist" onClose={() => setDeleting(null)}>
          <p className="sc-delete__text">
            Xóa playlist <strong>{deleting.name}</strong>? Các bản nhạc trong playlist vẫn được giữ trong thư viện.
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setDeleting(null)} disabled={busy}>
              Hủy
            </button>
            <button className="sc-btn sc-btn--danger-solid" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Đang xóa...' : 'Xóa'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
