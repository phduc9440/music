import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../services';
import { formatRelative } from '../utils/score';
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
    if (n.type === 'PUBLISH_REQUESTED') navigate('/admin');
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
        className="sc-btn sc-btn--sm"
        aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}
        aria-expanded={open}
        onClick={toggle}
      >
        🔔{unread > 0 && <span className="sc-bell__badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="sc-bell__panel" role="menu">
          <div className="sc-bell__head">
            <strong>Thông báo</strong>
            <button type="button" className="sc-bell__link" disabled={unread === 0} onClick={readAll}>
              Đánh dấu đã đọc
            </button>
          </div>
          {loading && <p className="sc-bell__empty">Đang tải...</p>}
          {!loading && items.length === 0 && <p className="sc-bell__empty">Chưa có thông báo nào.</p>}
          <ul className="sc-bell__list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`sc-bell__item${n.read ? '' : ' sc-bell__item--unread'}`}
                  onClick={() => openItem(n)}
                >
                  <span>{n.message}</span>
                  <small>{formatRelative(n.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
