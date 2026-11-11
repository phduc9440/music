import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from '../../../routes/transition-nav';
import { toast } from 'react-toastify';
import Modal from '../common/Modal';
import { playlistApi } from '../../../services';
import type { Playlist, ScoreSummary } from '../../../types';
import { t } from '../../../i18n/core';
import { getErrorMessage } from '../../../utils/score';
import './playlist-picker.css';
import Skeleton from '../../ui/Skeleton';

interface Props {
  score: Pick<ScoreSummary, 'id' | 'title'>;
  onClose: () => void;
}

/** Lưu một bản nhạc vào playlist của tôi: chọn playlist có sẵn hoặc tạo nhanh playlist mới. */
export default function PlaylistPicker({ score, onClose }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    playlistApi
      .list()
      .then((res) => setPlaylists(res.data.result))
      .catch(() => {
        toast.error(t('scores.playlistPicker.loadFailed'));
        setPlaylists([]);
      });
  }, []);

  const add = async (playlist: Playlist) => {
    setBusy(playlist.id);
    try {
      await playlistApi.addScore(playlist.id, score.id);
      setAdded((prev) => [...prev, playlist.id]);
      toast.success(t('scores.playlistPicker.added', { name: playlist.name }));
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.playlistPicker.addFailed')));
    } finally {
      setBusy('');
    }
  };

  const createAndAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy('new');
    try {
      const res = await playlistApi.create({ name, description: '' });
      const created = res.data.result;
      setPlaylists((prev) => [created, ...(prev ?? [])]);
      setNewName('');
      await add(created);
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.playlistPicker.createFailed')));
      setBusy('');
    }
  };

  return (
    <Modal title={t('scores.playlistPicker.title')} onClose={onClose}>
      <p className="pl-picker__score">{score.title}</p>
      {playlists === null && <Skeleton lines={3} />}
      {playlists && playlists.length === 0 && <p className="pl-picker__note">{t('scores.playlistPicker.empty')}</p>}
      {playlists && playlists.length > 0 && (
        <ul className="pl-picker__list">
          {playlists.map((p) => {
            const done = added.includes(p.id);
            return (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong>
                  <small>{t('scores.playlistPicker.itemCount', { count: p.scoreCount })}</small>
                </span>
                <button
                  type="button"
                  className={`sc-btn sc-btn--sm${done ? '' : ' sc-btn--primary'}`}
                  disabled={done || busy !== ''}
                  onClick={() => add(p)}
                >
                  {done
                    ? t('scores.playlistPicker.addedShort')
                    : busy === p.id
                      ? t('scores.playlistPicker.adding')
                      : t('scores.playlistPicker.add')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="pl-picker__new" onSubmit={createAndAdd}>
        <input
          className="sc-input"
          placeholder={t('scores.playlistPicker.newName')}
          maxLength={255}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="sc-btn" disabled={!newName.trim() || busy !== ''}>
          {t('scores.playlistPicker.createAndAdd')}
        </button>
      </form>
      <div className="sc-modal__actions">
        <Link to="/playlists" className="sc-btn" onClick={onClose}>
          {t('scores.playlistPicker.openPlaylists')}
        </Link>
        <button type="button" className="sc-btn sc-btn--primary" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}
