import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import Modal from '../../components/scores/common/Modal';
import { Badge, Button, Icon, PageHeader, Pager, Tabs } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { useDialog } from '../../components/ui/dialog-context';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { adminReportApi } from '../../services';
import { REPORT_ACTIONS_BY_TARGET } from '../../types';
import type { ContentReport, PageResult, ReportAction, ReportStatus, ReportTargetType } from '../../types';
import { formatRelativeTime, t } from '../../i18n/core';
import './admin-reports.css';

const PAGE_SIZE = 10;
type Tab = ReportStatus | 'ALL';
type TypeFilter = ReportTargetType | '';

const TARGET_TYPES: ReportTargetType[] = ['SCORE', 'COMMENT', 'FORUM_THREAD', 'FORUM_POST'];
const TARGET_ICON: Record<ReportTargetType, IconName> = {
  SCORE: 'music',
  COMMENT: 'inbox',
  FORUM_THREAD: 'users',
  FORUM_POST: 'send',
};

/** Đường dẫn mở nội dung bị báo cáo trong khu admin (chủ đề diễn đàn còn mở được cả khi đã bị ẩn). */
function targetHref(r: ContentReport): string | null {
  if (r.forumThreadId) return `/admin/forum?thread=${r.forumThreadId}`;
  if (r.scoreId && r.targetAvailable) return `/admin/scores/${r.scoreId}`;
  return null;
}

/** Cách xử lý nhanh ngay trên thẻ: ẩn nội dung (góp ý, diễn đàn) hoặc gỡ công khai (bản nhạc). */
function quickAction(r: ContentReport): ReportAction | null {
  const options = REPORT_ACTIONS_BY_TARGET[r.targetType];
  if (!r.targetAvailable) return null;
  if (options.includes('HIDE')) return 'HIDE';
  if (r.targetType === 'SCORE') return 'UNPUBLISH';
  return null;
}

/** Admin (R5): hàng đợi báo cáo vi phạm dạng thẻ (bản nhạc, góp ý, chủ đề và bài diễn đàn); cũ nhất xử lý trước. */
export default function AdminReports() {
  const { confirm } = useDialog();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [targetType, setTargetType] = useState<TypeFilter>('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<PageResult<ContentReport> | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [handling, setHandling] = useState<ContentReport | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminReportApi
      .list({ page, size: PAGE_SIZE, status: tab === 'ALL' ? undefined : tab, targetType: targetType || undefined })
      .then((res) => {
        if (cancelled) return;
        const data = res.data.result;
        // Xử lý hết báo cáo cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => !cancelled && toast.error(t('admin.reports.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [tab, targetType, page, reload]);

  // Số báo cáo đang chờ theo từng loại, hiện trên các nút lọc
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      TARGET_TYPES.map((type) =>
        adminReportApi
          .list({ page: 0, size: 1, status: 'PENDING', targetType: type })
          .then((res) => [type, res.data.result.totalElements] as const),
      ),
    )
      .then((entries) => !cancelled && setCounts(Object.fromEntries(entries)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const changeTab = (next: Tab) => {
    setResult(null);
    setPage(0);
    setTab(next);
  };
  const changeType = (next: TypeFilter) => {
    setResult(null);
    setPage(0);
    setTargetType(next);
  };
  const done = useCallback(() => {
    setHandling(null);
    setReload((n) => n + 1);
  }, []);

  const resolveNow = async (r: ContentReport, action: ReportAction) => {
    const ok = await confirm({
      title: t(`admin.reports.quick.${action}.title`),
      message: t(`admin.reports.quick.${action}.text`, { label: r.targetLabel || '—' }),
      confirmLabel: t(`admin.reports.actions.${action}`),
      tone: action === 'DISMISS' ? 'primary' : 'danger',
    });
    if (!ok || busyId) return;
    setBusyId(r.id);
    try {
      await adminReportApi.resolve(r.id, { action });
      toast.success(t('admin.reports.resolved'));
      done();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.reports.resolveFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const tabItems: { value: Tab; label: string }[] = (['PENDING', 'RESOLVED', 'DISMISSED', 'ALL'] as Tab[]).map((v) => ({
    value: v,
    label: t(`admin.reports.tabs.${v}`),
  }));
  const pendingTotal = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;

  return (
    <>
      <PageHeader title={t('admin.menu.items.reports')} description={t('admin.reports.description')} />

      <div className="ar-filters">
        <Tabs value={tab} onChange={changeTab} items={tabItems} />
        <div className="ar-types" role="group" aria-label={t('admin.reports.allTypes')}>
          <button
            type="button"
            className={`ar-type${targetType === '' ? ' is-on' : ''}`}
            aria-pressed={targetType === ''}
            onClick={() => changeType('')}
          >
            {t('admin.reports.allTypes')}
            {pendingTotal !== null && <span className="ar-type__n">{pendingTotal}</span>}
          </button>
          {TARGET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`ar-type${targetType === type ? ' is-on' : ''}`}
              aria-pressed={targetType === type}
              onClick={() => changeType(type)}
            >
              <Icon name={TARGET_ICON[type]} size={14} />
              {t(`admin.reports.targets.${type}`)}
              {counts && counts[type] > 0 && <span className="ar-type__n ar-type__n--alert">{counts[type]}</span>}
            </button>
          ))}
        </div>
      </div>

      {!result && <div className="ar-card ar-card--skeleton" aria-hidden="true" />}

      {result && result.content.length === 0 && (
        <div className="ar-empty">
          <Icon name="check" size={28} />
          <strong>{t('admin.reports.emptyTitle')}</strong>
          <span>{t('admin.reports.emptyHint')}</span>
        </div>
      )}

      {result && result.content.length > 0 && (
        <ul className="ar-list">
          {result.content.map((r) => {
            const href = targetHref(r);
            const quick = r.status === 'PENDING' ? quickAction(r) : null;
            return (
              <li
                key={r.id}
                className={`ar-card ar-card--${r.reason.toLowerCase()}${r.status !== 'PENDING' ? ' is-done' : ''}`}
              >
                <div className="ar-card__head">
                  <span className="ar-kind">
                    <Icon name={TARGET_ICON[r.targetType]} size={14} />
                    {t(`admin.reports.targets.${r.targetType}`)}
                  </span>
                  <Badge tone={r.reason === 'COPYRIGHT' ? 'danger' : 'warning'}>
                    {t(`admin.reports.reasons.${r.reason}`)}
                  </Badge>
                  {r.status === 'PENDING' && r.pendingOnTarget > 1 && (
                    <Badge tone="danger">{t('admin.reports.reporterCount', { count: r.pendingOnTarget })}</Badge>
                  )}
                  {!r.targetAvailable && <Badge tone="neutral">{t('admin.reports.unavailable')}</Badge>}
                  <time className="ar-card__time" dateTime={r.createdAt} title={formatDateTime(r.createdAt)}>
                    {formatRelativeTime(r.createdAt)}
                  </time>
                </div>

                <blockquote className="ar-quote">
                  <p>{r.targetLabel || '—'}</p>
                  {r.owner && (
                    <footer>
                      {t('admin.reports.columns.owner')}: <strong>{r.owner.fullName || r.owner.email}</strong>
                    </footer>
                  )}
                </blockquote>

                <p className="ar-reporter">
                  <span className="adm-muted">{t('admin.reports.columns.reporter')}:</span> {r.reporter.email}
                  {r.details && <span className="ar-reporter__note">“{r.details}”</span>}
                </p>

                {r.status === 'PENDING' ? (
                  <div className="ar-actions">
                    {href && (
                      <Link to={href} className="adm-btn adm-btn--ghost adm-btn--sm">
                        <Icon name="eye" size={14} />
                        {t('admin.reports.openContent')}
                      </Link>
                    )}
                    <span className="ar-actions__end">
                      <Button size="sm" disabled={busyId === r.id} onClick={() => resolveNow(r, 'DISMISS')}>
                        {t('admin.reports.actions.DISMISS')}
                      </Button>
                      {quick && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === r.id}
                          onClick={() => resolveNow(r, quick)}
                        >
                          {t(`admin.reports.actions.${quick}`)}
                        </Button>
                      )}
                      <Button size="sm" variant="primary" onClick={() => setHandling(r)}>
                        {t('admin.reports.moreActions')}
                      </Button>
                    </span>
                  </div>
                ) : (
                  <div className="ar-outcome">
                    <Badge tone={r.status === 'DISMISSED' ? 'neutral' : 'success'}>
                      {r.action ? t(`admin.reports.actions.${r.action}`) : t(`admin.reports.tabs.${r.status}`)}
                    </Badge>
                    {r.resolvedBy && (
                      <span className="adm-muted">
                        {t('admin.reports.handledBy', { name: r.resolvedBy.fullName || r.resolvedBy.email })}
                        {r.resolvedAt ? ` · ${formatDateTime(r.resolvedAt)}` : ''}
                      </span>
                    )}
                    {r.resolutionNote && <span className="ar-outcome__note">“{r.resolutionNote}”</span>}
                    {href && (
                      <Link to={href} className="ar-outcome__link">
                        {t('admin.reports.openContent')}
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {result && (
        <Pager
          page={result.pageNumber}
          totalPages={result.totalPages}
          totalElements={result.totalElements}
          unit={t('admin.reports.unit')}
          onChange={setPage}
        />
      )}

      {handling && <ResolveModal report={handling} onClose={() => setHandling(null)} onDone={done} />}
    </>
  );
}

/** Chọn cách xử lý + ghi chú. Nội dung đã không còn thì chỉ chọn được "Bỏ qua" và khóa tài khoản chủ nội dung. */
function ResolveModal({ report, onClose, onDone }: { report: ContentReport; onClose: () => void; onDone: () => void }) {
  const options = REPORT_ACTIONS_BY_TARGET[report.targetType].filter(
    (a) => report.targetAvailable || a === 'DISMISS' || a === 'LOCK_ACCOUNT',
  );
  const [action, setAction] = useState<ReportAction>('DISMISS');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await adminReportApi.resolve(report.id, { action, note: note.trim() || undefined });
      toast.success(t('admin.reports.resolved'));
      onDone();
    } catch (err) {
      setError(errorMessage(err, t('admin.reports.resolveFailed')));
      setBusy(false);
    }
  };

  return (
    <Modal title={t('admin.reports.reportOf', { label: report.targetLabel || '—' })} onClose={onClose}>
      <p className="sc-delete__text">
        {t(`admin.reports.reasons.${report.reason}`)}
        {report.details ? `: ${report.details}` : ''}
      </p>
      <fieldset className="rp-reasons">
        <legend className="sc-label">{t('admin.reports.choose')}</legend>
        {options.map((a) => (
          <label key={a} className="rp-reason">
            <input type="radio" name="resolve-action" checked={action === a} onChange={() => setAction(a)} />
            <span>
              {t(`admin.reports.actions.${a}`)}
              <span className="adm-muted"> — {t(`admin.reports.actionHints.${a}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="sc-label" htmlFor="resolve-note">
        {t('admin.reports.note')}
        <span className="sc-counter">{note.length}/500</span>
      </label>
      <textarea
        id="resolve-note"
        className="sc-input"
        rows={3}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <div className="sc-error">{error}</div>}
      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`sc-btn ${action === 'DISMISS' ? 'sc-btn--primary' : 'sc-btn--danger-solid'}`}
          onClick={submit}
          disabled={busy}
        >
          {t('admin.reports.confirm')}
        </button>
      </div>
    </Modal>
  );
}
