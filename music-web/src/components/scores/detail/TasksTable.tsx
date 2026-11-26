import { toast } from 'react-toastify';
import { downloadFile } from '../../../services';
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS, formatDateTime, scoreDownloadName } from '../../../utils/score';
import type { AiTaskInfo, ScoreFileInfo } from '../../../types';
import { EXPORT_TASK_TYPES, stepLabel } from '../../export/exportUtils';
import { omrStepLabel } from '../../../utils/omr';
import { aiTaskErrorText } from '../../../utils/aiTaskErrors';
import { t as tr } from '../../../i18n/core';

/** Nhãn bước đang chạy theo loại tác vụ, không hiện mã "EXPORT", "INFERENCE"... */
const taskStepText = (task: AiTaskInfo, step: string): string =>
  EXPORT_TASK_TYPES.includes(task.taskType) ? stepLabel(step) : omrStepLabel(step);

/** File do tác vụ xuất tạo ra (id nằm trong resultData.fileId), nếu còn trong danh sách file của bản nhạc. */
const exportedFileOf = (task: AiTaskInfo, files: ScoreFileInfo[]): ScoreFileInfo | undefined => {
  if (task.status !== 'COMPLETED' || !EXPORT_TASK_TYPES.includes(task.taskType)) return undefined;
  const fileId = (task.resultData as { fileId?: string } | null | undefined)?.fileId;
  const file = fileId ? files.find((f) => f.id === fileId) : undefined;
  // SVG có nhiều trang, tải ZIP ở hộp thoại Xuất SVG nên không đưa nút tải một trang ở đây
  return file?.fileType === 'SVG' ? undefined : file;
};

/** Tác vụ mới nhất của mỗi loại, kèm thanh tiến độ. Tác vụ xuất file đã xong có nút Tải xuống. */
export default function TasksTable({
  tasks,
  files = [],
  title,
}: {
  tasks: AiTaskInfo[];
  files?: ScoreFileInfo[];
  /** Tên bản nhạc, đặt tên file xuất khi tải về (T37). */
  title: string;
}) {
  if (tasks.length === 0) {
    return <div className="sc-panel sc-panel--empty">{tr('scores.tasks.none')}</div>;
  }

  return (
    <div className="sc-panel sc-table-wrap">
      <table className="sc-table">
        <thead>
          <tr>
            <th>{tr('scores.tasks.task')}</th>
            <th>{tr('scores.tasks.status')}</th>
            <th>{tr('scores.tasks.progress')}</th>
            <th>{tr('scores.tasks.started')}</th>
            <th>{tr('scores.tasks.finished')}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const progress = Math.min(100, Math.max(0, t.progress ?? 0));
            const exported = exportedFileOf(t, files);
            // Bước chỉ có nghĩa khi tác vụ còn chạy; đã xong hay lỗi thì "Bước: EXPORT" chỉ gây rối
            const running = t.status === 'PENDING' || t.status === 'PROCESSING';
            return (
              <tr key={t.id}>
                <td>
                  <div className="sc-table__name">{TASK_TYPE_LABELS[t.taskType] ?? t.taskType}</div>
                  {t.step && running && (
                    <div className="sc-table__sub">
                      {tr('scores.tasks.step')}: {taskStepText(t, t.step)}
                    </div>
                  )}
                  {t.errorMessage && (t.status === 'FAILED' || t.status === 'CANCELLED') && (
                    <div className="sc-table__error">{aiTaskErrorText(t)}</div>
                  )}
                  {exported && (
                    <button
                      className="sc-btn sc-btn--sm"
                      onClick={() =>
                        downloadFile(
                          exported.downloadUrl,
                          scoreDownloadName(title, exported, exported.fileType.toLowerCase()),
                        ).catch(() => toast.error(tr('scores.files.downloadFailed')))
                      }
                    >
                      {tr('scores.tasks.download')}
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
