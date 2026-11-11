import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import PlaylistFormModal from '../../../components/scores/playlist/PlaylistFormModal';
import { playlistApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { Playlist } from '../../../types';
import '../../../components/scores/scores.css';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

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
      .catch(() => toast.error(t('playlists.loadFailed')));
  }, []);

  useEffect(load, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await playlistApi.remove(deleting.id);
      toast.success(t('playlists.deleted'));
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, t('playlists.deleteFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>{t('playlists.title')}</h1>
            <p>{items ? t('playlists.count', { count: items.length }) : t('playlists.subtitle')}</p>
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => setEditing('new')}>
            {t('playlists.create')}
          </button>
        </header>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>{t('playlists.emptyTitle')}</h3>
            <p>{t('playlists.emptyHint')}</p>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="sc-grid">
            {items.map((p) => (
              <div key={p.id} className="sc-empty" style={{ textAlign: 'left' }}>
                <h3>{p.name}</h3>
                <p>{p.description || t('playlists.noDescription')}</p>
                <p>{t('scores.playlistPicker.itemCount', { count: p.scoreCount })}</p>
                <div className="sc-modal__actions">
                  <button className="sc-btn sc-btn--sm sc-btn--primary" onClick={() => navigate(`/playlists/${p.id}`)}>
                    {t('playlists.open')}
                  </button>
                  <button className="sc-btn sc-btn--sm" onClick={() => setEditing(p)}>
                    {t('playlists.edit')}
                  </button>
                  <button className="sc-btn sc-btn--sm sc-btn--danger" onClick={() => setDeleting(p)}>
                    {t('common.delete')}
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
        <Modal title={t('playlists.deleteTitle')} onClose={() => setDeleting(null)}>
          <p className="sc-delete__text">
            <Rich text={t('playlists.deleteText', { name: deleting.name })} />
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setDeleting(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button className="sc-btn sc-btn--danger-solid" onClick={confirmDelete} disabled={busy}>
              {busy ? t('scores.trash.deleting') : t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
