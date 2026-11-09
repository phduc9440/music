import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminApi } from '../../services';
import { MemberStatus } from '../../types';
import type { AnnouncementAudience, Member } from '../../types';

const MAX_LENGTH = 500;
const MAX_SELECTED = 200;

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Tất cả người dùng', hint: 'Mọi tài khoản đang hoạt động, kể cả admin' },
  { value: 'USERS', label: 'Chỉ người dùng thường', hint: 'Tài khoản đang hoạt động không phải admin' },
  { value: 'ADMINS', label: 'Chỉ quản trị viên', hint: 'ADMIN và SUPER ADMIN đang hoạt động' },
  { value: 'SELECTED', label: 'Chọn người nhận', hint: `Chọn từng tài khoản (tối đa ${MAX_SELECTED} người)` },
];

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** Admin: gửi thông báo chung, hiện ở chuông thông báo của người nhận (poll 30 giây một lần). */
export default function AdminAnnouncements() {
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [selected, setSelected] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Member[]>([]);

  // Tìm thành viên theo email/tên (chờ 300ms sau khi ngừng gõ), chỉ khi đang chọn "Chọn người nhận"
  useEffect(() => {
    const keyword = search.trim();
    if (audience !== 'SELECTED' || keyword.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      adminApi
        .getMembers({ page: 0, size: 8, keyword })
        .then((res) => !cancelled && setFound(res.data.result.content))
        .catch(() => !cancelled && setFound([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, audience]);

  const shownFound = search.trim().length < 2 ? [] : found;
  const isSelected = (m: Member) => selected.some((s) => s.id === m.id);
  const add = (m: Member) => {
    if (isSelected(m)) return;
    if (selected.length >= MAX_SELECTED) {
      toast.warn(`Chỉ chọn tối đa ${MAX_SELECTED} người`);
      return;
    }
    setSelected((list) => [...list, m]);
  };
  const remove = (m: Member) => setSelected((list) => list.filter((s) => s.id !== m.id));

  const trimmed = message.trim();
  const baseLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? '';
  const audienceLabel = audience === 'SELECTED' ? `${selected.length} người đã chọn` : baseLabel;
  const canSend = !!trimmed && (audience !== 'SELECTED' || selected.length > 0);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    // Gửi xong không thu hồi được, nên luôn hỏi lại
    if (!window.confirm(`Gửi thông báo này tới "${audienceLabel}"? Không thể thu hồi sau khi gửi.`)) return;
    setSending(true);
    try {
      const res = await adminApi.sendAnnouncement(
        trimmed,
        audience,
        audience === 'SELECTED' ? selected.map((m) => m.id) : undefined,
      );
      const n = res.data.result.recipients;
      toast.success(`Đã gửi cho ${n} người`);
      setLastSent(`Đã gửi cho ${n} người (${audienceLabel.toLowerCase()}).`);
      setMessage('');
      setSelected([]);
      setSearch('');
    } catch (error) {
      toast.error(errMsg(error, 'Không gửi được thông báo'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Gửi thông báo</h1>
          <p>Thông báo hiện ở biểu tượng chuông của người nhận</p>
        </div>
      </div>

      <div className="adm-card" style={{ maxWidth: 720 }}>
        <form onSubmit={send}>
          <label className="form-label" htmlFor="ann-audience" style={{ fontWeight: 600 }}>
            Người nhận
          </label>
          <div className="d-flex flex-column gap-2 mb-4" id="ann-audience" role="radiogroup">
            {AUDIENCES.map((a) => (
              <label key={a.value} className="d-flex gap-2 align-items-start" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="audience"
                  checked={audience === a.value}
                  onChange={() => setAudience(a.value)}
                  style={{ marginTop: 4 }}
                />
                <span>
                  {a.label}
                  <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{a.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {audience === 'SELECTED' && (
            <div className="mb-4">
              <input
                className="form-control"
                placeholder="Gõ email hoặc tên để tìm (ít nhất 2 ký tự)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm người nhận"
              />
              {shownFound.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, border: '1px solid var(--surface-border)', borderRadius: 8 }}>
                  {shownFound.map((m) => {
                    const locked = m.status === MemberStatus.INACTIVE;
                    const chosen = isSelected(m);
                    return (
                      <li
                        key={m.id}
                        className="d-flex justify-content-between align-items-center"
                        style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--surface-border)' }}
                      >
                        <span>
                          {m.email}
                          {m.fullName && <span style={{ color: 'var(--text-secondary)' }}> · {m.fullName}</span>}
                          {locked && <span style={{ color: 'var(--text-secondary)' }}> · đã khóa</span>}
                        </span>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                          disabled={locked || chosen}
                          title={locked ? 'Tài khoản bị khóa không nhận được thông báo' : undefined}
                          onClick={() => add(m)}
                        >
                          {chosen ? 'Đã chọn' : 'Thêm'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="d-flex flex-wrap gap-2 mt-2" aria-live="polite">
                {selected.length === 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Chưa chọn ai</span>
                )}
                {selected.map((m) => (
                  <span
                    key={m.id}
                    className="badge badge-user d-inline-flex align-items-center gap-1"
                    style={{ padding: '0.3rem 0.6rem' }}
                  >
                    {m.email}
                    <button
                      type="button"
                      aria-label={`Bỏ ${m.email}`}
                      onClick={() => remove(m)}
                      style={{ border: 0, background: 'transparent', cursor: 'pointer', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <label className="form-label" htmlFor="ann-message" style={{ fontWeight: 600 }}>
            Nội dung
          </label>
          <textarea
            id="ann-message"
            className="form-control"
            rows={5}
            maxLength={MAX_LENGTH}
            placeholder="Ví dụ: Hệ thống bảo trì lúc 22:00 tối nay, có thể gián đoạn khoảng 15 phút."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="d-flex justify-content-between align-items-center mt-2">
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {message.length}/{MAX_LENGTH}
            </span>
            <button type="submit" className="btn btn-primary" disabled={sending || !canSend}>
              {sending ? 'Đang gửi…' : 'Gửi thông báo'}
            </button>
          </div>
        </form>

        {lastSent && (
          <p role="status" style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            {lastSent}
          </p>
        )}
      </div>
    </>
  );
}
