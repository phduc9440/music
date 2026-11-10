import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Modal from '../common/Modal';
import { playlistApi } from '../../../services';
import type { Playlist, ScoreSummary } from '../../../types';
import { getErrorMessage } from '../../../utils/score';
import './playlist-picker.css';

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
        toast.error('Không tải được playlist');
        setPlaylists([]);
      });
  }, []);

  const add = async (playlist: Playlist) => {
    setBusy(playlist.id);
    try {
      await playlistApi.addScore(playlist.id, score.id);
      setAdded((prev) => [...prev, playlist.id]);
      toast.success(`Đã thêm vào "${playlist.name}"`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không thêm được vào playlist'));
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
      toast.error(getErrorMessage(err, 'Không tạo được playlist'));
      setBusy('');
    }
  };

  return (
    <Modal title="Lưu vào playlist" onClose={onClose}>
      <p className="pl-picker__score">{score.title}</p>
      {playlists === null && <p className="pl-picker__note">Đang tải…</p>}
      {playlists && playlists.length === 0 && <p className="pl-picker__note">Bạn chưa có playlist nào.</p>}
      {playlists && playlists.length > 0 && (
        <ul className="pl-picker__list">
          {playlists.map((p) => {
            const done = added.includes(p.id);
            return (
              <li key={p.id}>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.scoreCount} bài</small>
                </span>
                <button
                  type="button"
                  className={`sc-btn sc-btn--sm${done ? '' : ' sc-btn--primary'}`}
                  disabled={done || busy !== ''}
                  onClick={() => add(p)}
                >
                  {done ? 'Đã thêm' : busy === p.id ? 'Đang thêm…' : 'Thêm'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="pl-picker__new" onSubmit={createAndAdd}>
        <input
          className="sc-input"
          placeholder="Tên playlist mới"
          maxLength={255}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="sc-btn" disabled={!newName.trim() || busy !== ''}>
          Tạo và thêm
        </button>
      </form>
      <div className="sc-modal__actions">
        <Link to="/playlists" className="sc-btn" onClick={onClose}>
          Mở trang Playlist
        </Link>
        <button type="button" className="sc-btn sc-btn--primary" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}
