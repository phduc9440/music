import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import Modal from '../../../components/scores/common/Modal';
import PlaylistFormModal from '../../../components/scores/playlist/PlaylistFormModal';
import Rich from '../../../i18n/Rich';
import { playlistApi, scoreApi } from '../../../services';
import { getErrorMessage } from '../../../utils/score';
import { DIFFICULTY_LABELS } from '../../../utils/score';
import type { Playlist, PlaylistItem, ScoreSummary } from '../../../types';
import Icon from '../../../components/ui/Icon';
import '../../../components/scores/scores.css';
import './playlists.css';
import { coverHue } from './playlistUtils';
import { t } from '../../../i18n/core';
import { BackLink } from '../../../components/ui';

/**
 * Trang /playlists/:id (mục 3.10): xem, thêm, bỏ bài (từng bài hoặc nhiều bài, luôn hỏi xác nhận), kéo thả đổi thứ tự,
 * sửa và xóa playlist ngay tại trang.
 */
export default function PlaylistDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation(); // để trang chi tiết bản nhạc quay lại đúng playlist này
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [items, setItems] = useState<PlaylistItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  /** Bài đang chờ xác nhận bỏ khỏi playlist (một hoặc nhiều scoreId). */
  const [removing, setRemoving] = useState<string[] | null>(null);
  /** Lựa chọn theo scoreId nên kéo thả đổi thứ tự không làm lệch. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadPlaylist = useCallback(
    () =>
      playlistApi
        .get(id)
        .then((res) => setPlaylist(res.data.result))
        .catch(() => {
          toast.error(t('scores.playlistPicker.loadFailed'));
          navigate('/playlists');
        }),
    [id, navigate],
  );

  useEffect(() => {
    void loadPlaylist();
    playlistApi
      .items(id)
      .then((res) => setItems(res.data.result))
      .catch(() => undefined);
  }, [id, loadPlaylist]);

  /** Nhận danh sách mới từ máy chủ và bỏ chọn những bài không còn trong playlist. */
  const applyItems = useCallback((next: PlaylistItem[]) => {
    setItems(next);
    const ids = new Set(next.map((i) => i.scoreId));
    setSelected((prev) => new Set([...prev].filter((scoreId) => ids.has(scoreId))));
  }, []);

  const run = useCallback(
    async (action: () => Promise<{ data: { result: PlaylistItem[] } }>, fallback: string) => {
      setBusy(true);
      try {
        const res = await action();
        applyItems(res.data.result);
        return true;
      } catch (err) {
        toast.error(getErrorMessage(err, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyItems],
  );

  const total = items?.length ?? 0;
  const allSelected = total > 0 && selected.size === total;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selected.size > 0 && !allSelected;
  }, [selected, allSelected]);

  const toggle = (scoreId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scoreId)) next.delete(scoreId);
      else next.add(scoreId);
      return next;
    });

  const toggleAll = () => setSelected(allSelected || !items ? new Set() : new Set(items.map((i) => i.scoreId)));

  const confirmRemove = async () => {
    if (!removing) return;
    const ids = removing;
    const ok = await run(
      () => (ids.length === 1 ? playlistApi.removeScore(id, ids[0]) : playlistApi.removeScores(id, ids)),
      t('playlists.removeFailed'),
    );
    if (ok) {
      toast.success(t('playlists.removed', { count: ids.length }));
      setRemoving(null);
    }
  };

  const confirmDeletePlaylist = async () => {
    setBusy(true);
    try {
      await playlistApi.remove(id);
      toast.success(t('playlists.deleted'));
      navigate('/playlists');
    } catch (err) {
      toast.error(getErrorMessage(err, t('playlists.deleteFailed')));
      setBusy(false);
    }
  };

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
    if (!ok) playlistApi.items(id).then((res) => applyItems(res.data.result));
  };

  const removingName =
    removing && removing.length === 1 ? (items?.find((i) => i.scoreId === removing[0])?.title ?? '') : '';

  return (
    <div className="sc-page">
      <div className="sc-backbar">
        <BackLink label={t('playlists.backToList')} to="/playlists" />
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
          <div className="pl-hero__actions" role="group" aria-label={t('playlists.actions')}>
            <button type="button" className="sc-btn" onClick={() => setEditing(true)} disabled={!playlist}>
              <Icon name="edit" size={16} />
              {t('playlists.edit')}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn--danger"
              onClick={() => setDeletingPlaylist(true)}
              disabled={!playlist}
            >
              <Icon name="trash" size={16} />
              {t('playlists.deletePlaylist')}
            </button>
            <button type="button" className="sc-btn sc-btn--primary" onClick={() => setAdding(true)}>
              {t('playlists.addScore')}
            </button>
          </div>
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
          <section className="pl-panel">
            <div className="pl-toolbar">
              <label className="pl-check pl-check--all">
                <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy} />
                <span>{t('playlists.selectAll')}</span>
              </label>
              <span className="pl-toolbar__count" aria-live="polite">
                {selected.size > 0 ? t('playlists.selectedCount', { count: selected.size }) : t('playlists.dragHint')}
              </span>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="sc-btn sc-btn--sm sc-btn--danger"
                  disabled={busy}
                  onClick={() => setRemoving([...selected])}
                >
                  <Icon name="trash" size={14} />
                  {t('playlists.removeSelected', { count: selected.size })}
                </button>
              )}
            </div>
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
                  }${selected.has(item.scoreId) ? ' is-selected' : ''}`}
                >
                  <label className="pl-check">
                    <input
                      type="checkbox"
                      checked={selected.has(item.scoreId)}
                      onChange={() => toggle(item.scoreId)}
                      disabled={busy}
                      aria-label={t('playlists.selectScore', { title: item.title })}
                    />
                  </label>
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
                      onClick={() => setRemoving([item.scoreId])}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      {adding && items && (
        <AddScoreModal
          existing={new Set(items.map((i) => i.scoreId))}
          onClose={() => setAdding(false)}
          onAdd={(scoreId) => run(() => playlistApi.addScore(id, scoreId), t('playlists.addFailed'))}
        />
      )}

      {editing && playlist && (
        <PlaylistFormModal
          playlist={playlist}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void loadPlaylist();
          }}
        />
      )}

      {removing && (
        <Modal title={t('playlists.removeTitle')} onClose={() => !busy && setRemoving(null)}>
          <p className="sc-delete__text">
            <Rich
              text={
                removing.length === 1
                  ? t('playlists.removeOne', { name: removingName })
                  : t('playlists.removeMany', { count: removing.length })
              }
            />
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setRemoving(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button className="sc-btn sc-btn--danger-solid" onClick={() => void confirmRemove()} disabled={busy}>
              {busy ? t('playlists.removing') : t('playlists.remove')}
            </button>
          </div>
        </Modal>
      )}

      {deletingPlaylist && playlist && (
        <Modal title={t('playlists.deleteTitle')} onClose={() => !busy && setDeletingPlaylist(false)}>
          <p className="sc-delete__text">
            <Rich text={t('playlists.deleteText', { name: playlist.name })} />
          </p>
          <div className="sc-modal__actions">
            <button className="sc-btn" onClick={() => setDeletingPlaylist(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              className="sc-btn sc-btn--danger-solid"
              onClick={() => void confirmDeletePlaylist()}
              disabled={busy}
            >
              {busy ? t('scores.trash.deleting') : t('common.delete')}
            </button>
          </div>
        </Modal>
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
