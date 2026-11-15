import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Link } from '../../routes/transition-nav';
import { Badge, Button, Card, CellTitle, PageHeader, Pager, Table, TableState, Toolbar } from '../../components/ui';
import { formatDateTime } from '../../components/ui/helpers';
import { adminReportApi } from '../../services';
import type { ActivityEntry, ActivityType, PageResult } from '../../types';
import { t } from '../../i18n/core';

const PAGE_SIZE = 30;
const TYPES: ActivityType[] = [
  'REPORT_CREATED',
  'REPORT_RESOLVED',
  'SCORE_DELETED_BY_ADMIN',
  'COMMENT_HIDDEN',
  'TEAM_DELETED_BY_ADMIN',
  'PLAN_SANCTION',
];
const TARGETS = ['SCORE', 'COMMENT', 'TEAM', 'MEMBER'];

interface Filters {
  actor: string;
  type: string;
  targetType: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { actor: '', type: '', targetType: '', from: '', to: '' };

const TONE: Record<ActivityType, 'neutral' | 'warning' | 'danger' | 'success'> = {
  REPORT_CREATED: 'warning',
  REPORT_RESOLVED: 'success',
  SCORE_DELETED_BY_ADMIN: 'danger',
  COMMENT_HIDDEN: 'danger',
  TEAM_DELETED_BY_ADMIN: 'danger',
  PLAN_SANCTION: 'warning',
};

/** Đường dẫn tới đối tượng nếu trang quản trị có trang chi tiết cho nó. */
const targetLink = (e: ActivityEntry): string | null => {
  if (!e.targetId) return null;
  if (e.targetType === 'MEMBER') return `/admin/members/${e.targetId}`;
  if (e.targetType === 'TEAM') return `/admin/teams/${e.targetId}`;
  return null;
};

/**
 * Admin (R5): trang "Nhật ký". Không có bảng nhật ký: BE suy ra từng dòng từ bảng gốc (báo cáo, bản nhạc bị xóa, góp ý bị
 * ẩn, nhóm bị xóa, chế tài gói) nên luôn khớp dữ liệu thật.
 */
export default function AdminActivity() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<ActivityEntry> | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminReportApi
      .activity({
        page,
        size: PAGE_SIZE,
        actor: filters.actor.trim() || undefined,
        type: filters.type || undefined,
        targetType: filters.targetType || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
      .then((res) => !cancelled && setResult(res.data.result))
      .catch(() => !cancelled && toast.error(t('admin.audit.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  const apply = (next: Filters) => {
    setResult(null);
    setPage(0);
    setFilters(next);
  };
  const set = (patch: Partial<Filters>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Ô chọn áp dụng ngay; ô gõ email áp dụng khi bấm Enter
    if (!('actor' in patch)) apply(next);
  };

  return (
    <>
      <PageHeader title={t('admin.menu.items.audit')} description={t('admin.audit.description')} />

      <Toolbar>
        <form
          className="adm-search"
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <input
            className="adm-input"
            placeholder={t('admin.audit.filters.actor')}
            aria-label={t('admin.audit.filters.actor')}
            value={draft.actor}
            onChange={(e) => set({ actor: e.target.value })}
          />
        </form>
        <select
          className="adm-input"
          aria-label={t('admin.audit.filters.type')}
          value={draft.type}
          onChange={(e) => set({ type: e.target.value })}
        >
          <option value="">{t('admin.audit.filters.allTypes')}</option>
          {TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`admin.audit.types.${v}`)}
            </option>
          ))}
        </select>
        <select
          className="adm-input"
          aria-label={t('admin.audit.filters.targetType')}
          value={draft.targetType}
          onChange={(e) => set({ targetType: e.target.value })}
        >
          <option value="">{t('admin.audit.filters.allTargets')}</option>
          {TARGETS.map((v) => (
            <option key={v} value={v}>
              {t(`admin.audit.targets.${v}`)}
            </option>
          ))}
        </select>
        <input
          className="adm-input"
          type="date"
          aria-label={t('admin.audit.filters.from')}
          title={t('admin.audit.filters.from')}
          value={draft.from}
          onChange={(e) => set({ from: e.target.value })}
        />
        <input
          className="adm-input"
          type="date"
          aria-label={t('admin.audit.filters.to')}
          title={t('admin.audit.filters.to')}
          value={draft.to}
          onChange={(e) => set({ to: e.target.value })}
        />
        <Button
          onClick={() => {
            setDraft(EMPTY);
            apply(EMPTY);
          }}
        >
          {t('admin.audit.filters.clear')}
        </Button>
      </Toolbar>

      <Card flush>
        <Table minWidth={900}>
          <thead>
            <tr>
              <th>{t('admin.audit.columns.time')}</th>
              <th>{t('admin.audit.columns.actor')}</th>
              <th>{t('admin.audit.columns.type')}</th>
              <th>{t('admin.audit.columns.target')}</th>
              <th>{t('admin.audit.columns.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={5} loading />}
            {result?.content.map((e) => {
              const link = targetLink(e);
              return (
                <tr key={e.id}>
                  <td className="adm-nowrap adm-muted">{formatDateTime(e.occurredAt)}</td>
                  <td className="adm-muted">{e.actorEmail ?? '—'}</td>
                  <td>
                    <Badge tone={TONE[e.type] ?? 'neutral'}>{t(`admin.audit.types.${e.type}`)}</Badge>
                  </td>
                  <td>
                    <CellTitle sub={e.targetType ? t(`admin.audit.targets.${e.targetType}`) : undefined}>
                      {link ? (
                        <Link to={link}>{e.targetLabel || e.targetId}</Link>
                      ) : (
                        <span>{e.targetLabel || '—'}</span>
                      )}
                    </CellTitle>
                  </td>
                  <td className="adm-muted">{e.detail ?? '—'}</td>
                </tr>
              );
            })}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={5}
                icon="list"
                title={t('admin.audit.emptyTitle')}
                description={t('admin.audit.emptyHint')}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.audit.unit')}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
