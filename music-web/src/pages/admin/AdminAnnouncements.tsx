import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Avatar, Badge, Button, Card, Field, Icon, PageHeader } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import { MemberStatus } from '../../types';
import type { AnnouncementAudience, Member } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';
import { t } from '../../i18n/core';

const MAX_LENGTH = 500;
const MAX_SELECTED = 200;

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = (
  ['ALL', 'USERS', 'ADMINS', 'SELECTED'] as const
).map((value) => ({
  value,
  get label() {
    return t(`admin.announcements.audience.${value}.label`);
  },
  get hint() {
    return t(`admin.announcements.audience.${value}.hint`, { max: MAX_SELECTED });
  },
}));

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
      toast.warn(t('admin.announcements.maxSelected', { max: MAX_SELECTED }));
      return;
    }
    setSelected((list) => [...list, m]);
  };
  const remove = (m: Member) => setSelected((list) => list.filter((s) => s.id !== m.id));

  const trimmed = message.trim();
  const baseLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? '';
  const audienceLabel =
    audience === 'SELECTED' ? t('admin.announcements.selectedCount', { count: selected.length }) : baseLabel;
  const canSend = !!trimmed && (audience !== 'SELECTED' || selected.length > 0);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    // Gửi xong không thu hồi được, nên luôn hỏi lại
    const ok = await confirm({
      title: t('admin.announcements.confirmTitle'),
      message: t('admin.announcements.confirmMessage', { audience: audienceLabel }),
      confirmLabel: t('admin.announcements.send'),
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
      toast.success(t('admin.announcements.sent', { count: n }));
      setLastSent(t('admin.announcements.sentTo', { count: n, audience: audienceLabel.toLowerCase() }));
      setMessage('');
      setSelected([]);
      setSearch('');
    } catch (error) {
      toast.error(errorMessage(error, t('admin.announcements.failed')));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PageHeader title={t('admin.announcements.title')} description={t('admin.announcements.description')} />

      <div className="adm-grid-2" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
        <Card title={t('admin.announcements.compose')}>
          <form onSubmit={send}>
            <Field label={t('admin.announcements.recipients')}>
              <div className="adm-choice-list" role="radiogroup" aria-label={t('admin.announcements.recipients')}>
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
              <Field
                label={t('admin.announcements.searchLabel')}
                htmlFor="ann-search"
                hint={t('admin.announcements.searchHint')}
              >
                <input
                  id="ann-search"
                  className="adm-input"
                  placeholder={t('admin.announcements.searchPlaceholder')}
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
                            {locked && <Badge tone="danger">{t('admin.announcements.locked')}</Badge>}
                          </span>
                          <Button
                            size="sm"
                            icon={chosen ? 'check' : 'plus'}
                            disabled={locked || chosen}
                            title={locked ? t('admin.announcements.lockedHint') : undefined}
                            onClick={() => add(m)}
                          >
                            {chosen ? t('admin.announcements.chosen') : t('scores.playlistPicker.add')}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="adm-chips" aria-live="polite" style={{ marginTop: '0.5rem' }}>
                  {selected.length === 0 && <span className="adm-subtle">{t('admin.announcements.noneChosen')}</span>}
                  {selected.map((m) => (
                    <span key={m.id} className="adm-chip">
                      {m.email}
                      <button
                        type="button"
                        aria-label={t('admin.announcements.removeOne', { email: m.email })}
                        onClick={() => remove(m)}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              </Field>
            )}

            <Field
              label={t('admin.announcements.content')}
              htmlFor="ann-message"
              hint={t('admin.announcements.chars', { used: message.length, max: MAX_LENGTH })}
            >
              <textarea
                id="ann-message"
                className="adm-input"
                rows={5}
                maxLength={MAX_LENGTH}
                placeholder={t('admin.announcements.example')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <span className="adm-muted" role="status">
                {lastSent}
              </span>
              <Button type="submit" variant="primary" icon="send" loading={sending} disabled={!canSend}>
                {t('admin.announcements.send')}
              </Button>
            </div>
          </form>
        </Card>

        <Card title={t('admin.pending.preview')} description={t('admin.announcements.previewHint')}>
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
                {trimmed || <span className="adm-subtle">{t('admin.announcements.previewEmpty')}</span>}
              </div>
              <div className="adm-subtle" style={{ marginTop: '0.25rem', fontSize: 'var(--adm-text-xs)' }}>
                {t('common.time.justNow')}
              </div>
            </div>
          </div>
          <ul
            className="adm-muted"
            style={{ margin: '1rem 0 0', paddingLeft: '1.1rem', fontSize: 'var(--adm-text-sm)' }}
          >
            <li>{t('admin.announcements.noteTo', { audience: audienceLabel })}</li>
            <li>{t('admin.announcements.noteSelf')}</li>
            <li>{t('admin.announcements.noteFinal')}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
