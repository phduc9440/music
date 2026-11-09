import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button, ButtonLink, Card, CellTitle, PageHeader, Pager, Table, TableState } from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';

const PAGE_SIZE = 20;

/** Admin (mục 4.4): duyệt hoặc từ chối các bản nhạc chủ sở hữu xin công khai, cũ nhất trước. */
export default function AdminPendingScores() {
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    scoreApi
      .pendingPublic({ page, size: PAGE_SIZE })
      .then((res) => {
        const data = res.data.result;
        // Duyệt hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc chờ duyệt'));
  }, [page, reload]);

  const review = async (score: ScoreSummary, approve: boolean) => {
    let reason: string | undefined;
    if (approve) {
      if (!window.confirm(`Duyệt công khai bản nhạc "${score.title}"? Mọi người dùng đã đăng nhập sẽ xem được.`)) return;
    } else {
      const input = window.prompt(`Lý do từ chối công khai "${score.title}" (có thể bỏ trống):`);
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBusyId(score.id);
    try {
      if (approve) await scoreApi.approvePublic(score.id);
      else await scoreApi.rejectPublic(score.id, reason);
      toast.success(approve ? 'Đã duyệt công khai' : 'Đã từ chối công khai');
    } catch (error) {
      // Ví dụ admin khác đã xử lý trước: báo lỗi rồi tải lại danh sách
      toast.error(errorMessage(error, 'Thao tác thất bại'));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  return (
    <>
      <PageHeader
        title="Chờ duyệt công khai"
        description="Bản nhạc chủ sở hữu xin công khai, cũ nhất trước. Mở bản nhạc để xem trước khi quyết định; chủ sở hữu được báo kết quả."
      />

      <Card flush>
        <Table minWidth={800}>
          <thead>
            <tr>
              <th>Bản nhạc</th>
              <th>Chủ sở hữu</th>
              <th>Gửi yêu cầu lúc</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={4} loading />}
            {result?.content.map((s) => (
              <tr key={s.id}>
                <td>
                  <CellTitle sub={s.composer || undefined}>
                    <Link to={`/admin/scores/${s.id}`} title="Mở để xem trước khi duyệt">
                      {s.title}
                    </Link>
                  </CellTitle>
                </td>
                <td className="adm-muted">{s.ownerEmail}</td>
                <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink to={`/admin/scores/${s.id}`} size="sm" variant="ghost" icon="eye" title="Xem trước" />
                    <Button size="sm" variant="primary" icon="check" disabled={busyId === s.id} onClick={() => review(s, true)}>
                      Duyệt
                    </Button>
                    <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => review(s, false)}>
                      Từ chối
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState colSpan={4} icon="check" title="Không có yêu cầu nào" description="Mọi yêu cầu công khai đã được xử lý." />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit="bản đang chờ"
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
