import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Button, Card, Icon, PageHeader, StatCard, StatGrid, Table, TableState } from '../../components/ui';
import type { IconName } from '../../components/ui';
import { adminApi } from '../../services';
import type { ErrorLogEntry, SystemMetrics } from '../../types';
import './AdminSystem.css';

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
  return [d > 0 ? `${d} ngày` : '', h > 0 ? `${h} giờ` : '', `${m} phút`].filter(Boolean).join(' ');
};

const formatPercent = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

const LEVELS = {
  ok: { label: 'Bình thường', tone: 'success' as const },
  warn: { label: 'Cao', tone: 'warning' as const },
  danger: { label: 'Quá tải', tone: 'danger' as const },
};

/** Thẻ đo mức sử dụng: số phần trăm, thanh đo và nhãn mức (màu luôn đi kèm chữ). */
function Meter({ label, icon, percent, detail }: { label: string; icon: IconName; percent: number | null; detail: string }) {
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

const ratio = (used?: number | null, total?: number | null) =>
  used == null || !total ? null : (used * 100) / total;

/** Admin (mục 4.8): thông số tải máy chủ và nhật ký lỗi gần đây, tự làm mới mỗi 30 giây hoặc khi bấm nút. */
const REFRESH_MS = 30000;

export default function AdminSystem() {
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
      .catch(() => toast.error('Không tải được thông số máy chủ'));
  }, []);

  const loadLogs = useCallback(() => {
    return adminApi
      .getErrorLogs(100)
      .then((res) => setLogs(res.data.result))
      .catch(() => toast.error('Không tải được nhật ký lỗi'));
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
    if (!window.confirm('Xóa toàn bộ nhật ký lỗi đang lưu trong bộ nhớ?')) return;
    try {
      await adminApi.clearErrorLogs();
      toast.success('Đã xóa nhật ký lỗi');
      loadLogs();
      loadMetrics();
    } catch {
      toast.error('Không xóa được nhật ký lỗi');
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
  const diskUsed = m && m.diskTotalBytes != null && m.diskUsableBytes != null ? m.diskTotalBytes - m.diskUsableBytes : null;

  return (
    <>
      <PageHeader
        title="Giám sát hệ thống"
        description={
          m ? `Đã chạy ${formatUptime(m.uptimeSeconds)} · Java ${m.javaVersion} · ${m.availableProcessors} nhân CPU` : 'Thông số máy chủ và nhật ký lỗi'
        }
        actions={
          <>
            <label className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Tự làm mới mỗi {REFRESH_MS / 1000} giây
            </label>
            <Button icon="refresh" loading={refreshing} onClick={refresh}>
              Làm mới
            </Button>
          </>
        }
      />

      <StatGrid minWidth={280}>
        <Meter
          label="CPU của backend"
          icon="cpu"
          percent={m?.processCpuPercent ?? null}
          detail={`Cả máy: ${formatPercent(m?.systemCpuPercent)}${m?.loadAverage != null ? ` · load ${m.loadAverage}` : ''}`}
        />
        <Meter
          label="Heap Java"
          icon="activity"
          percent={ratio(m?.heapUsedBytes, m?.heapMaxBytes)}
          detail={m ? `${formatBytes(m.heapUsedBytes)} / ${formatBytes(m.heapMaxBytes)}` : '—'}
        />
        <Meter
          label="RAM máy chủ"
          icon="server"
          percent={ratio(memUsed, m?.physicalMemoryTotalBytes)}
          detail={m ? `${formatBytes(memUsed)} / ${formatBytes(m.physicalMemoryTotalBytes)}` : '—'}
        />
        <Meter
          label="Ổ đĩa lưu file"
          icon="inbox"
          percent={ratio(diskUsed, m?.diskTotalBytes)}
          detail={m ? `Còn trống ${formatBytes(m.diskUsableBytes)} / ${formatBytes(m.diskTotalBytes)}` : '—'}
        />
        <StatCard label="Luồng (thread)" icon="server" value={m?.threadCount ?? '—'} hint={`Cao nhất: ${m?.peakThreadCount ?? '—'}`} />
        <StatCard
          label="Lỗi từ lúc khởi động"
          icon="alert"
          tone={m && m.errorCountSinceStart > 0 ? 'danger' : 'neutral'}
          value={m?.errorCountSinceStart ?? '—'}
          hint="Mức ERROR trong log"
        />
      </StatGrid>

      <Card
        flush
        title="Nhật ký lỗi"
        description={`${logs ? `${logs.length} bản ghi gần nhất. ` : ''}Chỉ lưu trong bộ nhớ, mất khi khởi động lại backend.`}
        actions={
          <>
            <input
              className="adm-input"
              style={{ width: 280 }}
              placeholder="Lọc theo nội dung, logger, exception"
              aria-label="Lọc nhật ký lỗi"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button variant="ghost" icon="trash" onClick={clear} disabled={!logs || logs.length === 0}>
              Xóa log
            </Button>
          </>
        }
      >
        <Table minWidth={800}>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Logger</th>
              <th>Nội dung</th>
              <th className="adm-table__actions" />
            </tr>
          </thead>
          <tbody>
            {!logs && <TableState colSpan={4} loading />}
            {shown.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td className="adm-nowrap adm-muted">{new Date(l.timestamp).toLocaleString('vi-VN')}</td>
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
                        {openId === l.id ? 'Ẩn' : 'Chi tiết'}
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
                title={logs.length === 0 ? 'Chưa có lỗi nào' : 'Không có bản ghi khớp bộ lọc'}
              />
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
