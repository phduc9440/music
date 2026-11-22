import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Card, CellTitle, Pager, Table, TableState } from '../ui';
import { DEFAULT_PAGE_SIZE } from '../ui/helpers';
import { billingApi } from '../../services';
import type { PageResult, PlanGrant } from '../../types';
import { formatDateTime, t } from '../../i18n/core';

/** Admin, tab "Lịch sử cấp gói": mọi lần SUPER_ADMIN cấp gói thủ công (người nhận, gói, số tháng, người cấp, hạn mới). */
export default function PlanGrantHistoryPanel() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [result, setResult] = useState<PageResult<PlanGrant> | null>(null);

  useEffect(() => {
    let alive = true;
    billingApi
      .grantHistory({ page, size: pageSize })
      .then((res) => alive && setResult(res.data.result))
      .catch(() => alive && toast.error(t('admin.grantHistory.failed')));
    return () => {
      alive = false;
    };
  }, [page, pageSize]);

  const rows = result?.content ?? [];

  return (
    <Card title={t('admin.grantHistory.tab')} description={t('admin.grantHistory.sub')} flush>
      <Table minWidth={860}>
        <thead>
          <tr>
            <th>{t('admin.grantHistory.member')}</th>
            <th>{t('admin.grantHistory.plan')}</th>
            <th>{t('admin.grantHistory.kind')}</th>
            <th>{t('admin.grantHistory.by')}</th>
            <th>{t('admin.grantHistory.until')}</th>
            <th>{t('admin.grantHistory.at')}</th>
          </tr>
        </thead>
        <tbody>
          {!result && <TableState colSpan={6} loading />}
          {result && rows.length === 0 && <TableState colSpan={6} icon="inbox" title={t('admin.grantHistory.empty')} />}
          {rows.map((g) => (
            <tr key={g.id}>
              <td>
                <CellTitle sub={g.memberName ? g.memberEmail : undefined}>{g.memberName || g.memberEmail}</CellTitle>
              </td>
              <td>
                <CellTitle sub={t('admin.grantHistory.months', { count: g.months })}>{g.planName}</CellTitle>
              </td>
              <td>
                <Badge tone={g.kind === 'RENEW' ? 'success' : 'primary'}>{t(`billing.kind.${g.kind}`)}</Badge>
              </td>
              <td>
                {g.grantedByEmail ? (
                  <CellTitle sub={g.grantedByName ? g.grantedByEmail : undefined}>
                    {g.grantedByName || g.grantedByEmail}
                  </CellTitle>
                ) : (
                  t('admin.grantHistory.deletedAdmin')
                )}
              </td>
              <td>{formatDateTime(g.expiresAt)}</td>
              <td>{formatDateTime(g.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {result && result.totalPages > 1 && (
        <Pager
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
          page={result.pageNumber}
          totalPages={result.totalPages}
          totalElements={result.totalElements}
          unit={t('admin.grantHistory.unit')}
          onChange={setPage}
        />
      )}
    </Card>
  );
}
