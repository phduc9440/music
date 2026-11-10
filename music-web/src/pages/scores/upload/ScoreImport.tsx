import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
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
import '../../../components/scores/scores.css';
import './ScoreUpload.css';

const MAX_TAGS = 10; // khớp BE (mã lỗi 2302)
const IMPORT_EXTENSIONS = ['musicxml', 'xml', 'mxl', 'mid', 'midi'];

const validateImportFile = (file: File): string => {
  if (!IMPORT_EXTENSIONS.includes(getExtension(file.name))) return 'Chỉ hỗ trợ .musicxml, .xml, .mxl, .mid, .midi';
  if (file.size === 0) return 'File rỗng (0 byte)';
  if (file.size > UPLOAD_MAX_FILE_BYTES) return `File quá lớn (tối đa ${UPLOAD_MAX_FILE_BYTES / 1024 / 1024}MB)`;
  return '';
};

/** Trang /scores/import: nhập trực tiếp MusicXML / MIDI, không qua OMR (doc mục 3.4). */
export default function ScoreImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
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
      toast.success('Đã nhập bản nhạc');
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
            <h1>Nhập file MusicXML / MIDI</h1>
            <p>Dùng khi bạn đã có file số, không cần số hóa từ ảnh hoặc PDF</p>
          </div>
          <button type="button" className="sc-btn" disabled={uploading} onClick={() => navigate('/scores/upload')}>
            Tải PDF / ảnh (OMR)
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
              <h3>Kéo thả file vào đây</h3>
              <p>1 file .musicxml, .xml, .mxl hoặc .mid, .midi (≤ 50MB)</p>
              <button
                type="button"
                className="sc-btn sc-btn--primary"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                Chọn file
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
                  Bỏ file
                </button>
              </div>
            )}
            {fileError && <div className="sc-error">{fileError}</div>}
          </section>

          <aside className="sc-upload__side">
            <label className="sc-label" htmlFor="im-title">
              Tiêu đề
            </label>
            <input
              id="im-title"
              className="sc-input"
              value={title}
              maxLength={MAX_TITLE}
              disabled={uploading}
              placeholder="Mặc định lấy từ file"
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
            />

            <label className="sc-label sc-upload__field" htmlFor="im-composer">
              Tác giả <span className="sc-upload__optional">(tùy chọn)</span>
            </label>
            <input
              id="im-composer"
              className="sc-input"
              value={composer}
              maxLength={MAX_COMPOSER}
              disabled={uploading}
              placeholder="Mặc định lấy từ file MusicXML"
              onChange={(e) => setComposer(e.target.value)}
            />

            {allTags.length > 0 && (
              <>
                <span className="sc-label sc-upload__field">
                  Thể loại <span className="sc-upload__optional">(tùy chọn)</span>
                  <span className="sc-counter">
                    {tagIds.length}/{MAX_TAGS}
                  </span>
                </span>
                <div className="sc-tagpick" role="group" aria-label="Thể loại">
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
                <span>Đang tải lên... {progress}%</span>
              </div>
            )}

            <button type="submit" className="sc-btn sc-btn--primary sc-upload__submit" disabled={!canSubmit}>
              {uploading ? 'Đang nhập...' : 'Nhập bản nhạc'}
            </button>
          </aside>
        </form>
      </main>
    </div>
  );
}
