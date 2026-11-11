import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Button, Card, PageHeader, StatCard, StatGrid, Table, TableState } from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import { billingApi } from '../../services';
import type { PaymentKind, PaymentOrder, PaymentStatus, Revenue } from '../../types';
import { formatDate, formatNumber, formatVnd, t } from '../../i18n/core';

const KINDS: PaymentKind[] = ['NEW', 'RENEW'];
const STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'];
const KIND_TONE = { NEW: 'info', RENEW: 'success' } as const;
const TONE = { PAID: 'success', PENDING: 'warning', FAILED: 'danger', EXPIRED: 'neutral', REFUNDED: 'violet' } as const;
const PAGE_SIZE = 15;

/** Admin (mục 7.4): doanh thu theo ngày và theo gói, danh sách đơn thanh toán, hoàn tiền thủ công. */
export default function AdminRevenue() {
  const { confirm } = useDialog();
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[] | null>(null);
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [kind, setKind] = useState<PaymentKind | ''>('');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadRevenue = useCallback(() => {
    billingApi
      .revenue()
      .then((res) => setRevenue(res.data.result))
      .catch(() => toast.error(t('admin.revenue.loadFailed')));
  }, []);

  const loadOrders = useCallback(() => {
    billingApi
      .orders({ status: status || undefined, kind: kind || undefined, page, size: PAGE_SIZE })
      .then((res) => {
        setOrders(res.data.result.content);
        setTotalPages(res.data.result.totalPages);
      })
      .catch(() => toast.error(t('admin.revenue.loadFailed')));
  }, [status, kind, page]);

  useEffect(loadRevenue, [loadRevenue]);
  useEffect(loadOrders, [loadOrders]);

  const refund = async (order: PaymentOrder) => {
    const ok = await confirm({
      title: t('admin.revenue.refundTitle', { code: order.orderCode }),
      message: t('admin.revenue.refundMessage', { amount: formatVnd(order.amount), email: order.memberEmail ?? '' }),
      confirmLabel: t('admin.revenue.refund'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(order.id);
    try {
      await billingApi.refund(order.id);
      toast.success(t('admin.revenue.refunded'));
      loadOrders();
      loadRevenue();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.revenue.refundFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const daysWithRevenue = revenue?.byDay.filter((d) => d.count > 0).reverse() ?? [];

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.revenue')}
        description={
          revenue
            ? t('admin.revenue.range', { from: formatDate(revenue.from), to: formatDate(revenue.to) })
            : t('admin.revenue.subtitle')
        }
      />

      <StatGrid>
        <StatCard
          label={t('admin.revenue.total')}
          icon="chart"
          tone="success"
          value={revenue ? formatVnd(revenue.totalAmount) : '—'}
          hint={revenue ? t('admin.revenue.orders', { count: formatNumber(revenue.orderCount) }) : undefined}
        />
        <StatCard
          label={t('admin.revenue.refundedTotal')}
          icon="refresh"
          tone="warning"
          value={revenue ? formatVnd(revenue.refundedAmount) : '—'}
          hint={revenue ? t('admin.revenue.orders', { count: formatNumber(revenue.refundedCount) }) : undefined}
        />
      </StatGrid>

      <div className="adm-grid-2">
        <Card title={t('admin.revenue.byDay')} flush>
          <Table>
            <thead>
              <tr>
                <th>{t('admin.revenue.date')}</th>
                <th>{t('admin.revenue.orderCount')}</th>
                <th>{t('admin.revenue.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {!revenue && <TableState colSpan={3} loading />}
              {revenue && daysWithRevenue.length === 0 && (
                <TableState colSpan={3} icon="chart" title={t('admin.revenue.empty')} />
              )}
              {daysWithRevenue.map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td>{formatNumber(d.count)}</td>
                  <td>{formatVnd(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title={t('admin.revenue.byPlan')} flush>
          <Table>
            <thead>
              <tr>
                <th>{t('admin.plan.plan')}</th>
                <th>{t('admin.revenue.orderCount')}</th>
                <th>{t('admin.revenue.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {!revenue && <TableState colSpan={3} loading />}
              {revenue && revenue.byPlan.length === 0 && (
                <TableState colSpan={3} icon="chart" title={t('admin.revenue.empty')} />
              )}
              {revenue?.byPlan.map((p) => (
                <tr key={p.planCode}>
                  <td>{p.planName}</td>
                  <td>{formatNumber(p.count)}</td>
                  <td>{formatVnd(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card
        title={t('admin.revenue.ordersTitle')}
        flush
        actions={
          <>
            <select
              className="adm-input"
              value={kind}
              aria-label={t('admin.revenue.kind')}
              onChange={(e) => {
                setKind(e.target.value as PaymentKind | '');
                setPage(0);
              }}
            >
              <option value="">{t('admin.revenue.allKinds')}</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`billing.kind.${k}`)}
                </option>
              ))}
            </select>
            <select
              className="adm-input"
              value={status}
              aria-label={t('admin.revenue.status')}
              onChange={(e) => {
                setStatus(e.target.value as PaymentStatus | '');
                setPage(0);
              }}
            >
              <option value="">{t('admin.revenue.allStatuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`billing.result.status.${s}`)}
                </option>
              ))}
            </select>
          </>
        }
      >
        <Table>
          <thead>
            <tr>
              <th>{t('admin.revenue.code')}</th>
              <th>{t('admin.revenue.buyer')}</th>
              <th>{t('admin.plan.plan')}</th>
              <th>{t('admin.revenue.kind')}</th>
              <th>{t('admin.revenue.amount')}</th>
              <th>{t('admin.revenue.status')}</th>
              <th>{t('admin.revenue.created')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!orders && <TableState colSpan={8} loading />}
            {orders && orders.length === 0 && (
              <TableState colSpan={8} icon="inbox" title={t('admin.revenue.noOrders')} />
            )}
            {orders?.map((o) => (
              <tr key={o.id}>
                <td className="adm-code">{o.orderCode}</td>
                <td>{o.memberEmail}</td>
                <td>
                  {o.planName} · {t(`billing.period.${o.period}`)}
                </td>
                <td>
                  <Badge tone={KIND_TONE[o.kind]}>{t(`billing.kind.${o.kind}`)}</Badge>
                </td>
                <td>{formatVnd(o.amount)}</td>
                <td>
                  <Badge tone={TONE[o.status]}>{t(`billing.result.status.${o.status}`)}</Badge>
                </td>
                <td className="adm-nowrap adm-muted">{formatDateTime(o.createdAt)}</td>
                <td>
                  {o.status === 'PAID' && (
                    <Button size="sm" variant="ghost" disabled={busyId === o.id} onClick={() => refund(o)}>
                      {t('admin.revenue.refund')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}>
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              {t('common.pagination.prev')}
            </Button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <Button size="sm" variant="ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t('common.pagination.next')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
