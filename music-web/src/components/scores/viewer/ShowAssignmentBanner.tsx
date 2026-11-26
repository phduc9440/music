import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { teamApi } from '../../../services';
import type { TeamTask } from '../../../types';
import { formatDate, t } from '../../../i18n/core';
import './ShowAssignmentBanner.css';

/** Dải "Bài trong buổi diễn" ở đầu Editor: cho người phối biết bài này đang được giao trong show nào, hạn khi nào. */
export default function ShowAssignmentBanner({ scoreId }: { scoreId: string }) {
  const [tasks, setTasks] = useState<TeamTask[]>([]);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .myTasks()
      .then((res) => {
        if (!cancelled) setTasks(res.data.result.filter((task) => task.scoreId === scoreId));
      })
      .catch(() => undefined); // dải chỉ là gợi ý, lỗi thì không hiện gì
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  if (tasks.length === 0) return null;
  return (
    <div className="sv-assign" role="status">
      {tasks.map((task) => (
        <div key={task.itemId} className="sv-assign__row">
          <span>
            {t('scores.assignment.text', { show: task.showName, status: t(`teams.status.${task.status}`) })}
            {task.dueDate && ` · ${t('scores.assignment.due', { date: formatDate(task.dueDate) })}`}
          </span>
          <Link to={`/teams/${task.teamId}/shows/${task.showId}`}>{t('scores.assignment.open')}</Link>
        </div>
      ))}
    </div>
  );
}
