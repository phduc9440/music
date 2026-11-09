import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Badge,
  Button,
  Card,
  CellTitle,
  DescriptionList,
  PageHeader,
  Pager,
  SearchForm,
  StatCard,
  StatGrid,
  Table,
  TableState,
  Toolbar,
} from '../../components/ui';
import { useDialog } from '../../components/ui/dialog-context';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import type { Tone } from '../../components/ui/helpers';
import { adminApi, taskApi } from '../../services';
import type { AdminAiTask, AiTaskInfo, AiTaskSummary, PageResult } from '../../types';
import { OMR_STEPS, describeTaskError } from '../../utils/omr';
import { TASK_TYPE_LABELS } from '../../utils/score';
import './AdminSystem.css';

const PAGE_SIZE = 20;
const REFRESH_MS = 10000;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chờ xử lý', tone: 'warning' },
  PROCESSING: { label: 'Đang chạy', tone: 'primary' },
  COMPLETED: { label: 'Hoàn tất', tone: 'success' },
  FAILED: { label: 'Lỗi', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

const STEP_LABELS: Record<string, string> = {
  QUEUED: 'Đang xếp hàng',
  ...Object.fromEntries(OMR_STEPS.map((s) => [s.key, s.label])),
};

/** 75 -> "1 phút 15 giây". */
const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} giây`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  return s > 0 ? `${m} phút ${s} giây` : `${m} phút`;
};

const toJson = (value: unknown) => {
  if (value == null) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** Câu lỗi tiếng Việt (dùng lại bảng dịch lỗi của trang tiến độ số hóa). */
const errorText = (t: AdminAiTask) => {
  if (t.status !== 'FAILED' && t.status !== 'CANCELLED') return null;
  const e = describeTaskError(t as unknown as AiTaskInfo);
  return `${e.title}${e.detail ? ` (${e.detail})` : ''}`;
};

/** Admin (mục 5.2): giám sát hàng đợi tác vụ AI, xem lỗi, hủy task đang chạy và chạy lại task OMR bị lỗi. */
export default function AdminAiTasks() {
  const { confirm } = useDialog();
  const [summary, setSummary] = useState<AiTaskSummary | null>(null);
  const [result, setResult] = useState<PageResult<AdminAiTask> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reload, setReload] = useState(0);
  const [auto, setAuto] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminAiTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getAiTasks({
        page,
        size: PAGE_SIZE,
        status: status || undefined,
        type: type || undefined,
        keyword: keyword || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      .then((res) => !cancelled && setResult(res.data.result))
      .catch((error) => !cancelled && toast.error(errorMessage(error, 'Không tải được danh sách tác vụ')));
    adminApi
      .getAiTaskSummary()
      .then((res) => !cancelled && setSummary(res.data.result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [page, status, type, keyword, from, to, reload]);

  const active = (summary?.pending ?? 0) + (summary?.processing ?? 0);

  // Còn task chờ/đang chạy thì tự làm mới (bỏ qua khi tab đang ẩn)
  useEffect(() => {
    if (!auto || active === 0) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setReload((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [auto, active]);

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(0);
    setOpenId(null);
  };
  const filtered = !!(keyword || status || type || from || to);

  const toggleDetail = useCallback(
    (t: AdminAiTask) => {
      if (openId === t.id) {
        setOpenId(null);
        return;
      }
      setOpenId(t.id);
      setDetail(null);
      adminApi
        .getAiTask(t.id)
        .then((res) => setDetail(res.data.result))
        .catch((error) => toast.error(errorMessage(error, 'Không tải được chi tiết tác vụ')));
    },
    [openId],
  );

  const cancel = async (t: AdminAiTask) => {
    const ok = await confirm({
      title: 'Hủy tác vụ này?',
      message: `${TASK_TYPE_LABELS[t.taskType] ?? t.taskType} của "${t.scoreTitle ?? 'bản nhạc'}" sẽ dừng lại.`,
      confirmLabel: 'Hủy tác vụ',
      cancelLabel: 'Không',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(t.id);
    try {
      await taskApi.cancel(t.id);
      toast.success('Đã hủy tác vụ');
    } catch (error) {
      toast.error(errorMessage(error, 'Không hủy được tác vụ'));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const retry = async (t: AdminAiTask) => {
    const ok = await confirm({
      title: `Chạy lại số hóa "${t.scoreTitle ?? 'bản nhạc'}"?`,
      message: `Tạo tác vụ mới với tham số lần trước, gán cho chủ bản nhạc (${t.memberEmail ?? '—'}).`,
      confirmLabel: 'Chạy lại',
    });
    if (!ok) return;
    setBusyId(t.id);
    try {
      await adminApi.retryAiTask(t.id);
      toast.success('Đã tạo tác vụ chạy lại');
    } catch (error) {
      toast.error(errorMessage(error, 'Không chạy lại được tác vụ'));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select className="adm-input" aria-label={label} value={value} onChange={(e) => changeFilter(() => onChange(e.target.value))}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  const avgHint =
    summary && summary.averageRunSeconds.length > 0
      ? summary.averageRunSeconds
          .map((a) => `${TASK_TYPE_LABELS[a.taskType] ?? a.taskType}: ${formatDuration(Math.round(a.seconds))}`)
          .join(' · ')
      : 'Chưa có tác vụ hoàn tất trong 7 ngày';

  return (
    <>
      <PageHeader
        title="Tác vụ AI"
        description="Hàng đợi số hóa (OMR), sinh hợp âm, xuất âm thanh và chuyển định dạng của mọi người dùng."
        actions={
          <>
            <label className="adm-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Tự làm mới khi có tác vụ đang chạy
            </label>
            <Button icon="refresh" onClick={() => setReload((n) => n + 1)}>
              Làm mới
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard label="Đang chờ" icon="clock" tone="warning" value={summary?.pending ?? '—'} hint="Chưa được xử lý" />
        <StatCard label="Đang chạy" icon="cpu" tone="primary" value={summary?.processing ?? '—'} hint="music-ai đang xử lý" />
        <StatCard
          label="Lỗi trong 24 giờ"
          icon="alert"
          tone={summary && summary.failedLast24h > 0 ? 'danger' : 'neutral'}
          value={summary?.failedLast24h ?? '—'}
          alert={!!summary && summary.failedLast24h > 0}
        />
        <StatCard label="Hoàn tất trong 24 giờ" icon="check" tone="success" value={summary?.completedLast24h ?? '—'} />
      </StatGrid>
      <p className="adm-muted" style={{ margin: '-0.25rem 0 1rem', fontSize: 'var(--adm-text-sm)' }}>
        Thời gian chạy trung bình (7 ngày): {avgHint}
      </p>

      <Toolbar>
        <SearchForm
          value={keywordInput}
          onChange={setKeywordInput}
          onSubmit={() => changeFilter(() => setKeyword(keywordInput.trim()))}
          placeholder="Tên bản nhạc hoặc email người tạo"
        />
        {select('Trạng thái', status, setStatus, [
          ['', 'Mọi trạng thái'],
          ...Object.entries(STATUS).map(([v, s]) => [v, s.label] as [string, string]),
        ])}
        {select('Loại tác vụ', type, setType, [['', 'Mọi loại'], ...Object.entries(TASK_TYPE_LABELS)])}
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label="Từ ngày"
          value={from}
          max={to || undefined}
          onChange={(e) => changeFilter(() => setFrom(e.target.value))}
        />
        <span className="adm-subtle">–</span>
        <input
          type="date"
          className="adm-input"
          style={{ width: 'auto' }}
          aria-label="Đến ngày"
          value={to}
          min={from || undefined}
          onChange={(e) => changeFilter(() => setTo(e.target.value))}
        />
        {filtered && (
          <Button
            variant="ghost"
            icon="x"
            onClick={() =>
              changeFilter(() => {
                setKeyword('');
                setKeywordInput('');
                setStatus('');
                setType('');
                setFrom('');
                setTo('');
              })
            }
          >
            Xóa bộ lọc
          </Button>
        )}
      </Toolbar>

      <Card flush>
        <Table minWidth={1050}>
          <thead>
            <tr>
              <th>Bản nhạc</th>
              <th>Loại</th>
              <th>Trạng thái</th>
              <th>Tạo lúc</th>
              <th className="adm-table__num">Chờ</th>
              <th className="adm-table__num">Chạy</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={7} loading />}
            {result?.content.map((t) => {
              const st = STATUS[t.status] ?? { label: t.status, tone: 'neutral' as Tone };
              const err = errorText(t);
              const running = t.status === 'PENDING' || t.status === 'PROCESSING';
              return (
                <Fragment key={t.id}>
                  <tr>
                    <td>
                      <CellTitle sub={t.memberEmail ?? undefined}>
                        {t.scoreId ? <Link to={`/admin/scores/${t.scoreId}`}>{t.scoreTitle}</Link> : '—'}
                      </CellTitle>
                    </td>
                    <td className="adm-muted">{TASK_TYPE_LABELS[t.taskType] ?? t.taskType}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {running && t.step && (
                          <span className="adm-subtle" style={{ fontSize: 'var(--adm-text-xs)' }}>
                            {STEP_LABELS[t.step] ?? t.step}
                            {t.progress != null && t.progress > 0 ? ` · ${t.progress}%` : ''}
                          </span>
                        )}
                        {err && (
                          <span style={{ color: 'var(--adm-danger)', fontSize: 'var(--adm-text-xs)', maxWidth: 260 }}>{err}</span>
                        )}
                      </div>
                    </td>
                    <td className="adm-nowrap adm-muted">{formatDateTime(t.createdAt)}</td>
                    <td className="adm-table__num adm-muted">{formatDuration(t.waitSeconds)}</td>
                    <td className="adm-table__num adm-muted">{formatDuration(t.runSeconds)}</td>
                    <td className="adm-table__actions">
                      <div className="adm-table__actions-inner">
                        <Button size="sm" variant="ghost" onClick={() => toggleDetail(t)} aria-expanded={openId === t.id}>
                          {openId === t.id ? 'Ẩn' : 'Chi tiết'}
                        </Button>
                        {t.canRetry && (
                          <Button size="sm" icon="refresh" disabled={busyId === t.id} onClick={() => retry(t)}>
                            Chạy lại
                          </Button>
                        )}
                        {t.canCancel && (
                          <Button size="sm" variant="ghost" icon="x" disabled={busyId === t.id} onClick={() => cancel(t)}>
                            Hủy
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openId === t.id && (
                    <tr className="adm-table__state">
                      <td colSpan={7} style={{ background: 'var(--adm-surface-muted)' }}>
                        {!detail ? (
                          <span className="adm-muted">Đang tải chi tiết…</span>
                        ) : (
                          <div className="adm-grid-2" style={{ margin: 0 }}>
                            <DescriptionList
                              items={[
                                ['Mã tác vụ', <span className="adm-code">{detail.id}</span>],
                                ['Bước', detail.step ? (STEP_LABELS[detail.step] ?? detail.step) : '—'],
                                ['Tiến độ', detail.progress != null ? `${detail.progress}%` : '—'],
                                ['Số lần tự gửi lại', String(detail.retryCount ?? 0)],
                                ['Bắt đầu', formatDateTime(detail.startedAt)],
                                ['Kết thúc', formatDateTime(detail.finishedAt)],
                                ['Lỗi gốc', detail.errorMessage ? <span className="adm-code">{detail.errorMessage}</span> : '—'],
                              ]}
                            />
                            <div style={{ display: 'grid', gap: '0.75rem', minWidth: 0 }}>
                              <div>
                                <div className="adm-field__label" style={{ marginBottom: '0.3rem' }}>
                                  Dữ liệu vào
                                </div>
                                <pre className="sys-stack" style={{ maxHeight: 160 }}>
                                  {toJson(detail.inputData)}
                                </pre>
                              </div>
                              <div>
                                <div className="adm-field__label" style={{ marginBottom: '0.3rem' }}>
                                  Kết quả
                                </div>
                                <pre className="sys-stack" style={{ maxHeight: 200 }}>
                                  {toJson(detail.resultData)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={7}
                icon="cpu"
                title="Không có tác vụ nào"
                description={filtered ? 'Không có tác vụ khớp bộ lọc.' : undefined}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit="tác vụ"
            onChange={(p) => {
              setOpenId(null);
              setPage(p);
            }}
          />
        )}
      </Card>
    </>
  );
}
