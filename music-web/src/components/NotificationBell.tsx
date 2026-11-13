import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useNotificationSocket } from '../hooks/useNotificationSocket';
import { useNavigate } from '../routes/useTransitionNavigate';
import { notificationApi } from '../services';
import { Icon } from './ui';
import { useDialog } from './ui/dialog-context';
import { formatDateTime, formatRelativeTime, t } from '../i18n/core';
import { notificationText } from '../utils/notifications';
import type { AppNotification } from '../types';
import './scores/scores.css';
import Skeleton from './ui/Skeleton';

const POLL_MS = 30_000;

/** Chuông thông báo trên navbar: đếm chưa đọc (nhận tức thì qua WebSocket, mất kết nối thì poll 30 giây), mở ra xem danh sách, bấm để tới bản nhạc. */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const dialog = useDialog();

  const refreshCount = useCallback(() => {
    notificationApi
      .unreadCount()
      .then((res) => setUnread(res.data.result))
      .catch(() => undefined);
  }, []);

  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Đóng khi bấm ra ngoài
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      notificationApi
        .list({ page: 0, size: 20 })
        .then((res) => setItems(res.data.result.content))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
      refreshCount();
    }
  };

  const openItem = async (n: AppNotification) => {
    if (!n.read) {
      await notificationApi.markRead(n.id).catch(() => undefined);
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    // Thông báo chung của quản trị viên không dẫn tới trang nào: mở hộp thoại để đọc toàn văn
    if (n.type === 'ANNOUNCEMENT') {
      await dialog.alert({
        title: t('common.notifications.fromAdmin'),
        meta: formatDateTime(n.createdAt),
        message: n.message,
        icon: 'megaphone',
      });
      return;
    }
    if (n.type === 'PUBLISH_REQUESTED') navigate('/admin/pending-scores');
    // Bản nhạc đã vào thùng rác nên trang chi tiết không mở được: đưa người dùng tới thùng rác để khôi phục
    else if (n.type === 'SCORE_TRASHED_BY_ADMIN') navigate('/scores/trash');
    // Lời xin vào kho mẫu: chủ trả lời ở trang riêng; kết quả gửi tới admin thì mở tab lời xin
    else if (n.type === 'OFFICIAL_REQUESTED') navigate('/scores/official-requests');
    else if (n.type === 'PLAN_ACTIVATED') navigate('/billing');
    else if (n.type === 'PLAN_EXPIRING') navigate('/pricing');
    else if (n.type === 'PLAN_REVOKED' || n.type === 'PLAN_BANNED' || n.type === 'PLAN_BAN_LIFTED')
      navigate('/billing');
    else if (n.type === 'OFFICIAL_ACCEPTED' || n.type === 'OFFICIAL_DECLINED') navigate('/admin/official-scores');
    // Team và Show: bài trong show mở bảng show, còn lại mở team (lời mời và bị xóa khỏi team thì về /teams)
    else if (n.type.startsWith('SHOW_ITEM_') && n.params?.teamId && n.params.showId)
      navigate(`/teams/${n.params.teamId}/shows/${n.params.showId}`);
    else if (
      n.type === 'TEAM_INVITED' ||
      n.type === 'TEAM_REMOVED' ||
      n.type === 'TEAM_DELETED' ||
      n.type === 'TEAM_DELETED_BY_ADMIN'
    )
      navigate('/teams');
    // Góp ý: mở tab Góp ý của bản nhạc và cuộn tới đúng góp ý
    else if (n.type.startsWith('COMMENT_') && n.scoreId)
      navigate(`/scores/${n.scoreId}?tab=comments${n.params?.commentId ? `&comment=${n.params.commentId}` : ''}`);
    // Đề xuất sửa: mở trang xem xét đề xuất
    else if (n.type.startsWith('SUGGESTION_') && n.scoreId && n.params?.suggestionId)
      navigate(`/scores/${n.scoreId}/suggestions/${n.params.suggestionId}`);
    else if (n.type.startsWith('TEAM_') && n.params?.teamId) navigate(`/teams/${n.params.teamId}`);
    else if (n.scoreId) navigate(`/scores/${n.scoreId}`);
  };

  const connected = useNotificationSocket((n) => {
    setUnread((c) => c + 1);
    // Danh sách đang mở thì chèn lên đầu (bỏ trùng nếu vừa nạp xong)
    if (openRef.current) setItems((list) => [n, ...list.filter((x) => x.id !== n.id)]);
    toast.info(
      n.type === 'ANNOUNCEMENT' ? `${t('common.notifications.fromAdmin')}: ${n.message}` : notificationText(n),
      {
        onClick: () => void openItem(n), // bấm toast: đánh dấu đã đọc và mở trang liên quan như bấm trong chuông
      },
    );
  });

  // Đồng bộ số chưa đọc mỗi khi (mất/có lại) kết nối; chỉ poll khi socket chưa nối được
  useEffect(() => {
    refreshCount();
    if (connected) return;
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, [connected, refreshCount]);

  const readAll = async () => {
    await notificationApi.markAllRead().catch(() => undefined);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  return (
    <div className="sc-bell" ref={ref}>
      <button
        type="button"
        className="sc-bell__btn"
        aria-label={unread ? t('common.notifications.labelUnread', { count: unread }) : t('common.notifications.title')}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="sc-bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="sc-bell__panel" role="menu">
          <div className="sc-bell__head">
            <strong>{t('common.notifications.title')}</strong>
            <button type="button" className="sc-bell__link" disabled={unread === 0} onClick={readAll}>
              {t('common.notifications.markAllRead')}
            </button>
          </div>
          {loading && <Skeleton lines={3} className="sc-bell__loading" />}
          {!loading && items.length === 0 && <p className="sc-bell__empty">{t('common.notifications.empty')}</p>}
          <ul className="sc-bell__list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`sc-bell__item${n.read ? '' : ' sc-bell__item--unread'}`}
                  onClick={() => openItem(n)}
                >
                  {n.type === 'ANNOUNCEMENT' && (
                    <span className="sc-bell__tag">
                      <Icon name="megaphone" size={12} />
                      {t('common.notifications.adminTag')}
                    </span>
                  )}
                  <span className="sc-bell__text">{notificationText(n)}</span>
                  <small>{formatRelativeTime(n.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
