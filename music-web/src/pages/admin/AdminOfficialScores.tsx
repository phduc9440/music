import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CellTitle,
  PageHeader,
  Pager,
  SearchForm,
  Table,
  TableState,
  Tabs,
} from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { officialRequestApi, scoreApi } from '../../services';
import type { OfficialRequest, OfficialRequestStatus, PageResult, ScoreSummary } from '../../types';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { useDialog } from '../../components/ui/dialog-context';

const PAGE_SIZE = 20;

type Tab = 'library' | 'candidates' | 'requests';

const REQUEST_STATUS: Record<
  OfficialRequestStatus,
  { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'Chờ chủ trả lời', tone: 'warning' },
  ACCEPTED: { label: 'Đã đồng ý', tone: 'success' },
  DECLINED: { label: 'Bị từ chối', tone: 'danger' },
  CANCELED: { label: 'Đã rút lại', tone: 'neutral' },
};

/**
 * Admin (mục 4.5): quản lý kho score mẫu. Bản của người dùng chỉ vào kho khi chủ đồng ý: admin gửi lời xin, chủ đồng ý
 * thì hệ thống sao chép sang tài khoản hệ thống (bản gốc của chủ giữ nguyên) và ghi tên chủ là người phối.
 */
export default function AdminOfficialScores() {
  const { confirm } = useDialog();
  const [tab, setTab] = useState<Tab>('library');
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [requests, setRequests] = useState<PageResult<OfficialRequest> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setKeyword('');
    setKeywordInput('');
    setResult(null);
    setRequests(null);
  };

  useEffect(() => {
    if (tab === 'requests') {
      officialRequestApi
        .list({ page, size: PAGE_SIZE })
        .then((res) => setRequests(res.data.result))
        .catch(() => toast.error('Không tải được danh sách lời xin'));
      return;
    }
    const request =
      tab === 'library'
        ? scoreApi.official({ page, size: PAGE_SIZE, keyword: keyword || undefined })
        : scoreApi.officialCandidates({ page, size: PAGE_SIZE, keyword: keyword || undefined });
    request
      .then((res) => {
        const data = res.data.result;
        // Xử lý hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc'));
  }, [tab, page, keyword, reload]);

  const toggle = useCallback(
    async (score: ScoreSummary) => {
      const adding = tab === 'candidates';
      const ok = await confirm(
        adding
          ? {
              title: `Xin đưa "${score.title}" vào kho score mẫu?`,
              message: `${score.ownerEmail} sẽ nhận thông báo. Họ đồng ý thì hệ thống sao chép một bản vào kho, ghi tên họ là người phối; bản của họ giữ nguyên.`,
              confirmLabel: 'Gửi lời xin',
            }
          : {
              title: `Gỡ "${score.title}" khỏi kho score mẫu?`,
              message: score.isOfficial
                ? 'Bản trong kho vào thùng rác. Bản gốc của chủ sở hữu không bị ảnh hưởng.'
                : 'Bản nhạc vẫn được giữ và vẫn công khai.',
              confirmLabel: 'Gỡ khỏi kho',
            },
      );
      if (!ok) return;
      setBusyId(score.id);
      try {
        if (adding) await officialRequestApi.request(score.id);
        else await scoreApi.unmarkOfficial(score.id);
        toast.success(adding ? 'Đã gửi lời xin tới chủ sở hữu' : 'Đã gỡ khỏi kho score mẫu');
      } catch (error) {
        toast.error(errorMessage(error, 'Thao tác thất bại'));
      } finally {
        setBusyId(null);
        setReload((n) => n + 1);
      }
    },
    [tab, confirm],
  );

  const cancelRequest = useCallback(
    async (request: OfficialRequest) => {
      const ok = await confirm({
        title: `Rút lại lời xin "${request.scoreTitle}"?`,
        message: 'Chủ sở hữu sẽ không còn thấy lời xin này.',
        confirmLabel: 'Rút lại',
      });
      if (!ok) return;
      setBusyId(request.id);
      try {
        await officialRequestApi.cancel(request.id);
        toast.success('Đã rút lại lời xin');
      } catch (error) {
        toast.error(errorMessage(error, 'Không rút lại được lời xin'));
      } finally {
        setBusyId(null);
        setReload((n) => n + 1);
      }
    },
    [confirm],
  );

  const colSpan = tab === 'candidates' ? 4 : 3;

  return (
    <>
      <PageHeader
        title="Kho score mẫu"
        description="Bản nhạc chọn lọc cho người mới học. Người dùng xem ở mục “Kho score mẫu” trong thư viện."
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => {
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
            placeholder="Tìm theo tên hoặc tác giả"
          />
        }
      />

      <Tabs
        value={tab}
        onChange={switchTab}
        items={[
          { value: 'library', label: 'Trong kho' },
          { value: 'candidates', label: 'Xin đưa vào kho' },
          { value: 'requests', label: 'Lời xin đã gửi' },
        ]}
      />

      {tab === 'requests' ? (
        <Card flush>
          <Table minWidth={720}>
            <thead>
              <tr>
                <th>Bản nhạc</th>
                <th>Chủ sở hữu</th>
                <th>Trạng thái</th>
                <th>Ngày gửi</th>
                <th className="adm-table__actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!requests && <TableState colSpan={5} loading />}
              {requests?.content.map((r) => (
                <tr key={r.id}>
                  <td>
                    <CellTitle sub={r.composer || undefined}>
                      <Link to={`/admin/scores/${r.scoreId}`}>{r.scoreTitle}</Link>
                    </CellTitle>
                  </td>
                  <td className="adm-muted">{r.ownerEmail}</td>
                  <td>
                    <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                  </td>
                  <td className="adm-nowrap adm-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="adm-table__actions">
                    <div className="adm-table__actions-inner">
                      {r.status === 'PENDING' && (
                        <Button size="sm" icon="x" disabled={busyId === r.id} onClick={() => cancelRequest(r)}>
                          Rút lại
                        </Button>
                      )}
                      {r.status === 'ACCEPTED' && r.copyScoreId && (
                        <ButtonLink to={`/admin/scores/${r.copyScoreId}`} size="sm" variant="ghost" icon="eye">
                          Xem bản trong kho
                        </ButtonLink>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {requests && requests.content.length === 0 && (
                <TableState
                  colSpan={5}
                  icon="library"
                  title="Chưa có lời xin nào"
                  description="Sang tab “Xin đưa vào kho” để chọn bản nhạc công khai và gửi lời xin tới chủ sở hữu."
                />
              )}
            </tbody>
          </Table>
          {requests && (
            <Pager
              page={requests.pageNumber}
              totalPages={requests.totalPages}
              totalElements={requests.totalElements}
              unit="lời xin"
              onChange={setPage}
            />
          )}
        </Card>
      ) : (
        <Card flush>
          <Table minWidth={720}>
            <thead>
              <tr>
                <th>Bản nhạc</th>
                <th>Độ khó</th>
                {tab === 'candidates' && <th>Chủ sở hữu</th>}
                <th className="adm-table__actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {!result && <TableState colSpan={colSpan} loading />}
              {result?.content.map((s) => (
                <tr key={s.id}>
                  <td>
                    <CellTitle sub={s.composer || undefined}>
                      <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                    </CellTitle>
                  </td>
                  <td>
                    {s.difficulty ? (
                      <Badge>{DIFFICULTY_LABELS[s.difficulty]}</Badge>
                    ) : (
                      <span className="adm-subtle">—</span>
                    )}
                  </td>
                  {tab === 'candidates' && <td className="adm-muted">{s.ownerEmail}</td>}
                  <td className="adm-table__actions">
                    <div className="adm-table__actions-inner">
                      <ButtonLink to={`/admin/scores/${s.id}`} size="sm" variant="ghost" icon="eye" title="Xem" />
                      {tab === 'library' ? (
                        <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => toggle(s)}>
                          Gỡ khỏi kho
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          icon="plus"
                          disabled={busyId === s.id}
                          onClick={() => toggle(s)}
                        >
                          Xin đưa vào kho
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {result && result.content.length === 0 && (
                <TableState
                  colSpan={colSpan}
                  icon="library"
                  title={tab === 'library' ? 'Kho chưa có bản nhạc nào' : 'Không có bản nhạc nào để thêm'}
                  description={
                    tab === 'library'
                      ? 'Chuyển sang tab “Xin đưa vào kho” để chọn từ các bản đã công khai.'
                      : 'Chỉ bản đã công khai, chưa có lời xin và chưa nằm trong kho mới hiện ở đây.'
                  }
                />
              )}
            </tbody>
          </Table>
          {result && (
            <Pager
              page={result.pageNumber}
              totalPages={result.totalPages}
              totalElements={result.totalElements}
              unit="bản nhạc"
              onChange={setPage}
            />
          )}
        </Card>
      )}
    </>
  );
}
