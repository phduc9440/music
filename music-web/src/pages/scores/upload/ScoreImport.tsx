import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import { toast } from 'react-toastify';
import ComposerDatalist from '../../../components/composers/ComposerDatalist';
import { importApi, tagApi } from '../../../services';
import type { Tag } from '../../../types';
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
import '../../../components/scores/scores.css';
import './ScoreUpload.css';
import { t } from '../../../i18n/core';

const MAX_TAGS = 10; // khớp BE (mã lỗi 2302)
const IMPORT_EXTENSIONS = ['musicxml', 'xml', 'mxl', 'mid', 'midi'];

const validateImportFile = (file: File): string => {
  if (!IMPORT_EXTENSIONS.includes(getExtension(file.name))) return t('upload.import.unsupported');
  if (file.size === 0) return t('upload.import.empty');
  if (file.size > UPLOAD_MAX_FILE_BYTES)
    return t('upload.import.tooLarge', { max: UPLOAD_MAX_FILE_BYTES / 1024 / 1024 });
  return '';
};

/** Trang /scores/import: nhập trực tiếp MusicXML / MIDI, không qua OMR (doc mục 3.4). */
export default function ScoreImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  // File khách đã thả vào trang chủ trước khi đăng nhập (mục 5.3): chọn sẵn để không phải chọn lại
  const [pendingFile] = useState<File | null>(() => {
    const pending = peekPendingUpload();
    return pending && isImportBatch(pending) ? pending[0] : null;
  });
  const [file, setFile] = useState<File | null>(pendingFile);
  const [title, setTitle] = useState(() =>
    pendingFile ? fileNameWithoutExtension(pendingFile.name).slice(0, MAX_TITLE) : '',
  );
  const [titleTouched, setTitleTouched] = useState(false);
  const [composer, setComposer] = useState('');
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const fileError = file ? validateImportFile(file) : '';
  const canSubmit = !!file && !fileError && !uploading && title.length <= MAX_TITLE && composer.length <= MAX_COMPOSER;

  // Lỗi tải danh sách thể loại thì vẫn import được, chỉ không chọn được thể loại
  useEffect(() => {
    tagApi
      .list()
      .then((res) => setAllTags(res.data.result))
      .catch(() => setAllTags([]));
  }, []);

  useEffect(() => clearPendingUpload(), []);

  const toggleTag = (id: string) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const pick = (files: File[]) => {
    const next = files[0];
    if (!next) return;
    setFile(next);
    // Để trống thì BE tự lấy work-title trong MusicXML; ở đây chỉ gợi ý theo tên file
    if (!titleTouched) setTitle(fileNameWithoutExtension(next.name).slice(0, MAX_TITLE));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !canSubmit) return;
    setUploading(true);
    setProgress(0);
    try {
      const res = await importApi.importScore(
        { file, title: titleTouched ? title : '', composer, tagIds },
        setProgress,
      );
      toast.success(t('upload.import.done'));
      navigate(`/scores/${res.data.result.scoreId}`, { replace: true });
    } catch (err) {
      toast.error(getUploadErrorMessage(err));
      setUploading(false);
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container sc-container--form">
        <header className="sc-lib-head">
          <div>
            <h1>{t('upload.import.title')}</h1>
            <p>{t('upload.import.subtitle')}</p>
          </div>
          <button type="button" className="sc-btn" disabled={uploading} onClick={() => navigate('/scores/upload')}>
            {t('upload.import.toOmr')}
          </button>
        </header>

        <form className="sc-upload" onSubmit={handleSubmit}>
          <section>
            <div
              className={`sc-dropzone ${dragging ? 'is-dragging' : ''} ${uploading ? 'is-disabled' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!uploading) pick(Array.from(e.dataTransfer.files));
              }}
            >
              <h3>{t('upload.import.dropTitle')}</h3>
              <p>{t('upload.import.dropHint')}</p>
              <button
                type="button"
                className="sc-btn sc-btn--primary"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {t('upload.chooseFile')}
              </button>
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".musicxml,.xml,.mxl,.mid,.midi"
                onChange={(e) => {
                  pick(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </div>
            {file && (
              <div className="sc-upload__summary">
                <span>
                  {file.name} · {formatSize(file.size)}
                </span>
                <button type="button" className="sc-btn sc-btn--sm" disabled={uploading} onClick={() => setFile(null)}>
                  {t('upload.import.removeFile')}
                </button>
              </div>
            )}
            {fileError && <div className="sc-error">{fileError}</div>}
          </section>

          <aside className="sc-upload__side">
            <label className="sc-label" htmlFor="im-title">
              {t('upload.fieldTitle')}
            </label>
            <input
              id="im-title"
              className="sc-input"
              value={title}
              maxLength={MAX_TITLE}
              disabled={uploading}
              placeholder={t('upload.import.titlePlaceholder')}
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
              disabled={uploading}
              placeholder={t('upload.import.composerPlaceholder')}
              onChange={(e) => setComposer(e.target.value)}
            />
            <ComposerDatalist id="im-composer-list" />

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
                  {allTags.map((t) => {
                    const active = tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        className={`sc-tagpick__opt ${active ? 'is-active' : ''}`}
                        disabled={uploading || (!active && tagIds.length >= MAX_TAGS)}
                        onClick={() => toggleTag(t.id)}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {uploading && (
              <div className="sc-upload__progress">
                <div className="sc-progress sc-progress--wide" role="progressbar" aria-valuenow={progress}>
                  <div className="sc-progress__bar" style={{ width: `${progress}%` }} />
                </div>
                <span>{t('upload.uploading', { progress })}</span>
              </div>
            )}

            <button type="submit" className="sc-btn sc-btn--primary sc-upload__submit" disabled={!canSubmit}>
              {uploading ? t('upload.import.importing') : t('upload.import.start')}
            </button>
          </aside>
        </form>
      </main>
    </div>
  );
}
