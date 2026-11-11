import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../services';
import { Icon } from './ui';
import { useDialog } from './ui/dialog-context';
import { formatDateTime, formatRelativeTime, t } from '../i18n/core';
import { notificationText } from '../utils/notifications';
import type { AppNotification } from '../types';
import './scores/scores.css';

const POLL_MS = 30_000;

/** Chuông thông báo trên navbar: đếm chưa đọc (poll 30 giây), mở ra xem danh sách, bấm để tới bản nhạc. */
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

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(t);
  }, [refreshCount]);

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
    else if (n.type === 'OFFICIAL_ACCEPTED' || n.type === 'OFFICIAL_DECLINED') navigate('/admin/official-scores');
    else if (n.scoreId) navigate(`/scores/${n.scoreId}`);
  };

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
          {loading && <p className="sc-bell__empty">{t('common.loading')}</p>}
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
