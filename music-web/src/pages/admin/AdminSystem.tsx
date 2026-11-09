import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminApi } from '../../services';
import type { ErrorLogEntry, SystemMetrics } from '../../types';
import './AdminSystem.css';

const REFRESH_MS = 10000;

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

function Meter({ label, percent, detail }: { label: string; percent: number | null; detail: string }) {
  const safe = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const level = safe >= 90 ? 'danger' : safe >= 70 ? 'warn' : 'ok';
  return (
    <div className="sys-card">
      <div className="sys-card__label">{label}</div>
      <div className="sys-card__value">{percent == null ? '—' : `${percent.toFixed(1)}%`}</div>
      <div className="sys-meter">
        <div className={`sys-meter__bar sys-meter__bar--${level}`} style={{ width: `${safe}%` }} />
      </div>
      <div className="sys-card__detail">{detail}</div>
    </div>
  );
}

const ratio = (used?: number | null, total?: number | null) =>
  used == null || !total ? null : (used * 100) / total;

/** Admin (mục 4.8): thông số tải máy chủ (tự làm mới) và nhật ký lỗi gần đây. */
export default function AdminSystem() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [logs, setLogs] = useState<ErrorLogEntry[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);

  const loadMetrics = useCallback(() => {
    adminApi
      .getMetrics()
      .then((res) => setMetrics(res.data.result))
      .catch(() => undefined); // lỗi tạm thời khi tự làm mới thì bỏ qua, không làm phiền bằng toast
  }, []);

  const loadLogs = useCallback(() => {
    adminApi
      .getErrorLogs(100)
      .then((res) => setLogs(res.data.result))
      .catch(() => toast.error('Không tải được nhật ký lỗi'));
  }, []);

  useEffect(() => {
    loadMetrics();
    loadLogs();
  }, [loadMetrics, loadLogs]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => {
      loadMetrics();
      loadLogs();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, loadMetrics, loadLogs]);

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
    (l) =>
      !needle ||
      `${l.message} ${l.logger} ${l.exceptionClass ?? ''}`.toLowerCase().includes(needle),
  );

  const m = metrics;
  const memUsed = m && m.physicalMemoryTotalBytes != null && m.physicalMemoryFreeBytes != null
    ? m.physicalMemoryTotalBytes - m.physicalMemoryFreeBytes
    : null;
  const diskUsed = m && m.diskTotalBytes != null && m.diskUsableBytes != null ? m.diskTotalBytes - m.diskUsableBytes : null;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Giám sát hệ thống</h1>
          <p>
            {m ? `Chạy được ${formatUptime(m.uptimeSeconds)} · Java ${m.javaVersion} · ${m.availableProcessors} nhân CPU` : ''}
          </p>
        </div>
        <label className="d-flex gap-2 align-items-center">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Tự làm mới mỗi {REFRESH_MS / 1000} giây
        </label>
      </div>

      <div className="sys-grid">
        <Meter
          label="CPU của backend"
          percent={m?.processCpuPercent ?? null}
          detail={`Cả máy: ${formatPercent(m?.systemCpuPercent)}${m?.loadAverage != null ? ` · load ${m.loadAverage}` : ''}`}
        />
        <Meter
          label="Heap Java"
          percent={ratio(m?.heapUsedBytes, m?.heapMaxBytes)}
          detail={m ? `${formatBytes(m.heapUsedBytes)} / ${formatBytes(m.heapMaxBytes)}` : '—'}
        />
        <Meter
          label="RAM máy chủ"
          percent={ratio(memUsed, m?.physicalMemoryTotalBytes)}
          detail={m ? `${formatBytes(memUsed)} / ${formatBytes(m.physicalMemoryTotalBytes)}` : '—'}
        />
        <Meter
          label="Ổ đĩa lưu file"
          percent={ratio(diskUsed, m?.diskTotalBytes)}
          detail={m ? `Còn trống ${formatBytes(m.diskUsableBytes)} / ${formatBytes(m.diskTotalBytes)}` : '—'}
        />
        <div className="sys-card">
          <div className="sys-card__label">Luồng (thread)</div>
          <div className="sys-card__value">{m?.threadCount ?? '—'}</div>
          <div className="sys-card__detail">Cao nhất: {m?.peakThreadCount ?? '—'}</div>
        </div>
        <div className="sys-card">
          <div className="sys-card__label">Lỗi từ lúc khởi động</div>
          <div className="sys-card__value">{m?.errorCountSinceStart ?? '—'}</div>
          <div className="sys-card__detail">Mức ERROR trong log</div>
        </div>
      </div>

      <div className="adm-card" style={{ marginTop: '1.25rem' }}>
        <div className="adm-page-head" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem' }}>Nhật ký lỗi</h2>
            <p>
              {logs ? `${logs.length} bản ghi gần nhất` : ''}. Chỉ lưu trong bộ nhớ, mất khi khởi động lại backend.
            </p>
          </div>
          <div className="d-flex gap-2">
            <input
              className="form-control"
              placeholder="Lọc theo nội dung, logger, exception"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <button className="btn" onClick={loadLogs}>
              Làm mới
            </button>
            <button className="btn btn-danger" onClick={clear} disabled={!logs || logs.length === 0}>
              Xóa log
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Logger</th>
                <th>Nội dung</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <Fragment key={l.id}>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString('vi-VN')}</td>
                    <td className="sys-logger" title={l.logger}>
                      {l.logger.split('.').pop()}
                    </td>
                    <td>
                      {l.exceptionClass && <strong>{l.exceptionClass.split('.').pop()}: </strong>}
                      {l.message}
                    </td>
                    <td>
                      {l.stackTrace && (
                        <button
                          className="btn"
                          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setOpenId(openId === l.id ? null : l.id)}
                        >
                          {openId === l.id ? 'Ẩn' : 'Chi tiết'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openId === l.id && l.stackTrace && (
                    <tr>
                      <td colSpan={4}>
                        <pre className="sys-stack">{l.stackTrace}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {logs && shown.length === 0 && (
                <tr>
                  <td colSpan={4}>{logs.length === 0 ? 'Chưa có lỗi nào được ghi lại.' : 'Không có bản ghi khớp bộ lọc.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
