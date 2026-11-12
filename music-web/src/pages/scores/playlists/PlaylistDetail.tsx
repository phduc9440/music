import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import { playlistApi, scoreApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import { DIFFICULTY_LABELS } from '../../../utils/score';
import type { Playlist, PlaylistItem, ScoreSummary } from '../../../types';
import Icon from '../../../components/ui/Icon';
import '../../../components/scores/scores.css';
import './playlists.css';
import { coverHue } from './playlistUtils';
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
  const [overIndex, setOverIndex] = useState<number | null>(null);
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
          ‹ {t('playlists.backToList')}
        </button>
      </div>

      <main className="sc-container">
        <header className="pl-hero">
          <span
            className="pl-cover pl-cover--lg"
            style={{ ['--pl-hue' as string]: coverHue(playlist?.name ?? '') }}
            aria-hidden="true"
          >
            <Icon name="music" size={40} />
          </span>
          <div className="pl-hero__text">
            <h1>{playlist?.name ?? t('common.nav.items.playlists')}</h1>
            {playlist?.description && <p>{playlist.description}</p>}
            {items && (
              <div className="pl-hero__meta">
                <span className="pl-count">{t('scores.playlistPicker.itemCount', { count: items.length })}</span>
              </div>
            )}
          </div>
          <button className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
            {t('playlists.addScore')}
          </button>
        </header>

        {items && items.length === 0 && (
          <div className="pl-empty">
            <h3>{t('playlists.noItems')}</h3>
            <p>{t('playlists.noItemsHint')}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
              {t('playlists.addScore')}
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <p className="pl-hint">{t('playlists.dragHint')}</p>
            <ol className="pl-list">
              {items.map((item, index) => (
                <li
                  key={item.scoreId}
                  draggable={!busy}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (overIndex !== index) setOverIndex(index);
                  }}
                  onDrop={() => {
                    drop(index);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`pl-row${dragIndex === index ? ' is-dragging' : ''}${
                    overIndex === index && dragIndex !== null && dragIndex !== index ? ' is-over' : ''
                  }`}
                >
                  <span className="pl-grip" title={t('playlists.dragLabel')} aria-hidden="true" />
                  <span className="pl-pos">{index + 1}</span>
                  <div className="pl-row__main">
                    <span className="pl-row__title" title={item.title}>
                      {item.title}
                    </span>
                    <div className="pl-row__meta">
                      {item.composer && <span>{item.composer}</span>}
                      {item.difficulty && (
                        <span className={`pl-chip pl-chip--${item.difficulty}`}>
                          {DIFFICULTY_LABELS[item.difficulty]}
                        </span>
                      )}
                      {item.measureCount ? (
                        <span>{t('scores.card.measures', { count: item.measureCount })}</span>
                      ) : null}
                      {!item.composer && !item.difficulty && !item.measureCount && <span>{t('playlists.noInfo')}</span>}
                    </div>
                  </div>
                  <div className="pl-actions">
                    <button
                      type="button"
                      className="pl-icon-btn"
                      title={t('playlists.openScore')}
                      aria-label={`${t('playlists.openScore')}: ${item.title}`}
                      onClick={() => navigate(`/scores/${item.scoreId}`, { state: { from: pathname } })}
                    >
                      <Icon name="play" />
                    </button>
                    <button
                      type="button"
                      className="pl-icon-btn pl-icon-btn--danger"
                      title={t('playlists.remove')}
                      aria-label={`${t('playlists.remove')}: ${item.title}`}
                      disabled={busy}
                      onClick={() => remove(item.scoreId)}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
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
      <div className="pl-picker">
        {scores && scores.length === 0 && <p className="pl-hint">{t('playlists.noneFound')}</p>}
        {scores?.map((s) => (
          <div key={s.id} className="pl-pick">
            <div className="pl-pick__main">
              <strong>{s.title}</strong>
              {s.composer && <span>{s.composer}</span>}
            </div>
            <button className="sc-btn sc-btn--sm" disabled={existing.has(s.id)} onClick={() => onAdd(s.id)}>
              {existing.has(s.id) ? t('scores.playlistPicker.addedShort') : t('scores.playlistPicker.add')}
            </button>
          </div>
        ))}
      </div>
      <div className="sc-modal__actions">
        <button className="sc-btn" onClick={onClose}>
          {t('playlists.done')}
        </button>
      </div>
    </Modal>
  );
}
