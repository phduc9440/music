import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Avatar, Badge, Button, Card, Field, Icon, PageHeader } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import { MemberStatus } from '../../types';
import type { AnnouncementAudience, Member } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';

const MAX_LENGTH = 500;
const MAX_SELECTED = 200;

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Tất cả người dùng', hint: 'Mọi tài khoản đang hoạt động, kể cả admin' },
  { value: 'USERS', label: 'Chỉ người dùng thường', hint: 'Tài khoản đang hoạt động không phải admin' },
  { value: 'ADMINS', label: 'Chỉ quản trị viên', hint: 'ADMIN và SUPER ADMIN đang hoạt động' },
  { value: 'SELECTED', label: 'Chọn người nhận', hint: `Chọn từng tài khoản (tối đa ${MAX_SELECTED} người)` },
];

/** Admin: gửi thông báo chung, hiện ở chuông thông báo của người nhận (poll 30 giây một lần). */
export default function AdminAnnouncements() {
  const { confirm } = useDialog();
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
    const ok = await confirm({
      title: 'Gửi thông báo?',
      message: `Người nhận: ${audienceLabel}.\nThông báo không thể thu hồi sau khi gửi.`,
      confirmLabel: 'Gửi thông báo',
    });
    if (!ok) return;
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
      toast.error(errorMessage(error, 'Không gửi được thông báo'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Gửi thông báo"
        description="Thông báo hiện ở biểu tượng chuông của người nhận. Tài khoản bị khóa không nhận được."
      />

      <div className="adm-grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
        <Card title="Soạn thông báo">
          <form onSubmit={send}>
            <Field label="Người nhận">
              <div className="adm-choice-list" role="radiogroup" aria-label="Người nhận">
                {AUDIENCES.map((a) => (
                  <label key={a.value} className={`adm-choice${audience === a.value ? ' adm-choice--active' : ''}`}>
                    <input
                      type="radio"
                      name="audience"
                      checked={audience === a.value}
                      onChange={() => setAudience(a.value)}
                    />
                    <span>
                      <span className="adm-choice__label">{a.label}</span>
                      <span className="adm-choice__hint" style={{ display: 'block' }}>
                        {a.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            {audience === 'SELECTED' && (
              <Field label="Tìm và thêm người nhận" htmlFor="ann-search" hint="Gõ ít nhất 2 ký tự của email hoặc tên">
                <input
                  id="ann-search"
                  className="adm-input"
                  placeholder="Email hoặc tên"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {shownFound.length > 0 && (
                  <ul className="adm-list">
                    {shownFound.map((m) => {
                      const locked = m.status === MemberStatus.INACTIVE;
                      const chosen = isSelected(m);
                      return (
                        <li key={m.id} className="adm-list__item">
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                            <Avatar name={m.fullName || m.email} src={m.avatarUrl} size={28} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontWeight: 500 }}>{m.fullName || m.email}</span>
                              {m.fullName && <span className="adm-subtle">{m.email}</span>}
                            </span>
                            {locked && <Badge tone="danger">Đã khóa</Badge>}
                          </span>
                          <Button
                            size="sm"
                            icon={chosen ? 'check' : 'plus'}
                            disabled={locked || chosen}
                            title={locked ? 'Tài khoản bị khóa không nhận được thông báo' : undefined}
                            onClick={() => add(m)}
                          >
                            {chosen ? 'Đã chọn' : 'Thêm'}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="adm-chips" aria-live="polite" style={{ marginTop: '0.5rem' }}>
                  {selected.length === 0 && <span className="adm-subtle">Chưa chọn ai</span>}
                  {selected.map((m) => (
                    <span key={m.id} className="adm-chip">
                      {m.email}
                      <button type="button" aria-label={`Bỏ ${m.email}`} onClick={() => remove(m)}>
                        <Icon name="x" size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Nội dung" htmlFor="ann-message" hint={`${message.length}/${MAX_LENGTH} ký tự`}>
              <textarea
                id="ann-message"
                className="adm-input"
                rows={5}
                maxLength={MAX_LENGTH}
                placeholder="Ví dụ: Hệ thống bảo trì lúc 22:00 tối nay, có thể gián đoạn khoảng 15 phút."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <span className="adm-muted" role="status">
                {lastSent}
              </span>
              <Button type="submit" variant="primary" icon="send" loading={sending} disabled={!canSend}>
                Gửi thông báo
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Xem trước" description="Người nhận sẽ thấy trong chuông thông báo">
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              padding: '0.85rem',
              border: '1px solid var(--adm-border)',
              borderRadius: 'var(--adm-radius)',
              background: 'var(--adm-primary-soft)',
            }}
          >
            <span className="adm-stat__icon adm-tone--primary" style={{ flexShrink: 0 }}>
              <Icon name="megaphone" size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {trimmed || <span className="adm-subtle">Nội dung thông báo sẽ hiện ở đây</span>}
              </div>
              <div className="adm-subtle" style={{ marginTop: '0.25rem', fontSize: 'var(--adm-text-xs)' }}>
                Vừa xong
              </div>
            </div>
          </div>
          <ul
            className="adm-muted"
            style={{ margin: '1rem 0 0', paddingLeft: '1.1rem', fontSize: 'var(--adm-text-sm)' }}
          >
            <li>Gửi tới: {audienceLabel}</li>
            <li>Không gửi cho chính bạn.</li>
            <li>Không thu hồi được sau khi gửi.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
