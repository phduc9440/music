import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import ComposerDatalist from '../../../components/composers/ComposerDatalist';
import { importApi, playlistApi, tagApi } from '../../../services';
import type { Playlist, Tag } from '../../../types';
import {
  fileNameWithoutExtension,
  formatSize,
  getExtension,
  getUploadErrorMessage,
  MAX_COMPOSER,
  MAX_TITLE,
  UPLOAD_MAX_FILE_BYTES,
} from '../../../utils/score';
import { clearPendingUpload, isImportBatch, peekPendingUpload } from '../../../utils/pendingUpload';
import { Link } from '../../../routes/transition-nav';
import '../../../components/scores/scores.css';
import './ScoreUpload.css';
import { t } from '../../../i18n/core';

const IMPORT_EXTENSIONS = ['musicxml', 'xml', 'mxl', 'mid', 'midi'];

const validateImportFile = (file: File): string => {
  if (!IMPORT_EXTENSIONS.includes(getExtension(file.name))) return t('upload.import.unsupported');
  if (file.size === 0) return t('upload.import.empty');
  if (file.size > UPLOAD_MAX_FILE_BYTES)
    return t('upload.import.tooLarge', { max: UPLOAD_MAX_FILE_BYTES / 1024 / 1024 });
  return '';
};

const MAX_TAGS = 10; // khớp BE (mã lỗi 2302)
const MAX_FILES = 20;
const PARALLEL = 3; // số file gửi cùng lúc, mỗi file một request /scores/import

type ItemStatus = 'waiting' | 'uploading' | 'done' | 'failed';

interface ImportItem {
  id: string;
  file: File;
  /** Lỗi kiểm tra phía web (đuôi file, rỗng, quá lớn): file này không được gửi. */
  invalid: string;
  status: ItemStatus;
  progress: number;
  /** Lỗi BE trả về khi nhập file này. */
  error: string;
  scoreId: string | null;
  inPlaylist: boolean;
}

let itemSeq = 0;
const makeItem = (file: File): ImportItem => ({
  id: `imp-${++itemSeq}`,
  file,
  invalid: validateImportFile(file),
  status: 'waiting',
  progress: 0,
  error: '',
  scoreId: null,
  inPlaylist: false,
});

const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Chạy `worker` cho từng phần tử, tối đa `limit` cái cùng lúc. */
async function runPool<T>(queue: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const lane = async () => {
    while (next < queue.length) await worker(queue[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, lane));
}

/** Trang /scores/import: nhập trực tiếp MusicXML / MIDI, không qua OMR; chọn được tối đa 20 file một lần (I5). */
export default function ScoreImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  // File khách đã thả vào trang chủ trước khi đăng nhập (mục 5.3): chọn sẵn để không phải chọn lại
  const [items, setItems] = useState<ImportItem[]>(() => {
    const pending = peekPendingUpload();
    return pending && isImportBatch(pending) ? pending.slice(0, MAX_FILES).map(makeItem) : [];
  });
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [composer, setComposer] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const single = items.length === 1 ? items[0] : null;
  // Một file: gợi ý tên theo file (BE tự lấy work-title nếu để trống). Nhiều file: mỗi bản lấy tên từ file của nó
  const shownTitle = titleTouched
    ? title
    : single
      ? fileNameWithoutExtension(single.file.name).slice(0, MAX_TITLE)
      : '';
  const sendable = items.filter((it) => !it.invalid && it.status !== 'done');
  const failedCount = items.filter((it) => it.status === 'failed').length;
  const doneCount = items.filter((it) => it.status === 'done').length;
  const canSubmit = sendable.length > 0 && !busy && shownTitle.length <= MAX_TITLE && composer.length <= MAX_COMPOSER;
  const finished = items.length > 1 && !busy && doneCount > 0 && sendable.length === 0;

  // Lỗi tải danh sách thể loại thì vẫn import được, chỉ không chọn được thể loại
  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setAllTags([]));
    playlistApi
      .list()
      .then((res) => setPlaylists(res.data.result))
      .catch(() => setPlaylists([]));
  }, []);

  useEffect(() => clearPendingUpload(), []);

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const patchItem = (id: string, patch: Partial<ImportItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const pick = (files: File[]) => {
    if (files.length === 0) return;
    const fresh = files.filter((f) => !items.some((it) => sameFile(it.file, f)));
    const room = MAX_FILES - items.length;
    if (fresh.length > room) toast.warning(t('upload.import.tooMany', { max: MAX_FILES }));
    const added = fresh.slice(0, Math.max(room, 0)).map(makeItem);
    if (added.length > 0) setItems((list) => [...list, ...added]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const order = items.map((it) => it.id);
    const imported = new Map<string, string>(); // id dòng -> scoreId, của lần chạy này
    const batchTitle = items.length === 1 && titleTouched ? title : '';
    const queue = sendable.map((it) => ({ ...it }));
    queue.forEach((it) => patchItem(it.id, { status: 'waiting', error: '', progress: 0 }));

    await runPool(queue, PARALLEL, async (it) => {
      patchItem(it.id, { status: 'uploading', progress: 0 });
      try {
        const res = await importApi.importScore({ file: it.file, title: batchTitle, composer, tagIds }, (progress) =>
          patchItem(it.id, { progress }),
        );
        imported.set(it.id, res.data.result.scoreId);
        patchItem(it.id, { status: 'done', progress: 100, scoreId: res.data.result.scoreId });
      } catch (err) {
        patchItem(it.id, { status: 'failed', error: getUploadErrorMessage(err) });
      }
    });

    // Thêm vào playlist theo thứ tự đã chọn; bản nào lỗi thì chỉ báo, không làm hỏng các bản khác
    let playlistFailed = 0;
    if (playlistId) {
      const target = playlists.find((p) => p.id === playlistId);
      let added = 0;
      for (const id of order) {
        const scoreId = imported.get(id);
        if (!scoreId) continue;
        try {
          await playlistApi.addScore(playlistId, scoreId);
          patchItem(id, { inPlaylist: true });
          added++;
        } catch {
          playlistFailed++;
        }
      }
      if (added > 0) toast.success(t('upload.import.playlistAdded', { count: added, name: target?.name ?? '' }));
      if (playlistFailed > 0) toast.error(t('upload.import.playlistAddFailed', { count: playlistFailed }));
    }

    setBusy(false);
    if (items.length === 1) {
      // Một file: giữ hành vi cũ, nhập xong mở thẳng bản nhạc
      const scoreId = [...imported.values()][0];
      if (scoreId) {
        toast.success(t('upload.import.done'));
        navigate(`/scores/${scoreId}`, { replace: true });
      }
      return;
    }
    const failed = queue.length - imported.size;
    toast[failed > 0 ? 'warning' : 'success'](
      failed > 0
        ? t('upload.import.batchFailed', { failed })
        : t('upload.import.batchDone', { done: imported.size, total: items.length }),
    );
  };

  const statusText = (it: ImportItem) => {
    if (it.invalid) return it.invalid;
    if (it.status === 'failed') return `${t('upload.import.statusFailed')}: ${it.error}`;
    if (it.status === 'uploading') return t('upload.import.statusUploading', { progress: it.progress });
    if (it.status === 'done') {
      return it.inPlaylist
        ? `${t('upload.import.statusDone')} · ${t('upload.import.inPlaylist')}`
        : t('upload.import.statusDone');
    }
    return t('upload.import.statusWaiting');
  };

  const submitLabel = () => {
    if (busy) return t('upload.import.importing');
    if (failedCount > 0) return t('upload.import.retryFailed', { count: failedCount });
    return sendable.length > 1 ? t('upload.import.startMany', { count: sendable.length }) : t('upload.import.start');
  };

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('upload.import.title')}</h1>
            <p>{t('upload.import.subtitle')}</p>
          </div>
          <button type="button" className="sc-btn" disabled={busy} onClick={() => navigate('/scores/upload')}>
            {t('upload.import.toOmr')}
          </button>
        </header>

        <form className="sc-upload" onSubmit={handleSubmit}>
          <section>
            <div
              className={`sc-dropzone ${dragging ? 'is-dragging' : ''} ${busy ? 'is-disabled' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) pick(Array.from(e.dataTransfer.files));
              }}
            >
              <h3>{t('upload.import.dropTitle')}</h3>
              <p>{t('upload.import.dropHint', { max: MAX_FILES })}</p>
              <button
                type="button"
                className="sc-btn sc-btn--primary"
                disabled={busy || items.length >= MAX_FILES}
                onClick={() => inputRef.current?.click()}
              >
                {t('upload.chooseFile')}
              </button>
              <input
                ref={inputRef}
                type="file"
                hidden
                multiple
                accept=".musicxml,.xml,.mxl,.mid,.midi"
                onChange={(e) => {
                  pick(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </div>
            {items.length > 0 && (
              <>
                <div className="sc-upload__summary">
                  <span>{t('upload.import.filesCount', { count: items.length, max: MAX_FILES })}</span>
                  <button type="button" className="sc-btn sc-btn--sm" disabled={busy} onClick={() => setItems([])}>
                    {t('upload.import.removeAll')}
                  </button>
                </div>
                <ul className="sc-upfiles">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className={`sc-upfile sc-upfile--import${it.invalid || it.status === 'failed' ? ' has-error' : ''}`}
                    >
                      <div className="sc-upfile__info">
                        <div className="sc-upfile__name">{it.file.name}</div>
                        <div className="sc-upfile__meta">
                          {formatSize(it.file.size)} · {statusText(it)}
                        </div>
                        {it.status === 'uploading' && (
                          <div className="sc-progress sc-progress--wide" role="progressbar" aria-valuenow={it.progress}>
                            <div className="sc-progress__bar" style={{ width: `${it.progress}%` }} />
                          </div>
                        )}
                      </div>
                      {it.status === 'done' && it.scoreId ? (
                        <Link className="sc-btn sc-btn--sm" to={`/scores/${it.scoreId}`}>
                          {t('upload.import.openScore')}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="sc-btn sc-btn--sm"
                          disabled={busy}
                          onClick={() => setItems((list) => list.filter((x) => x.id !== it.id))}
                        >
                          {t('upload.import.removeFile')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <aside className="sc-upload__side">
            <label className="sc-label" htmlFor="im-title">
              {t('upload.fieldTitle')}
            </label>
            <input
              id="im-title"
              className="sc-input"
              value={items.length > 1 ? '' : shownTitle}
              maxLength={MAX_TITLE}
              disabled={busy || items.length > 1}
              placeholder={items.length > 1 ? t('upload.import.batchTitleHint') : t('upload.import.titlePlaceholder')}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
            />

            <label className="sc-label sc-upload__field" htmlFor="im-composer">
              {t('upload.fieldComposer')} <span className="sc-upload__optional">({t('scores.request.optional')})</span>
            </label>
            <input
              id="im-composer"
              className="sc-input"
              list="im-composer-list"
              value={composer}
              maxLength={MAX_COMPOSER}
              disabled={busy}
              placeholder={t('upload.import.composerPlaceholder')}
              onChange={(e) => setComposer(e.target.value)}
            />
            <ComposerDatalist id="im-composer-list" />

            {playlists.length > 0 && (
              <>
                <label className="sc-label sc-upload__field" htmlFor="im-playlist">
                  {t('upload.import.playlist')}{' '}
                  <span className="sc-upload__optional">({t('scores.request.optional')})</span>
                </label>
                <select
                  id="im-playlist"
                  className="sc-input"
                  value={playlistId}
                  disabled={busy}
                  onChange={(e) => setPlaylistId(e.target.value)}
                >
                  <option value="">{t('upload.import.playlistNone')}</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {allTags.length > 0 && (
              <>
                <span className="sc-label sc-upload__field">
                  {t('scores.explore.tag')}{' '}
                  <span className="sc-upload__optional">({t('scores.request.optional')})</span>
                  <span className="sc-counter">
                    {tagIds.length}/{MAX_TAGS}
                  </span>
                </span>
                <div className="sc-tagpick" role="group" aria-label={t('scores.explore.tag')}>
                  {allTags.map((tag) => {
                    const active = tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={active}
                        className={`sc-tagpick__opt ${active ? 'is-active' : ''}`}
                        disabled={busy || (!active && tagIds.length >= MAX_TAGS)}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {finished ? (
              <div className="sc-upload__submit">
                <p>{t('upload.import.batchDone', { done: doneCount, total: items.length })}</p>
                <Link className="sc-btn sc-btn--primary" to="/scores">
                  {t('upload.import.toLibrary')}
                </Link>
                {playlistId && (
                  <Link className="sc-btn" to={`/playlists/${playlistId}`}>
                    {t('upload.import.toPlaylist')}
                  </Link>
                )}
              </div>
            ) : (
              <button type="submit" className="sc-btn sc-btn--primary sc-upload__submit" disabled={!canSubmit}>
                {submitLabel()}
              </button>
            )}
          </aside>
        </form>
      </main>
    </div>
  );
}
