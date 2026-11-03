import { TASK_STATUS_LABELS, TASK_TYPE_LABELS, formatDateTime } from '../../utils/score';
import type { AiTaskInfo } from '../../types';

/** Tác vụ mới nhất của mỗi loại, kèm thanh tiến độ. */
export default function TasksTable({ tasks }: { tasks: AiTaskInfo[] }) {
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
            return (
              <tr key={t.id}>
                <td>
                  <div className="sc-table__name">{TASK_TYPE_LABELS[t.taskType] ?? t.taskType}</div>
                  {t.step && <div className="sc-table__sub">Bước: {t.step}</div>}
                  {t.errorMessage && <div className="sc-table__error">{t.errorMessage}</div>}
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
