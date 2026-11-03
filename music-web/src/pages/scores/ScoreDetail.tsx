import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import DeleteScoreModal from '../../components/scores/DeleteScoreModal';
import EditScoreModal from '../../components/scores/EditScoreModal';
import FilesTable from '../../components/scores/FilesTable';
import ScoreHero from '../../components/scores/ScoreHero';
import TasksTable from '../../components/scores/TasksTable';
import { scoreApi } from '../../services';
import type { ScoreDetail as ScoreDetailData } from '../../types';
import { getHttpStatus, POLL_INTERVAL_MS } from '../../utils/score';
import '../../components/scores/scores.css';
import './ScoreDetail.css';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; score: ScoreDetailData }
  | { phase: 'notFound' }
  | { phase: 'error' };

type Tab = 'files' | 'tasks';

/** Trang /scores/:id: chi tiết bản nhạc (doc mục 2.0). */
export default function ScoreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [tick, setTick] = useState(0); // tăng lên để tải lại (polling)
  const [tab, setTab] = useState<Tab>('files');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Tải chi tiết bản nhạc
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    scoreApi
      .detail(id)
      .then((res) => {
        if (!cancelled) setState({ phase: 'ready', score: res.data.result });
      })
      .catch((err) => {
        if (cancelled) return;
        const code = getHttpStatus(err);
        // 404: không tồn tại; 403: không có quyền xem -> cùng một màn hình "không tìm thấy"
        if (code === 404 || code === 403) {
          setState({ phase: 'notFound' });
        } else {
          setState((prev) => (prev.phase === 'ready' ? prev : { phase: 'error' }));
          toast.error('Không tải được bản nhạc');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  // Còn tác vụ đang chạy thì tự làm mới mỗi 5 giây để thấy tiến độ
  const score = state.phase === 'ready' ? state.score : null;
  const running = score?.processingStatus === 'PENDING' || score?.processingStatus === 'PROCESSING';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [running]);

  const navbar = (
    <nav className="navbar">
      <div className="navbar-brand">Music App</div>
      <div className="navbar-nav">
        <button className="sc-btn sc-btn--sm" onClick={() => navigate('/scores')}>
          ‹ Thư viện
        </button>
      </div>
    </nav>
  );

  if (state.phase === 'loading') {
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container" aria-busy="true">
          <div className="sc-skeleton sc-skeleton--hero" />
        </main>
      </div>
    );
  }

  if (!score) {
    const notFound = state.phase === 'notFound';
    return (
      <div className="sc-page">
        {navbar}
        <main className="sc-container">
          <div className="sc-empty">
            <h3>{notFound ? 'Không tìm thấy bản nhạc' : 'Không tải được bản nhạc'}</h3>
            <p>{notFound ? 'Bản nhạc không tồn tại hoặc bạn không có quyền xem.' : 'Vui lòng thử lại sau.'}</p>
            <button className="sc-btn sc-btn--primary" onClick={() => navigate('/scores')}>
              Về thư viện
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="sc-page">
      {navbar}
      <main className="sc-container">
        <ScoreHero score={score} onEdit={() => setEditing(true)} onDelete={() => setDeleting(true)} />

        <div className="sc-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'files'} className="sc-tab" onClick={() => setTab('files')}>
            File <span className="sc-tab__count">{score.files.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'tasks'} className="sc-tab" onClick={() => setTab('tasks')}>
            Lịch sử tác vụ <span className="sc-tab__count">{score.latestTasks.length}</span>
          </button>
        </div>

        {tab === 'files' ? <FilesTable files={score.files} /> : <TasksTable tasks={score.latestTasks} />}
      </main>

      {editing && (
        <EditScoreModal
          score={score}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setState({ phase: 'ready', score: updated });
            setEditing(false);
          }}
        />
      )}
      {deleting && (
        <DeleteScoreModal
          scoreId={score.id}
          title={score.title}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate('/scores', { replace: true })}
        />
      )}
    </div>
  );
}
