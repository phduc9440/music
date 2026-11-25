import { toast } from 'react-toastify';
import { downloadFile } from '../../../services';
import { TASK_STATUS_LABELS, TASK_TYPE_LABELS, formatDateTime } from '../../../utils/score';
import type { AiTaskInfo, ScoreFileInfo } from '../../../types';
import { EXPORT_TASK_TYPES, stepLabel, translateTaskError } from '../../export/exportUtils';
import { OMR_TASK_TYPE, describeTaskError, omrStepLabel, parseTaskError } from '../../../utils/omr';
import { hasKey, t as tr } from '../../../i18n/core';

/**
 * Lỗi của tác vụ theo ngôn ngữ người dùng (OMR-09): xuất file theo export.taskErrors, số hóa theo upload.errors (kèm chi
 * tiết như số trang), gợi ý hợp âm theo chords.taskErrors; không hiện mã kỹ thuật như "PAGE_UNREADABLE: trang 3".
 */
const taskErrorText = (task: AiTaskInfo): string => {
  const message = task.errorMessage ?? '';
  if (EXPORT_TASK_TYPES.includes(task.taskType)) return translateTaskError(message);
  if (task.taskType === OMR_TASK_TYPE) {
    const error = describeTaskError(task);
    return error.detail ? `${error.title} (${error.detail})` : error.title;
  }
  const { code } = parseTaskError(message);
  if (task.taskType === 'CHORD_GENERATION') {
    return hasKey(`chords.taskErrors.${code}`) ? tr(`chords.taskErrors.${code}`) : tr('chords.failed');
  }
  return message;
};

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
export default function TasksTable({ tasks, files = [] }: { tasks: AiTaskInfo[]; files?: ScoreFileInfo[] }) {
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
                    <div className="sc-table__error">{taskErrorText(t)}</div>
                  )}
                  {exported && (
                    <button
                      className="sc-btn sc-btn--sm"
                      onClick={() =>
                        downloadFile(exported.downloadUrl, exported.originalFileName || exported.id).catch(() =>
                          toast.error(tr('scores.files.downloadFailed')),
                        )
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
