import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../components/scores/Modal';
import Pagination from '../../components/scores/Pagination';
import { practiceApi } from '../../services';
import { getErrorMessage } from '../../utils/score';
import type { PageResult, PracticeSessionRecord } from '../../types';
import '../../components/scores/scores.css';
import { useDialog } from '../../components/ui/dialog-context';

const PAGE_SIZE = 20;
const MODE_LABELS: Record<number, string> = { 1: 'Tự do', 2: 'Lặp đoạn', 3: 'Chấm điểm' };

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
};
const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
const formatPct = (v?: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);

/** Trang /practice-history: lịch sử phiên tập của tôi, xem log lỗi chi tiết và xóa phiên (mục 3.11). */
export default function PracticeHistory() {
  const { confirm } = useDialog();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResult<PracticeSessionRecord> | null>(null);
  const [detail, setDetail] = useState<PracticeSessionRecord | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    practiceApi
      .list({ page, size: PAGE_SIZE })
      .then((res) => setResult(res.data.result))
      .catch(() => toast.error('Không tải được lịch sử phiên tập'));
  }, [page, reload]);

  const openDetail = async (id: string) => {
    try {
      const res = await practiceApi.get(id);
      setDetail(res.data.result);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không tải được chi tiết phiên tập'));
    }
  };

  const remove = async (s: PracticeSessionRecord) => {
    const ok = await confirm({
      title: 'Xóa phiên tập này?',
      message: `"${s.scoreTitle}" lúc ${formatDate(s.startedAt)}. Số liệu thống kê sẽ tính lại.`,
      confirmLabel: 'Xóa',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await practiceApi.remove(s.id);
      toast.success('Đã xóa phiên tập');
      setDetail(null);
      setReload((n) => n + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Không xóa được phiên tập'));
    }
  };

  return (
    <div className="sc-page">
      <main className="sc-container">
        <header className="sc-lib-head">
          <div>
            <h1>Lịch sử phiên tập</h1>
            <p>{result ? `${result.totalElements} phiên` : 'Thời gian, bài tập, % đúng và log lỗi'}</p>
          </div>
        </header>

        {result && result.content.length === 0 && (
          <div className="sc-empty">
            <h3>Chưa có phiên tập nào</h3>
            <p>Các phiên luyện tập của bạn sẽ được lưu ở đây.</p>
          </div>
        )}

        {result && result.content.length > 0 && (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Bắt đầu</th>
                  <th>Bài tập</th>
                  <th>Chế độ</th>
                  <th>Thời lượng</th>
                  <th>% đúng</th>
                  <th>% đúng nhịp</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.content.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.startedAt)}</td>
                    <td>{s.scoreTitle}</td>
                    <td>{MODE_LABELS[s.mode] ?? s.mode}</td>
                    <td>{formatDuration(s.durationSeconds)}</td>
                    <td>{formatPct(s.accuracyPct)}</td>
                    <td>{formatPct(s.timingAccuracyPct)}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button className="sc-btn sc-btn--sm" onClick={() => openDetail(s.id)}>
                          Chi tiết
                        </button>
                        <button className="sc-btn sc-btn--sm sc-btn--danger" onClick={() => remove(s)}>
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && (
          <Pagination
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            onChange={setPage}
          />
        )}
      </main>

      {detail && (
        <Modal title={`Phiên tập: ${detail.scoreTitle}`} onClose={() => setDetail(null)}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 4 }}>
            <li>Chế độ: {MODE_LABELS[detail.mode] ?? detail.mode}</li>
            <li>Bắt đầu: {formatDate(detail.startedAt)}</li>
            <li>Thời lượng: {formatDuration(detail.durationSeconds)}</li>
            {detail.tempoPercent != null && <li>Tốc độ: {detail.tempoPercent}%</li>}
            {detail.loopStartMeasure != null && (
              <li>
                Đoạn lặp: ô nhịp {detail.loopStartMeasure} – {detail.loopEndMeasure ?? '?'}
              </li>
            )}
            <li>Tổng số nốt: {detail.totalNotes ?? '—'}</li>
            <li>
              Đúng giờ {detail.perfectCount ?? 0} · Sớm {detail.earlyCount ?? 0} · Trễ {detail.lateCount ?? 0} · Sai cao
              độ {detail.wrongPitchCount ?? 0} · Bỏ lỡ {detail.missedCount ?? 0}
            </li>
            <li>
              % đúng: {formatPct(detail.accuracyPct)} · % đúng nhịp: {formatPct(detail.timingAccuracyPct)}
            </li>
            {detail.scorePoints != null && <li>Điểm: {detail.scorePoints}</li>}
            <li>Hoàn thành: {detail.isCompleted ? 'Có' : 'Không'}</li>
          </ul>
          <h4 style={{ marginTop: 12 }}>Log lỗi ({detail.errorLog?.length ?? 0})</h4>
          {detail.errorLog && detail.errorLog.length > 0 ? (
            <pre style={{ maxHeight: 240, overflow: 'auto', fontSize: 12 }}>
              {JSON.stringify(detail.errorLog, null, 2)}
            </pre>
          ) : (
            <p>Không có lỗi nào được ghi lại.</p>
          )}
          <div className="sc-modal__actions">
            <button className="sc-btn sc-btn--danger" onClick={() => remove(detail)}>
              Xóa phiên
            </button>
            <button className="sc-btn" onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
