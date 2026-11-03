import { useEffect, useState } from 'react';
import { formatSize, isPdf } from '../../utils/score';

interface Props {
  index: number;
  file: File;
  error: string;
  disabled?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** Thẻ một file đã chọn: ảnh xem trước (nếu là ảnh), thứ tự trang, lỗi (đỏ) và nút sắp xếp/xóa. */
export default function UploadFileItem({
  index,
  file,
  error,
  disabled,
  canMoveUp,
  canMoveDown,
  onMove,
  onRemove,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);

  // Đọc ảnh thành data URL để xem trước (không cần giải phóng bộ nhớ thủ công)
  useEffect(() => {
    if (isPdf(file) || error) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    return () => reader.abort();
  }, [file, error]);

  return (
    <li className={`sc-upfile ${error ? 'has-error' : ''}`}>
      <span className="sc-upfile__order">{index + 1}</span>
      <div className="sc-upfile__thumb">
        {isPdf(file) ? (
          <span className="sc-upfile__pdf">PDF</span>
        ) : preview ? (
          <img src={preview} alt={file.name} />
        ) : null}
      </div>
      <div className="sc-upfile__info">
        <div className="sc-upfile__name" title={file.name}>
          {file.name}
        </div>
        <div className="sc-upfile__meta">{formatSize(file.size)}</div>
        {error && <div className="sc-upfile__error">{error}</div>}
      </div>
      <div className="sc-upfile__actions">
        <button
          className="sc-icon-btn"
          disabled={disabled || !canMoveUp}
          onClick={() => onMove(-1)}
          aria-label="Đưa lên trước"
        >
          ↑
        </button>
        <button
          className="sc-icon-btn"
          disabled={disabled || !canMoveDown}
          onClick={() => onMove(1)}
          aria-label="Đưa xuống sau"
        >
          ↓
        </button>
        <button className="sc-icon-btn" disabled={disabled} onClick={onRemove} aria-label="Xóa file">
          ×
        </button>
      </div>
    </li>
  );
}
