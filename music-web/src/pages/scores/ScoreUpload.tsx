import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import UploadDropzone from '../../components/scores/UploadDropzone';
import UploadFileItem from '../../components/scores/UploadFileItem';
import { omrApi } from '../../services';
import {
  fileNameWithoutExtension,
  getErrorMessage,
  getScorePath,
  isPdf,
  MAX_TITLE,
  validateUploadBatch,
  validateUploadFile,
} from '../../utils/score';
import '../../components/scores/scores.css';
import './ScoreUpload.css';

/** Trang /scores/upload: chọn PDF hoặc ảnh, kiểm tra ngay ở client rồi gửi lên /omr/upload (doc mục 2.1). */
export default function ScoreUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false); // người dùng đã tự sửa tiêu đề thì không tự điền nữa
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Lỗi tính trực tiếp từ danh sách file nên luôn khớp với những gì đang hiển thị
  const fileErrors = files.map(validateUploadFile);
  const batchError = validateUploadBatch(files);
  const canSubmit =
    files.length > 0 && !fileErrors.some(Boolean) && !batchError && !uploading && title.length <= MAX_TITLE;

  // Đang tải lên mà thoát trang thì trình duyệt cảnh báo
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  const updateFiles = (next: File[]) => {
    setFiles(next);
    // Tiêu đề tự điền theo tên file đầu tiên, trừ khi người dùng đã tự sửa
    if (!titleTouched) setTitle(next.length ? fileNameWithoutExtension(next[0].name).slice(0, MAX_TITLE) : '');
  };

  const handleAdd = (added: File[]) => {
    if (added.length === 0) return;
    // PDF đi một mình: chọn PDF mới thì thay toàn bộ danh sách cũ
    if (added.some(isPdf)) {
      updateFiles([
        added.find(isPdf) as File,
        ...added.filter((f) => isPdf(f)).slice(1),
        ...added.filter((f) => !isPdf(f)),
      ]);
      return;
    }
    updateFiles([...files, ...added]);
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const next = [...files];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    updateFiles(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setUploading(true);
    setProgress(0);
    try {
      const res = await omrApi.upload(files, title, setProgress);
      toast.success('Đã tải lên, bản nhạc đang chờ số hóa');
      const created = res.data.result;
      // TODO(feature/omr-preprocess): sau khi có trang tiến độ, getScorePath sẽ chuyển sang /scores/{id}/processing
      navigate(getScorePath(created.scoreId, 'PENDING'), { replace: true });
    } catch (err) {
      // Giữ nguyên các file đã chọn để người dùng sửa rồi thử lại
      toast.error(getErrorMessage(err, 'Tải lên thất bại, vui lòng thử lại'));
      setUploading(false);
    }
  };

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <button className="sc-btn sc-btn--sm" disabled={uploading} onClick={() => navigate('/scores')}>
            ‹ Thư viện
          </button>
        </div>
      </nav>

      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Tải bản nhạc lên</h1>
            <p>Hệ thống sẽ số hóa bản nhạc thành MusicXML và MIDI</p>
          </div>
        </header>

        <form className="sc-upload" onSubmit={handleSubmit}>
          <section>
            <UploadDropzone disabled={uploading} onFiles={handleAdd} />
            {batchError && <div className="sc-error">{batchError}</div>}
            {files.length > 0 && (
              <ul className="sc-upfiles">
                {files.map((f, i) => (
                  <UploadFileItem
                    key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                    index={i}
                    file={f}
                    error={fileErrors[i]}
                    disabled={uploading}
                    canMoveUp={i > 0}
                    canMoveDown={i < files.length - 1}
                    onMove={(d) => handleMove(i, d)}
                    onRemove={() => updateFiles(files.filter((_, idx) => idx !== i))}
                  />
                ))}
              </ul>
            )}
          </section>

          <aside className="sc-upload__side">
            <label className="sc-label" htmlFor="up-title">
              Tiêu đề
            </label>
            <input
              id="up-title"
              className="sc-input"
              value={title}
              maxLength={MAX_TITLE}
              disabled={uploading}
              placeholder="Mặc định lấy theo tên file"
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
            />
            {/* TODO(feature/omr-upload): thêm ô Tác giả và Loại nguồn (Ảnh chụp / Bản scan / PDF gốc) khi BE nhận composer, sourceType */}

            {uploading && (
              <div className="sc-upload__progress">
                <div className="sc-progress sc-progress--wide" role="progressbar" aria-valuenow={progress}>
                  <div className="sc-progress__bar" style={{ width: `${progress}%` }} />
                </div>
                <span>Đang tải lên... {progress}%</span>
              </div>
            )}

            <button type="submit" className="sc-btn sc-btn--primary sc-upload__submit" disabled={!canSubmit}>
              {uploading ? 'Đang tải lên...' : 'Bắt đầu số hóa'}
            </button>
          </aside>
        </form>
      </main>
    </div>
  );
}
