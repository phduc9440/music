import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import UploadDropzone from '../../components/scores/UploadDropzone';
import UploadFileItem from '../../components/scores/UploadFileItem';
import type { UploadItem } from '../../components/scores/UploadFileItem';
import { omrApi } from '../../services';
import type { OmrSourceType } from '../../types';
import {
  fileNameWithoutExtension,
  getScorePath,
  getUploadErrorMessage,
  guessSourceType,
  isPdf,
  MAX_COMPOSER,
  MAX_TITLE,
  OMR_SOURCE_LABELS,
  validateUploadBatch,
  validateUploadFile,
} from '../../utils/score';
import { inspectFile, rotateImageFile } from '../../utils/uploadInspect';
import '../../components/scores/scores.css';
import './ScoreUpload.css';

const SOURCE_TYPES = Object.keys(OMR_SOURCE_LABELS) as OmrSourceType[];

const newItem = (file: File): UploadItem => ({
  id: crypto.randomUUID(),
  file,
  rotation: 0,
  // File sai đuôi/rỗng/quá lớn thì không cần đọc nội dung
  inspecting: !validateUploadFile(file),
});

/** Trang /scores/upload: chọn PDF hoặc ảnh, kiểm tra ngay ở client rồi gửi lên /omr/upload (doc mục 2.1). */
export default function ScoreUpload() {
  const navigate = useNavigate();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false); // người dùng đã tự sửa tiêu đề thì không tự điền nữa
  const [composer, setComposer] = useState('');
  const [sourceType, setSourceType] = useState<OmrSourceType>('PHOTO');
  const [sourceTouched, setSourceTouched] = useState(false); // tương tự: đã tự chọn loại nguồn thì không tự đoán
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false); // đang xoay ảnh trước khi gửi
  const [progress, setProgress] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const files = items.map((it) => it.file);
  // Lỗi tính trực tiếp từ danh sách nên luôn khớp với những gì đang hiển thị
  const itemErrors = items.map((it) => validateUploadFile(it.file) || it.inspectError || '');
  const batchError = validateUploadBatch(files);
  const inspecting = items.some((it) => it.inspecting);
  const busy = uploading || preparing;
  const canSubmit =
    items.length > 0 &&
    !itemErrors.some(Boolean) &&
    !batchError &&
    !inspecting &&
    !busy &&
    title.length <= MAX_TITLE &&
    composer.length <= MAX_COMPOSER;
  const onlyImages = items.length > 0 && !items.some((it) => isPdf(it.file));
  const totalPages = onlyImages ? items.length : (items.find((it) => isPdf(it.file))?.pageCount ?? 0);

  // Đang tải lên mà thoát trang thì trình duyệt cảnh báo
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const updateItems = (next: UploadItem[]) => {
    setItems(next);
    const nextFiles = next.map((it) => it.file);
    // Tiêu đề tự điền theo tên file đầu tiên, loại nguồn tự đoán theo loại file, trừ khi người dùng đã tự sửa
    if (!titleTouched) setTitle(next.length ? fileNameWithoutExtension(next[0].file.name).slice(0, MAX_TITLE) : '');
    if (!sourceTouched) setSourceType(guessSourceType(nextFiles));
  };

  // Đọc nội dung từng file mới (pdf.js / kích thước ảnh), xong cái nào cập nhật cái đó
  const inspect = (added: UploadItem[]) => {
    added
      .filter((it) => it.inspecting)
      .forEach((it) => {
        inspectFile(it.file)
          .catch(() => ({ error: 'Không đọc được file' }))
          .then((result) => {
            setItems((prev) =>
              prev.map((p) =>
                p.id === it.id ? { ...p, ...result, inspectError: result.error, inspecting: false } : p,
              ),
            );
          });
      });
  };

  const handleAdd = (added: File[]) => {
    if (added.length === 0) return;
    const addedItems = added.map(newItem);
    // PDF đi một mình: chọn PDF mới thì thay toàn bộ danh sách cũ (nếu chọn nhiều file kèm PDF thì để
    // validateUploadBatch báo lỗi cho người dùng tự bỏ bớt)
    const next = added.some(isPdf) ? addedItems : [...items.filter((it) => !isPdf(it.file)), ...addedItems];
    updateItems(next);
    inspect(addedItems);
  };

  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateItems(next);
  };

  const rotateItem = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, rotation: (it.rotation + 90) % 360 } : it)));

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    // Áp dụng góc xoay vào ảnh thật trước khi gửi
    let finalFiles: File[];
    setPreparing(true);
    try {
      finalFiles = await Promise.all(items.map((it) => rotateImageFile(it.file, it.rotation)));
    } catch {
      toast.error('Không xoay được ảnh, hãy bỏ xoay rồi thử lại');
      setPreparing(false);
      return;
    }
    setPreparing(false);

    setUploading(true);
    setProgress(0);
    try {
      const res = await omrApi.upload({ files: finalFiles, title, composer, sourceType }, setProgress);
      toast.success('Đã tải lên, bản nhạc đang chờ số hóa');
      const created = res.data.result;
      // TODO(feature/omr-preprocess): sau khi có trang tiến độ, getScorePath sẽ chuyển sang /scores/{id}/processing
      navigate(getScorePath(created.scoreId, 'PENDING'), { replace: true });
    } catch (err) {
      // Giữ nguyên các file đã chọn để người dùng sửa rồi thử lại
      toast.error(getUploadErrorMessage(err));
      setUploading(false);
    }
  };

  return (
    <div className="sc-page">
      <nav className="navbar">
        <div className="navbar-brand">Music App</div>
        <div className="navbar-nav">
          <button className="sc-btn sc-btn--sm" disabled={busy} onClick={() => navigate('/scores')}>
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
            <UploadDropzone disabled={busy} onFiles={handleAdd} />
            {batchError && <div className="sc-error">{batchError}</div>}
            {items.length > 0 && (
              <>
                <div className="sc-upload__summary">
                  <span>
                    {onlyImages ? `${items.length} ảnh` : '1 file PDF'}
                    {totalPages > 0 && ` · ${totalPages} trang`}
                  </span>
                  {onlyImages && items.length > 1 && <span>Kéo thả ảnh để đổi thứ tự trang</span>}
                </div>
                <ul className={`sc-upfiles ${onlyImages ? 'sc-upfiles--grid' : ''}`}>
                  {items.map((it, i) => (
                    <UploadFileItem
                      key={it.id}
                      index={i}
                      item={it}
                      error={itemErrors[i]}
                      disabled={busy}
                      draggable={onlyImages && items.length > 1}
                      isDragOver={dragIndex !== null && overIndex === i && dragIndex !== i}
                      canMoveUp={i > 0}
                      canMoveDown={i < items.length - 1}
                      onMove={(d) => moveItem(i, i + d)}
                      onRotate={() => rotateItem(it.id)}
                      onRemove={() => updateItems(items.filter((p) => p.id !== it.id))}
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={() => setOverIndex(i)}
                      onDrop={() => {
                        if (dragIndex !== null) moveItem(dragIndex, i);
                        resetDrag();
                      }}
                      onDragEnd={resetDrag}
                    />
                  ))}
                </ul>
              </>
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
              disabled={busy}
              placeholder="Mặc định lấy theo tên file"
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
            />

            <label className="sc-label sc-upload__field" htmlFor="up-composer">
              Tác giả <span className="sc-upload__optional">(tùy chọn)</span>
            </label>
            <input
              id="up-composer"
              className="sc-input"
              value={composer}
              maxLength={MAX_COMPOSER}
              disabled={busy}
              placeholder="Ví dụ: Trịnh Công Sơn"
              onChange={(e) => setComposer(e.target.value)}
            />

            <span className="sc-label sc-upload__field">Loại nguồn</span>
            <div className="sc-segment" role="radiogroup" aria-label="Loại nguồn">
              {SOURCE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={sourceType === type}
                  className={`sc-segment__opt ${sourceType === type ? 'is-active' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setSourceType(type);
                    setSourceTouched(true);
                  }}
                >
                  {OMR_SOURCE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="sc-upload__hint">
              {sourceTouched ? 'Dùng để thống kê độ chính xác nhận diện.' : 'Tự đoán theo loại file, bạn có thể đổi.'}
            </p>

            {(busy || inspecting) && (
              <div className="sc-upload__progress">
                {uploading && (
                  <div className="sc-progress sc-progress--wide" role="progressbar" aria-valuenow={progress}>
                    <div className="sc-progress__bar" style={{ width: `${progress}%` }} />
                  </div>
                )}
                <span>
                  {uploading
                    ? `Đang tải lên... ${progress}%`
                    : preparing
                      ? 'Đang chuẩn bị ảnh...'
                      : 'Đang kiểm tra file...'}
                </span>
              </div>
            )}

            <button type="submit" className="sc-btn sc-btn--primary sc-upload__submit" disabled={!canSubmit}>
              {busy ? 'Đang tải lên...' : 'Bắt đầu số hóa'}
            </button>
          </aside>
        </form>
      </main>
    </div>
  );
}
