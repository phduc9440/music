import { toast } from 'react-toastify';
import { downloadFile } from '../../services';
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS, formatDateTime } from '../../utils/score';
import type { AiTaskInfo, ScoreFileInfo } from '../../types';
import { EXPORT_TASK_TYPES, stepLabel, translateTaskError } from '../export/exportUtils';

/** File do tác vụ xuất tạo ra (id nằm trong resultData.fileId), nếu còn trong danh sách file của bản nhạc. */
const exportedFileOf = (task: AiTaskInfo, files: ScoreFileInfo[]): ScoreFileInfo | undefined => {
  if (task.status !== 'COMPLETED' || !EXPORT_TASK_TYPES.includes(task.taskType)) return undefined;
  const fileId = (task.resultData as { fileId?: string } | null | undefined)?.fileId;
  const file = fileId ? files.find((f) => f.id === fileId) : undefined;
  // SVG có nhiều trang, tải ZIP ở hộp thoại Xuất SVG nên không đưa nút tải một trang ở đây
  return file?.fileType === 'SVG' ? undefined : file;
};

/** Tác vụ mới nhất của mỗi loại, kèm thanh tiến độ. Tác vụ xuất file đã xong có nút Tải xuống. */
export default function TasksTable({ tasks, files = [] }: { tasks: AiTaskInfo[]; files?: ScoreFileInfo[] }) {
  if (tasks.length === 0) {
    return <div className="sc-panel sc-panel--empty">Chưa có tác vụ nào.</div>;
  }

  return (
    <div className="sc-panel sc-table-wrap">
      <table className="sc-table">
        <thead>
          <tr>
            <th>Tác vụ</th>
            <th>Trạng thái</th>
            <th>Tiến độ</th>
            <th>Bắt đầu</th>
            <th>Kết thúc</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const progress = Math.min(100, Math.max(0, t.progress ?? 0));
            const isExport = EXPORT_TASK_TYPES.includes(t.taskType);
            const exported = exportedFileOf(t, files);
            return (
              <tr key={t.id}>
                <td>
                  <div className="sc-table__name">{TASK_TYPE_LABELS[t.taskType] ?? t.taskType}</div>
                  {t.step && <div className="sc-table__sub">Bước: {isExport ? stepLabel(t.step) : t.step}</div>}
                  {t.errorMessage && (
                    <div className="sc-table__error">
                      {isExport ? translateTaskError(t.errorMessage) : t.errorMessage}
                    </div>
                  )}
                  {exported && (
                    <button
                      className="sc-btn sc-btn--sm"
                      onClick={() =>
                        downloadFile(exported.downloadUrl, exported.originalFileName || exported.id).catch(() =>
                          toast.error('Không tải được file'),
                        )
                      }
                    >
                      Tải xuống
                    </button>
                  )}
                </td>
                <td>
                  <span className={`sc-status sc-status--${t.status.toLowerCase()}`}>
                    {TASK_STATUS_LABELS[t.status] ?? t.status}
                  </span>
                </td>
                <td className="sc-progress-cell">
                  <div
                    className="sc-progress"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`sc-progress__bar sc-progress__bar--${t.status.toLowerCase()}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="sc-progress__text">{progress}%</span>
                </td>
                <td>{formatDateTime(t.startedAt ?? t.createdAt)}</td>
                <td>{formatDateTime(t.finishedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
