import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthImage from '../../components/scores/common/AuthImage';
import { CREATE_SCORE_PATH } from '../../components/layout/nav';
import { Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { homeApi } from '../../services';
import type { HomePendingItem, HomeSummary, ScoreSummary } from '../../types';
import { ACCESS_LEVEL_LABELS, DIFFICULTY_LABELS, formatRelative, getScorePath } from '../../utils/score';
import '../../components/scores/scores.css';
import './workspace-home.css';

const QUICK_LINKS: { to: string; label: string; icon: IconName }[] = [
  { to: '/explore', label: 'Bản nhạc công khai', icon: 'globe' },
  { to: '/scores/official', label: 'Kho score mẫu', icon: 'library' },
  { to: '/practice-stats', label: 'Thống kê luyện tập', icon: 'chart' },
  { to: '/playlists', label: 'Playlist', icon: 'list' },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

const minutes = (seconds: number) => Math.floor(seconds / 60);

/** Đường tới nơi xử lý một việc đang chờ: yêu cầu xin quyền nằm ở trang chi tiết, lời xin vào kho mẫu có trang riêng. */
const pendingTarget = (item: HomePendingItem) =>
  item.type === 'ACCESS_REQUEST' ? `/scores/${item.scoreId}` : '/scores/official-requests';

const pendingText = (item: HomePendingItem) =>
  item.type === 'ACCESS_REQUEST'
    ? `${item.actorName ?? 'Ai đó'} xin quyền ${
        item.permission ? ACCESS_LEVEL_LABELS[item.permission].toLowerCase() : 'truy cập'
      }`
    : `${item.actorName ?? 'Quản trị viên'} xin đưa vào kho score mẫu`;

function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: { to: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`wh-panel ${className}`}>
      <header className="wh-panel__head">
        <h2>{title}</h2>
        {action && (
          <Link to={action.to} className="wh-panel__action">
            {action.label}
            <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

function RecentRow({ score, from }: { score: ScoreSummary; from: string }) {
  return (
    <li>
      <Link to={getScorePath(score.id, score.processingStatus)} state={{ from }} className="wh-recent">
        <span className="wh-recent__thumb">
          <AuthImage src={score.thumbnailUrl} alt={score.title} className="wh-recent__img" />
        </span>
        <span className="wh-recent__body">
          <strong title={score.title}>{score.title}</strong>
          <span>
            {score.composer || 'Chưa rõ tác giả'} · cập nhật {formatRelative(score.updatedAt)}
          </span>
        </span>
        <Icon name="chevronRight" size={16} />
      </Link>
    </li>
  );
}

/**
 * Trang làm việc của người đã đăng nhập (/, mục 5.3): lời chào và chuỗi ngày, bản gần đây, việc chờ xử lý, gợi ý luyện
 * tập. Các khối Show, góp ý, hoạt động team sẽ thêm khi có tính năng đó (4.1, 4.2).
 */
export default function WorkspaceHome() {
  const { pathname } = useLocation();
  const [data, setData] = useState<HomeSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    homeApi
      .summary()
      .then((res) => !cancelled && setData(res.data.result))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="sc-page">
        <main className="sc-container">
          <div className="sc-empty">
            <h3>Không tải được trang chủ</h3>
            <p>Thử tải lại trang, hoặc mở Thư viện từ menu.</p>
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="sc-page">
        <main className="sc-container wh" aria-busy="true">
          <div className="wh-skeleton wh-skeleton--hero" />
          <div className="wh-grid">
            <div className="wh-skeleton" />
            <div className="wh-skeleton" />
          </div>
        </main>
      </div>
    );
  }

  const { streak } = data;
  const todayMinutes = minutes(data.todayPracticeSeconds);
  const suggestion = data.suggestion;

  return (
    <div className="sc-page">
      <main className="sc-container wh">
        <header className="wh-hero">
          <div>
            <p className="wh-hero__eyebrow">{greeting()},</p>
            <h1>{data.displayName}</h1>
            <p className="wh-hero__sub">
              {streak.practicedToday
                ? `Hôm nay bạn đã tập ${todayMinutes} phút. Giữ nhịp nhé!`
                : streak.currentStreak > 0
                  ? 'Hôm nay chưa tập. Tập vài phút để giữ chuỗi ngày.'
                  : 'Bắt đầu một buổi tập ngắn hôm nay để mở chuỗi ngày đầu tiên.'}
            </p>
          </div>
          <Link to="/practice-stats" className="wh-streak" title="Xem thống kê luyện tập">
            <Icon name="flame" size={26} />
            <span className="wh-streak__num">{streak.currentStreak}</span>
            <span className="wh-streak__label">
              ngày liên tiếp
              <small>Dài nhất: {streak.longestStreak} ngày</small>
            </span>
          </Link>
        </header>

        <div className="wh-grid">
          <div className="wh-col">
            <Panel title="Tiếp tục" action={{ to: '/scores', label: 'Thư viện' }}>
              {data.recentScores.length === 0 ? (
                <p className="wh-empty">Bạn chưa có bản nhạc nào. Số hóa bản đầu tiên ở khối bên dưới.</p>
              ) : (
                <ul className="wh-list">
                  {data.recentScores.map((s) => (
                    <RecentRow key={s.id} score={s} from={pathname} />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Số hóa bản nhạc">
              <div className="wh-create">
                <Link to={CREATE_SCORE_PATH} className="wh-create__item">
                  <Icon name="upload" size={22} />
                  <strong>Từ ảnh hoặc PDF</strong>
                  <span>Nhận diện nốt tự động</span>
                </Link>
                <Link to="/scores/import" className="wh-create__item">
                  <Icon name="music" size={22} />
                  <strong>Từ MusicXML / MIDI</strong>
                  <span>Nhập file có sẵn</span>
                </Link>
              </div>
            </Panel>
          </div>

          <div className="wh-col">
            <Panel title="Chờ bạn xử lý">
              {data.pending.length === 0 ? (
                <p className="wh-empty">Không có yêu cầu nào đang chờ.</p>
              ) : (
                <ul className="wh-list">
                  {data.pending.map((item) => (
                    <li key={`${item.type}-${item.scoreId}-${item.createdAt}`}>
                      <Link to={pendingTarget(item)} state={{ from: pathname }} className="wh-pending">
                        <span className={`wh-pending__dot wh-pending__dot--${item.type.toLowerCase()}`} />
                        <span className="wh-pending__body">
                          <strong>{pendingText(item)}</strong>
                          <span>
                            {item.scoreTitle} · {formatRelative(item.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(data.accessRequestCount > 0 || data.officialRequestCount > 0 || data.pendingPublicCount > 0) && (
                <p className="wh-counts">
                  {data.accessRequestCount > 0 && <span>{data.accessRequestCount} yêu cầu xin quyền</span>}
                  {data.officialRequestCount > 0 && <span>{data.officialRequestCount} lời xin vào kho mẫu</span>}
                  {data.pendingPublicCount > 0 && <span>{data.pendingPublicCount} bản chờ duyệt công khai</span>}
                </p>
              )}
            </Panel>

            <Panel title="Gợi ý luyện tập hôm nay">
              {suggestion ? (
                <div className="wh-suggest">
                  <div>
                    <span className="wh-suggest__reason">
                      {suggestion.reason === 'CONTINUE' ? 'Tập tiếp bài gần nhất' : 'Bài dễ trong kho score mẫu'}
                    </span>
                    <strong>{suggestion.score.title}</strong>
                    <span className="wh-suggest__meta">
                      {suggestion.score.composer || 'Chưa rõ tác giả'}
                      {suggestion.score.difficulty && ` · ${DIFFICULTY_LABELS[suggestion.score.difficulty]}`}
                    </span>
                  </div>
                  <Link to={`/scores/${suggestion.score.id}/play`} className="sc-btn sc-btn--primary">
                    <Icon name="play" size={16} />
                    Tập ngay
                  </Link>
                </div>
              ) : (
                <p className="wh-empty">
                  Chưa có gợi ý. Mở <Link to="/scores/official">Kho score mẫu</Link> để chọn bài đầu tiên.
                </p>
              )}
            </Panel>

            <nav className="wh-quick" aria-label="Lối tắt">
              {QUICK_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="wh-quick__item">
                  <Icon name={l.icon} size={18} />
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
