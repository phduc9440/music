import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, Table, Tabs } from '../ui';
import Skeleton from '../ui/Skeleton';
import type { Tone } from '../ui/helpers';
import type { MemberPurchase } from '../../types';
import { formatCompact, formatDate, formatDateTime, formatVnd, t } from '../../i18n/core';
// Dùng lại khung biểu đồ, tooltip và chú thích của dashboard (dash-*)
import '../../pages/admin/AdminDashboard.css';

const AXIS = { fontSize: 12, fill: 'var(--ui-chart-axis)' };
// Màu theo loại đơn; đơn đã hoàn tiền màu trung tính. Luôn có chú thích chữ bên dưới biểu đồ.
const COLOR = {
  NEW: 'var(--ui-chart-revenue)',
  RENEW: 'var(--ui-chart-practice)',
  REFUNDED: 'var(--ui-chart-neutral)',
} as const;
const KIND_TONE: Record<string, Tone> = { NEW: 'primary', RENEW: 'success' };
const STATUS_TONE: Record<string, Tone> = { PAID: 'success', REFUNDED: 'violet' };

const colorOf = (p: MemberPurchase) =>
  p.status === 'REFUNDED' ? COLOR.REFUNDED : p.kind === 'RENEW' ? COLOR.RENEW : COLOR.NEW;
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
};
const planLine = (p: MemberPurchase) => `${p.planName} · ${t(`billing.period.${p.period}`)}`;

interface TipProps {
  active?: boolean;
  payload?: readonly { payload?: MemberPurchase }[];
}

/**
 * Admin, trang chi tiết thành viên: các lần mua gói đã thanh toán. Biểu đồ mỗi cột là một lần mua (trục ngang là ngày
 * mua, chiều cao là số tiền), có nút chuyển sang bảng.
 */
export default function MemberPurchasesCard({
  purchases,
  total,
  count,
  refundedTotal,
  refundedCount,
}: {
  purchases: MemberPurchase[] | null;
  total: number;
  count: number;
  refundedTotal: number;
  refundedCount: number;
}) {
  const [asTable, setAsTable] = useState(false);
  // API trả mới nhất trước; biểu đồ đọc từ trái sang phải theo thời gian
  const chronological = useMemo(() => [...(purchases ?? [])].reverse(), [purchases]);

  const description = !purchases
    ? undefined
    : count + refundedCount === 0
      ? t('admin.members.purchases.none')
      : [
          t('admin.members.purchases.summary', { amount: formatVnd(total), count }),
          refundedCount > 0
            ? t('admin.members.purchases.refunded', { amount: formatVnd(refundedTotal), count: refundedCount })
            : null,
        ]
          .filter(Boolean)
          .join(' · ');

  const empty = !!purchases && purchases.length === 0;

  return (
    <Card
      title={t('admin.members.purchases.title')}
      description={description}
      flush={asTable}
      className="dash"
      actions={
        !empty && (
          <Tabs
            value={asTable ? 'table' : 'chart'}
            onChange={(v) => setAsTable(v === 'table')}
            items={[
              { value: 'chart', label: t('admin.dashboard.chart') },
              { value: 'table', label: t('admin.dashboard.table') },
            ]}
          />
        )
      }
    >
      {asTable ? (
        <Table>
          <thead>
            <tr>
              <th>{t('admin.members.purchases.paidAt')}</th>
              <th>{t('admin.dashboard.planColumn')}</th>
              <th>{t('admin.members.purchases.kind')}</th>
              <th>{t('admin.official.statusColumn')}</th>
              <th className="adm-table__num">{t('admin.revenue.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {purchases?.map((p) => (
              <tr key={p.orderCode}>
                <td className="adm-nowrap">{formatDateTime(p.paidAt)}</td>
                <td>
                  {planLine(p)}
                  <div className="adm-code adm-muted">{p.orderCode}</div>
                </td>
                <td>
                  <Badge tone={KIND_TONE[p.kind] ?? 'neutral'}>{t(`billing.kind.${p.kind}`)}</Badge>
                </td>
                <td>
                  <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{t(`billing.result.status.${p.status}`)}</Badge>
                </td>
                <td className="adm-table__num">{formatVnd(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : !purchases ? (
        <Skeleton lines={4} />
      ) : empty ? (
        <div className="dash-empty">{t('admin.members.purchases.none')}</div>
      ) : (
        <>
          <div className="dash-chart">
            <ResponsiveContainer>
              <BarChart data={chronological} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--ui-chart-grid)" vertical={false} />
                <XAxis
                  dataKey="orderCode"
                  tickFormatter={(_, i) => (chronological[i] ? shortDate(chronological[i].paidAt) : '')}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  allowDecimals={false}
                  tick={AXIS}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v) => formatCompact(Number(v))}
                />
                <Tooltip
                  cursor={{ fill: 'var(--ui-chart-cursor)' }}
                  content={({ active, payload }: TipProps) => {
                    const p = active ? payload?.[0]?.payload : undefined;
                    return p ? (
                      <div className="dash-tooltip">
                        <div className="dash-tooltip__title">{formatDateTime(p.paidAt)}</div>
                        <div>{formatVnd(p.amount)}</div>
                        <div>
                          {t(`billing.kind.${p.kind}`)} · {planLine(p)}
                        </div>
                        {p.status === 'REFUNDED' && <div>{t('billing.result.status.REFUNDED')}</div>}
                      </div>
                    ) : null;
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {chronological.map((p) => (
                    <Cell key={p.orderCode} fill={colorOf(p)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="dash-legend" aria-label={t('admin.members.purchases.legend')}>
            <li>
              <span className="dash-legend__dot" style={{ background: COLOR.NEW }} />
              {t('billing.kind.NEW')}
            </li>
            <li>
              <span className="dash-legend__dot" style={{ background: COLOR.RENEW }} />
              {t('billing.kind.RENEW')}
            </li>
            {refundedCount > 0 && (
              <li>
                <span className="dash-legend__dot" style={{ background: COLOR.REFUNDED }} />
                {t('billing.result.status.REFUNDED')}
              </li>
            )}
          </ul>
          {purchases.length < count + refundedCount && (
            <p className="dash-footnote">
              {t('admin.members.purchases.latestOnly', {
                count: purchases.length,
                from: formatDate(chronological[0].paidAt),
              })}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
