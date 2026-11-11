import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Button, Card, Icon, PageHeader, StatCard, StatGrid, Table, TableState } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { adminApi } from '../../services';
import type { ErrorLogEntry, SystemMetrics } from '../../types';
import './AdminSystem.css';
import { useDialog } from '../../components/ui/dialog-context';
import { formatDateTime, t } from '../../i18n/core';

const formatBytes = (bytes?: number | null) => {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatUptime = (seconds: number) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [
    d > 0 ? t('admin.system.days', { count: d }) : '',
    h > 0 ? t('admin.system.hours', { count: h }) : '',
    t('admin.system.minutes', { count: m }),
  ]
    .filter(Boolean)
    .join(' ');
};

const formatPercent = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

const LEVELS = {
  ok: {
    get label() {
      return t('admin.system.level.ok');
    },
    tone: 'success' as const,
  },
  warn: {
    get label() {
      return t('admin.system.level.warn');
    },
    tone: 'warning' as const,
  },
  danger: {
    get label() {
      return t('admin.system.level.danger');
    },
    tone: 'danger' as const,
  },
};

/** Thẻ đo mức sử dụng: số phần trăm, thanh đo và nhãn mức (màu luôn đi kèm chữ). */
function Meter({
  label,
  icon,
  percent,
  detail,
}: {
  label: string;
  icon: IconName;
  percent: number | null;
  detail: string;
}) {
  const safe = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const level = safe >= 90 ? 'danger' : safe >= 70 ? 'warn' : 'ok';
  return (
    <div className="adm-stat">
      <div className="adm-stat__top">
        <span className="adm-stat__label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
          <Icon name={icon} size={16} />
          {label}
        </span>
        {percent != null && <Badge tone={LEVELS[level].tone}>{LEVELS[level].label}</Badge>}
      </div>
      <div className="adm-stat__value">{percent == null ? '—' : `${percent.toFixed(1)}%`}</div>
      <div
        className="sys-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safe)}
      >
        <div className={`sys-meter__bar sys-meter__bar--${level}`} style={{ width: `${safe}%` }} />
      </div>
      <div className="adm-stat__hint">{detail}</div>
    </div>
  );
}

const ratio = (used?: number | null, total?: number | null) => (used == null || !total ? null : (used * 100) / total);

/** Admin (mục 4.8): thông số tải máy chủ và nhật ký lỗi gần đây, tự làm mới mỗi 30 giây hoặc khi bấm nút. */
const REFRESH_MS = 30000;

export default function AdminSystem() {
  const { confirm } = useDialog();
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [logs, setLogs] = useState<ErrorLogEntry[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [auto, setAuto] = useState(true);

  const loadMetrics = useCallback(() => {
    return adminApi
      .getMetrics()
      .then((res) => setMetrics(res.data.result))
      .catch(() => toast.error(t('admin.system.metricsFailed')));
  }, []);

  const loadLogs = useCallback(() => {
    return adminApi
      .getErrorLogs(100)
      .then((res) => setLogs(res.data.result))
      .catch(() => toast.error(t('admin.system.logsFailed')));
  }, []);

  useEffect(() => {
    loadMetrics();
    loadLogs();
  }, [loadMetrics, loadLogs]);

  // Tự làm mới mỗi 30 giây khi bật; tab bị ẩn thì bỏ qua lượt đó để khỏi gọi API vô ích
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadMetrics();
        loadLogs();
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, loadMetrics, loadLogs]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMetrics(), loadLogs()]);
    setRefreshing(false);
  };

  const clear = async () => {
    const ok = await confirm({
      title: t('admin.system.clearTitle'),
      message: t('admin.system.clearMessage'),
      confirmLabel: t('admin.system.clear'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminApi.clearErrorLogs();
      toast.success(t('admin.system.cleared'));
      loadLogs();
      loadMetrics();
    } catch {
      toast.error(t('admin.system.clearFailed'));
    }
  };

  const needle = keyword.trim().toLowerCase();
  const shown = (logs ?? []).filter(
    (l) => !needle || `${l.message} ${l.logger} ${l.exceptionClass ?? ''}`.toLowerCase().includes(needle),
  );

  const m = metrics;
  const memUsed =
    m && m.physicalMemoryTotalBytes != null && m.physicalMemoryFreeBytes != null
      ? m.physicalMemoryTotalBytes - m.physicalMemoryFreeBytes
      : null;
  const diskUsed =
    m && m.diskTotalBytes != null && m.diskUsableBytes != null ? m.diskTotalBytes - m.diskUsableBytes : null;

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.system')}
        description={
          m
            ? t('admin.system.summary', {
                uptime: formatUptime(m.uptimeSeconds),
                java: m.javaVersion,
                cpus: m.availableProcessors,
              })
            : t('admin.system.subtitle')
        }
        actions={
          <>
            <label className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              {t('admin.system.autoRefresh', { count: REFRESH_MS / 1000 })}
            </label>
            <Button icon="refresh" loading={refreshing} onClick={refresh}>
              {t('admin.system.refresh')}
            </Button>
          </>
        }
      />

      <StatGrid minWidth={280}>
        <Meter
          label={t('admin.system.cpu')}
          icon="cpu"
          percent={m?.processCpuPercent ?? null}
          detail={`${t('admin.system.wholeMachine', { value: formatPercent(m?.systemCpuPercent) })}${m?.loadAverage != null ? ` · load ${m.loadAverage}` : ''}`}
        />
        <Meter
          label="Heap Java"
          icon="activity"
          percent={ratio(m?.heapUsedBytes, m?.heapMaxBytes)}
          detail={m ? `${formatBytes(m.heapUsedBytes)} / ${formatBytes(m.heapMaxBytes)}` : '—'}
        />
        <Meter
          label={t('admin.system.ram')}
          icon="server"
          percent={ratio(memUsed, m?.physicalMemoryTotalBytes)}
          detail={m ? `${formatBytes(memUsed)} / ${formatBytes(m.physicalMemoryTotalBytes)}` : '—'}
        />
        <Meter
          label={t('admin.system.disk')}
          icon="inbox"
          percent={ratio(diskUsed, m?.diskTotalBytes)}
          detail={
            m
              ? t('admin.system.diskFree', {
                  free: formatBytes(m.diskUsableBytes),
                  total: formatBytes(m.diskTotalBytes),
                })
              : '—'
          }
        />
        <StatCard
          label={t('admin.system.threads')}
          icon="server"
          value={m?.threadCount ?? '—'}
          hint={t('admin.system.peak', { value: m?.peakThreadCount ?? '—' })}
        />
        <StatCard
          label={t('admin.system.errorsSinceStart')}
          icon="alert"
          tone={m && m.errorCountSinceStart > 0 ? 'danger' : 'neutral'}
          value={m?.errorCountSinceStart ?? '—'}
          hint={t('admin.system.errorLevel')}
        />
      </StatGrid>

      <Card
        flush
        title={t('admin.system.logTitle')}
        description={`${logs ? `${t('admin.system.logCount', { count: logs.length })} ` : ''}${t('admin.system.logNote')}`}
        actions={
          <>
            <input
              className="adm-input"
              style={{ width: 280 }}
              placeholder={t('admin.system.filterPlaceholder')}
              aria-label={t('admin.system.filterLabel')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button variant="ghost" icon="trash" onClick={clear} disabled={!logs || logs.length === 0}>
              {t('admin.system.clear')}
            </Button>
          </>
        }
      >
        <Table minWidth={800}>
          <thead>
            <tr>
              <th>{t('admin.system.time')}</th>
              <th>Logger</th>
              <th>{t('admin.system.message')}</th>
              <th className="adm-table__actions" />
            </tr>
          </thead>
          <tbody>
            {!logs && <TableState colSpan={4} loading />}
            {shown.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td className="adm-nowrap adm-muted">{formatDateTime(l.timestamp)}</td>
                  <td className="sys-logger" title={l.logger}>
                    {l.logger.split('.').pop()}
                  </td>
                  <td>
                    {l.exceptionClass && <strong>{l.exceptionClass.split('.').pop()}: </strong>}
                    {l.message}
                  </td>
                  <td className="adm-table__actions">
                    {l.stackTrace && (
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === l.id ? null : l.id)}>
                        {openId === l.id ? t('admin.system.hide') : t('practice.history.details')}
                      </Button>
                    )}
                  </td>
                </tr>
                {openId === l.id && l.stackTrace && (
                  <tr className="adm-table__state">
                    <td colSpan={4}>
                      <pre className="sys-stack">{l.stackTrace}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {logs && shown.length === 0 && (
              <TableState
                colSpan={4}
                icon={logs.length === 0 ? 'check' : 'search'}
                title={logs.length === 0 ? t('admin.system.noErrors') : t('admin.system.noMatch')}
              />
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
