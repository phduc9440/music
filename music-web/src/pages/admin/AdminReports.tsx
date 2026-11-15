import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import Modal from '../../components/scores/common/Modal';
import {
  Badge,
  Button,
  Card,
  CellTitle,
  PageHeader,
  Pager,
  Table,
  TableState,
  Tabs,
  Toolbar,
} from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { adminReportApi } from '../../services';
import { REPORT_ACTIONS_BY_TARGET } from '../../types';
import type { ContentReport, PageResult, ReportAction, ReportStatus, ReportTargetType } from '../../types';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;
type Tab = ReportStatus | 'ALL';

const TARGET_TYPES: ReportTargetType[] = ['SCORE', 'COMMENT'];

/** Admin (R5): hàng chờ báo cáo vi phạm của người dùng về bản nhạc và góp ý; cũ nhất xử lý trước. */
export default function AdminReports() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [targetType, setTargetType] = useState<ReportTargetType | ''>('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<PageResult<ContentReport> | null>(null);
  const [handling, setHandling] = useState<ContentReport | null>(null);

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

  const changeTab = (next: Tab) => {
    setResult(null);
    setPage(0);
    setTab(next);
  };
  const changeType = (next: ReportTargetType | '') => {
    setResult(null);
    setPage(0);
    setTargetType(next);
  };
  const done = useCallback(() => {
    setHandling(null);
    setReload((n) => n + 1);
  }, []);

  const tabItems: { value: Tab; label: string }[] = (['PENDING', 'RESOLVED', 'DISMISSED', 'ALL'] as Tab[]).map((v) => ({
    value: v,
    label: t(`admin.reports.tabs.${v}`),
  }));

  return (
    <>
      <PageHeader title={t('admin.menu.items.reports')} description={t('admin.reports.description')} />

      <Toolbar>
        <Tabs value={tab} onChange={changeTab} items={tabItems} />
        <select
          className="adm-input"
          aria-label={t('admin.reports.allTypes')}
          value={targetType}
          onChange={(e) => changeType(e.target.value as ReportTargetType | '')}
        >
          <option value="">{t('admin.reports.allTypes')}</option>
          {TARGET_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`admin.reports.targets.${v}`)}
            </option>
          ))}
        </select>
      </Toolbar>

      <Card flush>
        <Table minWidth={900}>
          <thead>
            <tr>
              <th>{t('admin.reports.columns.target')}</th>
              <th>{t('admin.reports.columns.reason')}</th>
              <th>{t('admin.reports.columns.reporter')}</th>
              <th>{t('admin.reports.columns.time')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={5} loading />}
            {result?.content.map((r) => (
              <tr key={r.id}>
                <td>
                  <CellTitle
                    sub={
                      <>
                        {t(`admin.reports.targets.${r.targetType}`)}
                        {r.owner ? ` · ${r.owner.email}` : ''}
                      </>
                    }
                  >
                    {r.scoreId && r.targetAvailable ? (
                      <Link to={`/admin/scores/${r.scoreId}`} title={t('admin.reports.openScore')}>
                        {r.targetLabel || r.scoreId}
                      </Link>
                    ) : (
                      <span>{r.targetLabel || '—'}</span>
                    )}
                  </CellTitle>
                  {!r.targetAvailable && <Badge tone="neutral">{t('admin.reports.unavailable')}</Badge>}
                </td>
                <td>
                  <Badge tone={r.reason === 'COPYRIGHT' ? 'danger' : 'warning'}>
                    {t(`admin.reports.reasons.${r.reason}`)}
                  </Badge>
                  {r.details && <div className="adm-muted">{r.details}</div>}
                  {r.status === 'PENDING' && r.pendingOnTarget > 1 && (
                    <div className="adm-muted">{t('admin.reports.reporterCount', { count: r.pendingOnTarget })}</div>
                  )}
                </td>
                <td className="adm-muted">{r.reporter.email}</td>
                <td className="adm-nowrap adm-muted">{formatDateTime(r.createdAt)}</td>
                <td className="adm-table__actions">
                  {r.status === 'PENDING' ? (
                    <Button size="sm" variant="primary" onClick={() => setHandling(r)}>
                      {t('admin.reports.resolveTitle')}
                    </Button>
                  ) : (
                    <div className="adm-muted">
                      <Badge tone={r.status === 'DISMISSED' ? 'neutral' : 'success'}>
                        {r.action ? t(`admin.reports.actions.${r.action}`) : t(`admin.reports.tabs.${r.status}`)}
                      </Badge>
                      {r.resolvedBy && (
                        <div>{t('admin.reports.handledBy', { name: r.resolvedBy.fullName || r.resolvedBy.email })}</div>
                      )}
                      {r.resolutionNote && <div>{r.resolutionNote}</div>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={5}
                icon="check"
                title={t('admin.reports.emptyTitle')}
                description={t('admin.reports.emptyHint')}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.reports.unit')}
            onChange={setPage}
          />
        )}
      </Card>

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
