import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { useNavigate } from '../../routes/useTransitionNavigate';
import Modal from '../../components/scores/common/Modal';
import Icon from '../../components/ui/Icon';
import Skeleton from '../../components/ui/Skeleton';
import { useDialog } from '../../components/ui/dialog-context';
import { showApi, teamApi, userApi } from '../../services';
import { canManageTeam, SHOW_ITEM_STATUSES } from '../../types';
import type {
  Show,
  ShowDetail,
  ShowItem,
  ShowItemStatus,
  ShowPayload,
  ShowStatus,
  TeamMember,
  TeamScore,
} from '../../types';
import { formatDate, formatNumber, t } from '../../i18n/core';
import { getErrorMessage } from '../../utils/score';
import { DueDate, MemberAvatar, StatusBadge } from './shared';
import { daysUntil, memberName } from './teamUtils';
import '../../components/scores/scores.css';
import './teams.css';

type View = 'board' | 'list';

/** Nút hành động chính theo cặp (từ, sang); các chuyển khác chỉ có ở ô chọn / kéo thả. */
const ACTION_LABEL: Partial<Record<`${ShowItemStatus}>${ShowItemStatus}`, string>> = {
  'TODO>ARRANGING': 'teams.item.start',
  'ARRANGING>IN_REVIEW': 'teams.item.submit',
  'IN_REVIEW>APPROVED': 'teams.item.approve',
  'IN_REVIEW>ARRANGING': 'teams.item.return',
  'APPROVED>IN_REVIEW': 'teams.item.reopen',
};

/** Bước đi tới (bắt đầu, gửi duyệt, duyệt) tô nút chính; lùi lại (trả lại, mở lại) dùng nút thường. */
const PRIMARY_ACTIONS = new Set(['TODO>ARRANGING', 'ARRANGING>IN_REVIEW', 'IN_REVIEW>APPROVED']);

/** Trang /teams/:teamId/shows/:showId: bảng Kanban theo trạng thái và danh sách theo thứ tự diễn (mục 4.1). */
export default function ShowBoard() {
  const { teamId = '', showId = '' } = useParams<{ teamId: string; showId: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { confirm, prompt } = useDialog();
  const [data, setData] = useState<ShowDetail | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [view, setView] = useState<View>('board');
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<ShowItemStatus | null>(null);
  const [editingItem, setEditingItem] = useState<ShowItem | 'new' | null>(null);
  const [editingShow, setEditingShow] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(() => {
    showApi
      .get(showId)
      .then((res) => {
        setData(res.data.result);
        setNow(Date.now());
      })
      .catch((err) => toast.error(getErrorMessage(err, t('teams.board.loadFailed'))));
  }, [showId]);

  useEffect(load, [load]);
  useEffect(() => {
    userApi
      .getMe()
      .then((res) => setMeId(res.data.result.id))
      .catch(() => undefined);
  }, []);

  const manager = canManageTeam(data?.myRole);

  /** Gọi API trả về cả show (thêm, sửa, gỡ, đổi trạng thái, đổi thứ tự) rồi vẽ lại. */
  const run = async (action: () => Promise<{ data: { result: ShowDetail } }>, failKey: string) => {
    setBusy(true);
    try {
      const res = await action();
      setData(res.data.result);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, t(failKey)));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const moveTo = async (item: ShowItem, to: ShowItemStatus) => {
    if (!item.allowedStatuses.includes(to)) return;
    let note: string | undefined;
    // Trả lại (chờ duyệt -> đang phối) bởi người không phải người phối: hỏi góp ý; người duyệt bắt buộc nhập
    if (item.status === 'IN_REVIEW' && to === 'ARRANGING' && item.arrangerId !== meId) {
      const value = await prompt({
        title: t('teams.item.returnTitle', { title: item.scoreTitle }),
        label: t('teams.item.returnLabel'),
        placeholder: t('teams.item.returnPlaceholder'),
        maxLength: 500,
        required: !manager,
        confirmLabel: t('teams.item.return'),
      });
      if (value === null) return;
      note = value.trim() || undefined;
    }
    const ok = await run(() => showApi.changeStatus(showId, item.id, to, note), 'teams.board.statusFailed');
    if (ok) toast.success(t('teams.board.moved', { title: item.scoreTitle, status: t(`teams.status.${to}`) }));
  };

  const removeItem = async (item: ShowItem) => {
    const ok = await confirm({
      title: t('teams.item.removeTitle'),
      message: t('teams.item.removeMessage', { title: item.scoreTitle }),
      confirmLabel: t('teams.item.remove'),
      tone: 'danger',
    });
    if (ok) await run(() => showApi.removeItem(showId, item.id), 'teams.item.removeFailed');
  };

  const deleteShow = async () => {
    if (!data) return;
    const ok = await confirm({
      title: t('teams.board.deleteTitle'),
      message: t('teams.board.deleteMessage', { name: data.show.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await showApi.remove(showId);
      toast.success(t('teams.board.deleted'));
      navigate(`/teams/${teamId}?tab=shows`);
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.board.deleteFailed')));
    }
  };

  /** Đổi thứ tự diễn (kéo thả hoặc nút lên/xuống, chỉ quản lý): vẽ ngay rồi lưu, lỗi thì tải lại. */
  const reorder = async (itemId: string, targetIndex: number) => {
    if (!data) return;
    const items = [...data.items];
    const from = items.findIndex((i) => i.id === itemId);
    if (from < 0 || from === targetIndex || targetIndex < 0 || targetIndex >= items.length) return;
    const [moved] = items.splice(from, 1);
    items.splice(targetIndex, 0, moved);
    setData({ ...data, items: items.map((i, idx) => ({ ...i, position: idx + 1 })) });
    const ok = await run(
      () =>
        showApi.reorder(
          showId,
          items.map((i) => i.id),
        ),
      'teams.board.reorderFailed',
    );
    if (!ok) load();
  };

  const dragged = data?.items.find((i) => i.id === dragId) ?? null;
  const show = data?.show;
  /** Người được giao (để lấy ảnh đại diện trên thẻ bài). */
  const people = useMemo(() => new Map((data?.assignees ?? []).map((m) => [m.memberId, m])), [data?.assignees]);

  return (
    <div className="sc-page">
      <div className="sc-backbar">
        <Link className="sc-backlink" to={`/teams/${teamId}?tab=shows`}>
          ‹ {data?.teamName ?? t('teams.title')}
        </Link>
      </div>
      <main className="sc-container">
        <header className="tm-show">
          <div className="tm-show__intro">
            <div className="tm-show__titlerow">
              <h1>{show?.name ?? t('teams.tabs.shows')}</h1>
              {show && <StatusBadge status={show.status} />}
            </div>
            {show && (
              <ul className="tm-show__meta">
                <li>
                  <Icon name="calendar" size={16} />
                  {show.showDate ? (
                    <>
                      {formatDate(`${show.showDate}T00:00:00`)}
                      <ShowCountdown date={show.showDate} done={show.status === 'DONE'} now={now} />
                    </>
                  ) : (
                    t('teams.shows.noDate')
                  )}
                </li>
                {show.venue && (
                  <li>
                    <Icon name="mapPin" size={16} />
                    {show.venue}
                  </li>
                )}
              </ul>
            )}
            {show?.notes && <p className="tm-show__notes">{show.notes}</p>}
          </div>
          {manager && (
            <div className="tm-show__actions">
              <button type="button" className="sc-btn sc-btn--primary" onClick={() => setEditingItem('new')}>
                <Icon name="plus" size={16} />
                {t('teams.board.addItem')}
              </button>
              <button type="button" className="sc-btn" onClick={() => setEditingShow(true)}>
                <Icon name="edit" size={16} />
                {t('teams.board.editShow')}
              </button>
              <button type="button" className="sc-btn sc-btn--danger" onClick={deleteShow}>
                <Icon name="trash" size={16} />
                {t('teams.board.deleteShow')}
              </button>
            </div>
          )}
        </header>

        {data && data.items.length > 0 && <ShowSummary items={data.items} now={now} />}

        <div className="tm-toolbar">
          <div className="tm-segment" role="tablist" aria-label={t('teams.board.viewLabel')}>
            {(['board', 'list'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className="tm-segment__btn"
                onClick={() => setView(v)}
              >
                <Icon name={v === 'board' ? 'dashboard' : 'list'} size={16} />
                {t(`teams.board.view.${v}`)}
              </button>
            ))}
          </div>
          {data && data.items.length > 0 && (
            <span className="tm-toolbar__hint">
              {view === 'board' ? t('teams.board.dragHint') : t('teams.board.orderHint')}
            </span>
          )}
        </div>

        {!data && <Skeleton lines={5} />}
        {data && data.items.length === 0 && (
          <div className="sc-empty">
            <h3>{t('teams.board.emptyTitle')}</h3>
            <p>{manager ? t('teams.board.emptyHintManager') : t('teams.board.emptyHint')}</p>
          </div>
        )}

        {data && data.items.length > 0 && view === 'board' && (
          <div className="tm-board">
            {SHOW_ITEM_STATUSES.map((status) => {
              const items = data.items.filter((i) => i.status === status);
              const target = !!dragged && dragged.status !== status && dragged.allowedStatuses.includes(status);
              return (
                <section
                  key={status}
                  className={`tm-col tm-col--${status}${target ? ' tm-col--target' : ''}${target && overCol === status ? ' tm-col--over' : ''}`}
                  aria-label={t(`teams.status.${status}`)}
                  onDragOver={(e) => {
                    if (!target) return;
                    e.preventDefault();
                    setOverCol(status);
                  }}
                  onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverCol(null);
                    if (dragged && target) moveTo(dragged, status);
                    setDragId(null);
                  }}
                >
                  <div className="tm-col__head">
                    <span className={`tm-dot tm-dot--${status}`} aria-hidden="true" />
                    <span className="tm-col__title">{t(`teams.status.${status}`)}</span>
                    <span className="tm-col__count">{formatNumber(items.length)}</span>
                  </div>
                  {items.length === 0 && (
                    <p className="tm-col__empty">{target ? t('teams.board.dropHere') : t('teams.board.columnEmpty')}</p>
                  )}
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      people={people}
                      manager={manager}
                      busy={busy}
                      now={now}
                      from={pathname}
                      dragging={dragId === item.id}
                      onDragStart={() => setDragId(item.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                      }}
                      onMove={(to) => moveTo(item, to)}
                      onEdit={() => setEditingItem(item)}
                      onRemove={() => removeItem(item)}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        )}

        {data && data.items.length > 0 && view === 'list' && (
          <ol className="tm-list tm-setlist">
            {data.items.map((item, index) => (
              <li
                key={item.id}
                className={`tm-row tm-set${manager ? ' tm-row--drag' : ''}${dragId === item.id ? ' tm-row--dragging' : ''}`}
                draggable={manager && !busy}
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => manager && e.preventDefault()}
                onDrop={() => {
                  if (dragId) reorder(dragId, index);
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
              >
                {manager && (
                  <span className="tm-set__grip" aria-hidden="true">
                    <Icon name="grip" size={16} />
                  </span>
                )}
                <span className={`tm-set__pos tm-set__pos--${item.status}`}>{index + 1}</span>
                <div className="tm-row__main">
                  <Link className="tm-row__title" to={`/scores/${item.scoreId}`} state={{ from: pathname }}>
                    {item.scoreTitle}
                    {item.scoreComposer && <span className="tm-set__composer"> · {item.scoreComposer}</span>}
                  </Link>
                  <span className="tm-row__sub">
                    {t('teams.board.arrangerShort')}: {item.arrangerName ?? t('teams.item.nobody')} ·{' '}
                    {t('teams.board.reviewerShort')}: {item.reviewerName ?? t('teams.item.nobody')}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </span>
                </div>
                <div className="tm-row__actions">
                  <DueDate date={item.dueDate} done={item.status === 'APPROVED'} now={now} chip />
                  <StatusBadge status={item.status} />
                  {manager && (
                    <span className="tm-set__order">
                      <button
                        type="button"
                        className="tm-icon-btn"
                        disabled={busy || index === 0}
                        aria-label={t('teams.board.moveUp', { title: item.scoreTitle })}
                        title={t('teams.board.moveUp', { title: item.scoreTitle })}
                        onClick={() => reorder(item.id, index - 1)}
                      >
                        <Icon name="chevronUp" size={16} />
                      </button>
                      <button
                        type="button"
                        className="tm-icon-btn"
                        disabled={busy || index === data.items.length - 1}
                        aria-label={t('teams.board.moveDown', { title: item.scoreTitle })}
                        title={t('teams.board.moveDown', { title: item.scoreTitle })}
                        onClick={() => reorder(item.id, index + 1)}
                      >
                        <Icon name="chevronDown" size={16} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>

      {editingItem && data && (
        <ItemModal
          teamId={teamId}
          detail={data}
          item={editingItem === 'new' ? undefined : editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(next) => {
            setData(next);
            setEditingItem(null);
          }}
        />
      )}
      {editingShow && show && (
        <ShowFormModal
          teamId={teamId}
          show={show}
          onClose={() => setEditingShow(false)}
          onSaved={() => {
            setEditingShow(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/** "còn 20 ngày" / "diễn hôm nay" / "10 ngày trước" cạnh ngày diễn; show đã diễn thì không hiện. */
function ShowCountdown({ date, done, now }: { date: string; done: boolean; now: number }) {
  if (done || !now) return null;
  const days = daysUntil(date, now);
  const text =
    days === 0
      ? t('teams.board.showToday')
      : days > 0
        ? t('teams.board.showIn', { count: days })
        : t('teams.board.showPast', { count: -days });
  const tone = days < 0 ? ' tm-show__countdown--past' : days <= 3 ? ' tm-show__countdown--soon' : '';
  return <span className={`tm-show__countdown${tone}`}>{text}</span>;
}

/** Khung tiến độ: số bài đã duyệt, thanh màu theo trạng thái, số bài quá hạn / sắp đến hạn. */
function ShowSummary({ items, now }: { items: ShowItem[]; now: number }) {
  const counts = SHOW_ITEM_STATUSES.map((status) => ({
    status,
    count: items.filter((i) => i.status === status).length,
  }));
  const done = counts[counts.length - 1].count;
  const percent = Math.round((done / items.length) * 100);
  let overdue = 0;
  let soon = 0;
  if (now) {
    for (const item of items) {
      if (!item.dueDate || item.status === 'APPROVED') continue;
      const days = daysUntil(item.dueDate, now);
      if (days < 0) overdue++;
      else if (days <= 2) soon++;
    }
  }
  return (
    <section className="tm-summary" aria-label={t('teams.board.summary')}>
      <div className="tm-summary__top">
        <strong className="tm-summary__done">{t('teams.shows.progress', { done, total: items.length })}</strong>
        <span className="tm-summary__percent">{t('teams.board.percent', { value: formatNumber(percent) })}</span>
        <span className="tm-summary__flags">
          {overdue > 0 && (
            <span className="tm-flag tm-flag--late">
              <Icon name="alert" size={14} />
              {t('teams.board.overdueCount', { count: overdue })}
            </span>
          )}
          {soon > 0 && (
            <span className="tm-flag tm-flag--soon">
              <Icon name="clock" size={14} />
              {t('teams.board.soonCount', { count: soon })}
            </span>
          )}
        </span>
      </div>
      <div className="tm-stack" aria-hidden="true">
        {counts.map(
          ({ status, count }) =>
            count > 0 && (
              <span key={status} className={`tm-stack__seg tm-stack__seg--${status}`} style={{ flexGrow: count }} />
            ),
        )}
      </div>
      <ul className="tm-summary__legend">
        {counts.map(({ status, count }) => (
          <li key={status}>
            <span className={`tm-dot tm-dot--${status}`} aria-hidden="true" />
            {t(`teams.status.${status}`)}
            <strong>{formatNumber(count)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Một dòng người được giao trên thẻ: ảnh đại diện, vai (Phối / Duyệt), tên; chưa giao thì vòng tròn nét đứt. */
function Person({
  role,
  id,
  name,
  people,
}: {
  role: string;
  id?: string | null;
  name?: string | null;
  people: Map<string, TeamMember>;
}) {
  const member = id ? people.get(id) : undefined;
  return (
    <li className={`tm-person${name ? '' : ' tm-person--empty'}`}>
      {name ? (
        <MemberAvatar member={member ?? { fullName: name, email: name, avatarUrl: null }} small />
      ) : (
        <span className="tm-avatar tm-avatar--sm tm-avatar--empty" aria-hidden="true" />
      )}
      <span className="tm-person__role">{role}</span>
      <span className="tm-person__name">{name ?? t('teams.item.nobody')}</span>
    </li>
  );
}

interface ItemCardProps {
  item: ShowItem;
  people: Map<string, TeamMember>;
  manager: boolean;
  busy: boolean;
  now: number;
  from: string;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: ShowItemStatus) => void;
  onEdit: () => void;
  onRemove: () => void;
}

/** Thẻ một bài trên bảng: người phối / duyệt, ghi chú, góp ý lần trả lại, hạn, nút hành động theo quyền người xem. */
function ItemCard({
  item,
  people,
  manager,
  busy,
  now,
  from,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onEdit,
  onRemove,
}: ItemCardProps) {
  const canDrag = item.allowedStatuses.length > 0 && !busy;
  const actions = item.allowedStatuses.filter((to) => ACTION_LABEL[`${item.status}>${to}`]);
  return (
    <article
      className={`tm-item${dragging ? ' tm-item--dragging' : ''}`}
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="tm-item__head">
        <span className="tm-item__pos" title={t('teams.board.view.list')}>
          {item.position}
        </span>
        <div className="tm-item__heading">
          <h3 className="tm-item__title">
            <Link to={`/scores/${item.scoreId}`} state={{ from }} draggable={false}>
              {item.scoreTitle}
            </Link>
          </h3>
          {item.scoreComposer && <p className="tm-item__composer">{item.scoreComposer}</p>}
        </div>
        {manager && <ItemMenu item={item} busy={busy} onMove={onMove} onEdit={onEdit} onRemove={onRemove} />}
      </div>
      <ul className="tm-people">
        <Person role={t('teams.board.arrangerShort')} id={item.arrangerId} name={item.arrangerName} people={people} />
        <Person role={t('teams.board.reviewerShort')} id={item.reviewerId} name={item.reviewerName} people={people} />
      </ul>
      {item.notes && <p className="tm-item__notes">{item.notes}</p>}
      {item.reviewNote && item.status !== 'APPROVED' && (
        <p className="tm-item__feedback">
          <strong>{t('teams.item.feedback')}:</strong> {item.reviewNote}
        </p>
      )}
      <div className="tm-item__foot">
        <DueDate date={item.dueDate} done={item.status === 'APPROVED'} now={now} chip />
        {actions.length > 0 && (
          <div className="tm-item__actions">
            {actions.map((to) => (
              <button
                key={to}
                type="button"
                className={`sc-btn sc-btn--sm${PRIMARY_ACTIONS.has(`${item.status}>${to}`) ? ' sc-btn--primary' : ''}`}
                disabled={busy}
                onClick={() => onMove(to)}
              >
                {t(ACTION_LABEL[`${item.status}>${to}`] as string)}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Menu "⋯" của quản lý trên thẻ: chuyển sang trạng thái khác (thay cho kéo thả, dùng được bằng bàn phím), phân công,
 * gỡ bài. Bấm ra ngoài hoặc Esc thì đóng.
 */
function ItemMenu({
  item,
  busy,
  onMove,
  onEdit,
  onRemove,
}: {
  item: ShowItem;
  busy: boolean;
  onMove: (to: ShowItemStatus) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (action: () => void) => {
    setOpen(false);
    action();
  };
  const targets = SHOW_ITEM_STATUSES.filter((s) => item.allowedStatuses.includes(s));
  const label = t('teams.board.itemActions', { title: item.scoreTitle });

  return (
    <div className="sc-menu tm-item__menu" ref={ref}>
      <button
        type="button"
        className="tm-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <ul className="sc-menu__list tm-menu" role="menu" aria-label={label}>
          {targets.length > 0 && (
            <li role="presentation" className="tm-menu__label">
              {t('teams.board.moveSection')}
            </li>
          )}
          {targets.map((s) => (
            <li key={s} role="none">
              <button
                type="button"
                role="menuitem"
                className="sc-menu__item"
                disabled={busy}
                onClick={() => pick(() => onMove(s))}
              >
                <span className="tm-menu__text">
                  <span className={`tm-dot tm-dot--${s}`} aria-hidden="true" />
                  {t(`teams.status.${s}`)}
                </span>
              </button>
            </li>
          ))}
          {targets.length > 0 && <li role="separator" className="tm-menu__sep" />}
          <li role="none">
            <button type="button" role="menuitem" className="sc-menu__item" onClick={() => pick(onEdit)}>
              <span className="tm-menu__text">
                <Icon name="users" size={16} />
                {t('teams.item.assign')}
              </span>
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="sc-menu__item tm-menu__danger"
              disabled={busy}
              onClick={() => pick(onRemove)}
            >
              <span className="tm-menu__text">
                <Icon name="trash" size={16} />
                {t('teams.board.removeFromShow')}
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Thêm bài (chọn bản nhạc của team) hoặc sửa phân công: người phối, người duyệt, hạn, ghi chú. */
function ItemModal({
  teamId,
  detail,
  item,
  onClose,
  onSaved,
}: {
  teamId: string;
  detail: ShowDetail;
  item?: ShowItem;
  onClose: () => void;
  onSaved: (detail: ShowDetail) => void;
}) {
  const [scores, setScores] = useState<TeamScore[] | null>(null);
  const [scoreId, setScoreId] = useState('');
  const [arrangerId, setArrangerId] = useState(item?.arrangerId ?? '');
  const [reviewerId, setReviewerId] = useState(item?.reviewerId ?? '');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) return;
    const inShow = new Set(detail.items.map((i) => i.scoreId));
    teamApi
      .scores(teamId)
      .then((res) => setScores(res.data.result.filter((s) => !inShow.has(s.id))))
      .catch(() => setScores([]));
  }, [item, teamId, detail.items]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!item && !scoreId) {
      setError(t('teams.item.scoreRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      arrangerId: arrangerId || null,
      reviewerId: reviewerId || null,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
    };
    try {
      const res = item
        ? await showApi.updateItem(detail.show.id, item.id, payload)
        : await showApi.addItem(detail.show.id, { ...payload, scoreId });
      toast.success(item ? t('teams.item.saved') : t('teams.item.added'));
      onSaved(res.data.result);
    } catch (err) {
      setError(getErrorMessage(err, t('teams.item.saveFailed')));
      setSaving(false);
    }
  };

  const memberSelect = (id: string, value: string, onChange: (v: string) => void, label: string) => (
    <>
      <label className="sc-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="sc-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('teams.item.nobody')}</option>
        {detail.assignees.map((m) => (
          <option key={m.memberId} value={m.memberId}>
            {memberName(m)} ({t(`teams.roles.${m.role}`)})
          </option>
        ))}
      </select>
    </>
  );

  return (
    <Modal
      title={item ? t('teams.item.editTitle', { title: item.scoreTitle }) : t('teams.item.addTitle')}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {!item && (
          <>
            <label className="sc-label" htmlFor="tm-item-score">
              {t('teams.item.score')}
            </label>
            {!scores && <Skeleton lines={1} />}
            {scores && scores.length === 0 && <p className="tm-muted">{t('teams.item.noScores')}</p>}
            {scores && scores.length > 0 && (
              <select
                id="tm-item-score"
                className="sc-input"
                value={scoreId}
                onChange={(e) => setScoreId(e.target.value)}
                autoFocus
              >
                <option value="">{t('teams.item.pickScore')}</option>
                {scores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.composer ? ` · ${s.composer}` : ''}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
        {memberSelect('tm-item-arranger', arrangerId, setArrangerId, t('teams.item.arranger'))}
        {memberSelect('tm-item-reviewer', reviewerId, setReviewerId, t('teams.item.reviewer'))}
        <label className="sc-label" htmlFor="tm-item-due">
          {t('teams.item.due')}
        </label>
        <input
          id="tm-item-due"
          type="date"
          className="sc-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <label className="sc-label" htmlFor="tm-item-notes">
          {t('teams.item.notes')}
        </label>
        <textarea
          id="tm-item-notes"
          className="sc-input"
          rows={2}
          maxLength={500}
          value={notes}
          placeholder={t('teams.item.notesPlaceholder')}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving || (!item && !scores?.length)}>
            {saving ? t('teams.form.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Tạo hoặc sửa show: tên, ngày diễn, địa điểm, ghi chú, trạng thái (khi sửa). */
export function ShowFormModal({
  teamId,
  show,
  onClose,
  onSaved,
}: {
  teamId: string;
  show?: Show;
  onClose: () => void;
  onSaved: (show: Show) => void;
}) {
  const [name, setName] = useState(show?.name ?? '');
  const [showDate, setShowDate] = useState(show?.showDate ?? '');
  const [venue, setVenue] = useState(show?.venue ?? '');
  const [notes, setNotes] = useState(show?.notes ?? '');
  const [status, setStatus] = useState<ShowStatus>(show?.status ?? 'PREPARING');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('teams.showForm.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const payload: ShowPayload = {
      name: name.trim(),
      showDate: showDate || null,
      venue: venue.trim() || null,
      notes: notes.trim() || null,
      status: show ? status : null,
    };
    try {
      const res = show ? await showApi.update(show.id, payload) : await teamApi.createShow(teamId, payload);
      toast.success(show ? t('teams.showForm.saved') : t('teams.showForm.created'));
      onSaved(res.data.result);
    } catch (err) {
      setError(getErrorMessage(err, t('teams.showForm.saveFailed')));
      setSaving(false);
    }
  };

  return (
    <Modal title={show ? t('teams.showForm.editTitle') : t('teams.showForm.createTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="sc-label" htmlFor="tm-show-name">
          {t('teams.showForm.name')}
        </label>
        <input
          id="tm-show-name"
          className="sc-input"
          value={name}
          maxLength={255}
          placeholder={t('teams.showForm.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <label className="sc-label" htmlFor="tm-show-date">
          {t('teams.showForm.date')}
        </label>
        <input
          id="tm-show-date"
          type="date"
          className="sc-input"
          value={showDate}
          onChange={(e) => setShowDate(e.target.value)}
        />
        <label className="sc-label" htmlFor="tm-show-venue">
          {t('teams.showForm.venue')}
        </label>
        <input
          id="tm-show-venue"
          className="sc-input"
          value={venue}
          maxLength={255}
          onChange={(e) => setVenue(e.target.value)}
        />
        <label className="sc-label" htmlFor="tm-show-notes">
          {t('teams.showForm.notes')}
        </label>
        <textarea
          id="tm-show-notes"
          className="sc-input"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {show && (
          <>
            <label className="sc-label" htmlFor="tm-show-status">
              {t('teams.showForm.status')}
            </label>
            <select
              id="tm-show-status"
              className="sc-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ShowStatus)}
            >
              <option value="PREPARING">{t('teams.showStatus.PREPARING')}</option>
              <option value="DONE">{t('teams.showStatus.DONE')}</option>
            </select>
          </>
        )}
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving}>
            {saving ? t('teams.form.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
