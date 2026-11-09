import type { AiTaskInfo } from '../../types';
import { stepLabel } from './exportUtils';

/** Màn hình tiến độ của một tác vụ xuất file: bước hiện tại, thanh tiến độ, nút Hủy và Đóng. */
export default function ExportRunningView({
  task,
  cancelling,
  onCancel,
  onClose,
}: {
  task: AiTaskInfo;
  cancelling: boolean;
  onCancel: () => void;
  onClose: () => void;
}) {
  const progress = Math.min(100, Math.max(0, task.progress ?? 0));
  return (
    <div className="ex-body" aria-live="polite">
      <p className="ex-step">{stepLabel(task.step)}...</p>
      <div className="sc-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="sc-progress__bar sc-progress__bar--processing" style={{ width: `${progress}%` }} />
      </div>
      <p className="ex-hint">Bạn có thể đóng hộp thoại, việc xuất file vẫn chạy nền và sẽ có thông báo khi xong.</p>
      <div className="sc-modal__actions">
        <button className="sc-btn sc-btn--danger" onClick={onCancel} disabled={cancelling}>
          {cancelling ? 'Đang hủy...' : 'Hủy xuất file'}
        </button>
        <button className="sc-btn" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
}
