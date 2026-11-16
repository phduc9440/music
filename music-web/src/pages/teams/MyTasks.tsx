import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../../components/ui';
import { teamApi } from '../../services';
import type { TeamTask } from '../../types';
import { t } from '../../i18n/core';
import TasksPanel from './TasksPanel';
import '../../components/scores/scores.css';
import './teams.css';
import './my-tasks.css';

/**
 * Trang /my-tasks: mọi bài được giao cho mình (phối hoặc duyệt) ở tất cả các nhóm, có tìm kiếm và bộ lọc. Cùng danh sách
 * này cũng nằm trong từng nhóm (tab Việc của tôi) và trong từng buổi diễn. Bộ lọc nằm trên URL nên gửi link được.
 */
export default function MyTasks() {
  const { pathname } = useLocation();
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    teamApi
      .myTasks()
      .then((res) => {
        if (cancelled) return;
        setNow(Date.now());
        setTasks(res.data.result);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        toast.error(t('tasks.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="mt-head">
          <div>
            <h1>{t('tasks.title')}</h1>
            <p>{t('tasks.subtitle')}</p>
          </div>
          <Link to="/teams" className="sc-btn">
            <Icon name="users" size={16} />
            {t('tasks.myTeams')}
          </Link>
        </header>

        {failed && (
          <div className="sc-empty">
            <h3>{t('tasks.loadFailed')}</h3>
            <p>{t('tasks.reload')}</p>
          </div>
        )}

        {!tasks && !failed && (
          <ul className="mt-list" aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="mt-card mt-card--skeleton" />
            ))}
          </ul>
        )}

        {tasks && <TasksPanel tasks={tasks} now={now} scope="all" syncUrl from={pathname} />}
      </main>
    </div>
  );
}
