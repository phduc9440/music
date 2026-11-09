import type { DragEvent } from 'react';
import { formatSize, isPdf } from '../../utils/score';

/** Một file người dùng đã chọn trên trang upload, kèm kết quả kiểm tra nội dung (pdf.js / đo ảnh). */
export interface UploadItem {
  id: string;
  file: File;
  /** Góc xoay theo chiều kim đồng hồ: 0, 90, 180, 270 (chỉ áp cho ảnh, xoay thật lúc gửi). */
  rotation: number;
  inspecting: boolean;
  preview?: string;
  pageCount?: number;
  width?: number;
  height?: number;
  /** Lỗi nội dung từ bước kiểm tra (PDF mã hóa, ảnh quá nhỏ...). */
  inspectError?: string;
}

interface Props {
  index: number;
  item: UploadItem;
  error: string;
  disabled?: boolean;
  /** Ảnh có thể kéo-thả để đổi thứ tự trang. */
  draggable: boolean;
  isDragOver: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onRotate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/**
 * Thẻ một file đã chọn (doc 2.1 bước 3):
 *  - PDF: ảnh trang 1, tên, dung lượng, số trang.
 *  - Ảnh: thumbnail đánh số trang, kéo-thả để đổi thứ tự, nút xoay 90° và xóa.
 *  - File lỗi: viền đỏ kèm lý do.
 */
export default function UploadFileItem({
  index,
  item,
  error,
  disabled,
  draggable,
  isDragOver,
  canMoveUp,
  canMoveDown,
  onMove,
  onRotate,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const pdf = isPdf(item.file);
  const canDrag = draggable && !disabled;

  const meta = [formatSize(item.file.size)];
  if (pdf && item.pageCount) meta.push(`${item.pageCount} trang`);
  if (!pdf && item.width && item.height) meta.push(`${item.width}×${item.height}`);

  return (
    <li
      className={`sc-upfile ${pdf ? 'sc-upfile--pdf' : ''} ${error ? 'has-error' : ''} ${isDragOver ? 'is-over' : ''}`}
      draggable={canDrag}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e: DragEvent) => {
        if (!canDrag) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e: DragEvent) => {
        if (!canDrag) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="sc-upfile__thumb">
        {!pdf && <span className="sc-upfile__order">{index + 1}</span>}
        {item.inspecting ? (
          <span className="sc-upfile__placeholder">Đang đọc...</span>
        ) : item.preview ? (
          <img
            src={item.preview}
            alt={item.file.name}
            draggable={false}
            style={item.rotation ? { transform: `rotate(${item.rotation}deg)` } : undefined}
          />
        ) : (
          <span className="sc-upfile__placeholder">{pdf ? 'PDF' : 'Ảnh'}</span>
        )}
      </div>

      <div className="sc-upfile__info">
        <div className="sc-upfile__name" title={item.file.name}>
          {item.file.name}
        </div>
        <div className="sc-upfile__meta">{meta.join(' · ')}</div>
        {error && <div className="sc-upfile__error">{error}</div>}
      </div>

      <div className="sc-upfile__actions">
        {!pdf && (
          <>
            <button
              type="button"
              className="sc-icon-btn"
              disabled={disabled || !canMoveUp}
              onClick={() => onMove(-1)}
              aria-label="Đưa lên trang trước"
              title="Đưa lên trang trước"
            >
              ‹
            </button>
            <button
              type="button"
              className="sc-icon-btn"
              disabled={disabled || !canMoveDown}
              onClick={() => onMove(1)}
              aria-label="Đưa xuống trang sau"
              title="Đưa xuống trang sau"
            >
              ›
            </button>
            <button
              type="button"
              className="sc-icon-btn"
              disabled={disabled || item.inspecting || !item.preview}
              onClick={onRotate}
              aria-label="Xoay 90 độ"
              title="Xoay 90°"
            >
              ↻
            </button>
          </>
        )}
        <button
          type="button"
          className="sc-icon-btn"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Xóa file"
          title="Xóa"
        >
          ×
        </button>
      </div>
    </li>
  );
}
