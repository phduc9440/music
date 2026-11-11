import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import { playlistApi, scoreApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import { DIFFICULTY_LABELS } from '../../../utils/score';
import type { Playlist, PlaylistItem, ScoreSummary } from '../../../types';
import '../../../components/scores/scores.css';
import { t } from '../../../i18n/core';

/** Trang /playlists/:id: xem bài trong playlist, thêm/xóa bài, kéo thả đổi thứ tự (mục 3.10). */
export default function PlaylistDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation(); // để trang chi tiết bản nhạc quay lại đúng playlist này
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
        toast.error(t('scores.playlistPicker.loadFailed'));
        navigate('/playlists');
      });
  }, [id, navigate]);

  const run = useCallback(async (action: () => Promise<{ data: { result: PlaylistItem[] } }>, fallback: string) => {
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
  }, []);

  const remove = (scoreId: string) => run(() => playlistApi.removeScore(id, scoreId), t('playlists.removeFailed'));

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
      t('playlists.reorderFailed'),
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
            <h1>{playlist?.name ?? t('common.nav.items.playlists')}</h1>
            <p>
              {playlist?.description || (items ? t('scores.playlistPicker.itemCount', { count: items.length }) : '')}
            </p>
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
            {t('playlists.addScore')}
          </button>
        </header>

        {items && items.length === 0 && (
          <div className="sc-empty">
            <h3>{t('playlists.noItems')}</h3>
            <p>{t('playlists.noItemsHint')}</p>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p>{t('playlists.dragHint')}</p>
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
                        item.measureCount ? t('scores.card.measures', { count: item.measureCount }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('playlists.noInfo')}
                    </p>
                  </div>
                  <button
                    className="sc-btn sc-btn--sm"
                    onClick={() => navigate(`/scores/${item.scoreId}`, { state: { from: pathname } })}
                  >
                    {t('playlists.openScore')}
                  </button>
                  <button
                    className="sc-btn sc-btn--sm sc-btn--danger"
                    disabled={busy}
                    onClick={() => remove(item.scoreId)}
                  >
                    {t('playlists.remove')}
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
          onAdd={(scoreId) => run(() => playlistApi.addScore(id, scoreId), t('playlists.addFailed'))}
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
        .catch(() => toast.error(t('playlists.libraryFailed')));
    }, 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  return (
    <Modal title={t('playlists.addTitle')} onClose={onClose}>
      <input
        className="sc-input"
        placeholder={t('playlists.searchScores')}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        autoFocus
      />
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 12, display: 'grid', gap: 8 }}>
        {scores && scores.length === 0 && <p>{t('playlists.noneFound')}</p>}
        {scores?.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong>{s.title}</strong>
              {s.composer && <div>{s.composer}</div>}
            </div>
            <button className="sc-btn sc-btn--sm" disabled={existing.has(s.id)} onClick={() => onAdd(s.id)}>
              {existing.has(s.id) ? t('scores.playlistPicker.addedShort') : t('scores.playlistPicker.add')}
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
