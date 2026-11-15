import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import PlaylistFormModal from '../../../components/scores/playlist/PlaylistFormModal';
import { playlistApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import type { Playlist } from '../../../types';
import Icon from '../../../components/ui/Icon';
import { Link } from '../../../routes/transition-nav';
import '../../../components/scores/scores.css';
import './playlists.css';
import { coverHue } from './playlistUtils';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

/** Trang /playlists: tạo, sửa, xóa playlist luyện tập (bấm Mở để quản lý bài trong playlist, mục 3.10). */
export default function Playlists() {
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
          <div className="pl-empty">
            <span className="pl-cover pl-cover--lg" style={{ ['--pl-hue' as string]: 30 }} aria-hidden="true">
              <Icon name="music" size={36} />
            </span>
            <h3>{t('playlists.emptyTitle')}</h3>
            <p>{t('playlists.emptyHint')}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => setEditing('new')}>
              {t('playlists.create')}
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="pl-grid">
            {items.map((p) => (
              <article key={p.id} className="pl-card">
                <div className="pl-card__top">
                  <span className="pl-cover" style={{ ['--pl-hue' as string]: coverHue(p.name) }} aria-hidden="true">
                    <Icon name="music" size={28} />
                  </span>
                  <div className="pl-card__body">
                    <h3 className="pl-card__title">
                      <Link to={`/playlists/${p.id}`} className="pl-card__link" title={t('playlists.openPlaylist')}>
                        {p.name}
                      </Link>
                    </h3>
                    <p className={`pl-card__desc${p.description ? '' : ' pl-card__desc--empty'}`}>
                      {p.description || t('playlists.noDescription')}
                    </p>
                  </div>
                </div>
                <div className="pl-card__foot">
                  <span className="pl-count">{t('scores.playlistPicker.itemCount', { count: p.scoreCount })}</span>
                  <div className="pl-actions">
                    <button
                      type="button"
                      className="pl-icon-btn"
                      title={t('playlists.edit')}
                      aria-label={`${t('playlists.edit')}: ${p.name}`}
                      onClick={() => setEditing(p)}
                    >
                      <Icon name="edit" />
                    </button>
                    <button
                      type="button"
                      className="pl-icon-btn pl-icon-btn--danger"
                      title={t('common.delete')}
                      aria-label={`${t('common.delete')}: ${p.name}`}
                      onClick={() => setDeleting(p)}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            <button type="button" className="pl-new" onClick={() => setEditing('new')}>
              <Icon name="plus" size={22} />
              {t('playlists.new')}
            </button>
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
