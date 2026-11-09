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
import { errorMessage } from '../../components/ui/helpers';
import { scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';
import { DIFFICULTY_LABELS } from '../../utils/score';

const PAGE_SIZE = 20;

type Tab = 'library' | 'candidates';

/** Admin (mục 4.5): quản lý kho score mẫu, gồm xem kho, gỡ bản khỏi kho và thêm bản nhạc công khai vào kho. */
export default function AdminOfficialScores() {
  const [tab, setTab] = useState<Tab>('library');
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(0);
    setKeyword('');
    setKeywordInput('');
    setResult(null);
  };

  useEffect(() => {
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
      const message = adding
        ? `Thêm "${score.title}" vào kho score mẫu? Sau đó chỉ ADMIN được sửa hoặc xóa bản nhạc này.`
        : `Gỡ "${score.title}" khỏi kho score mẫu? Bản nhạc vẫn được giữ và vẫn công khai.`;
      if (!window.confirm(message)) return;
      setBusyId(score.id);
      try {
        if (adding) await scoreApi.markOfficial(score.id);
        else await scoreApi.unmarkOfficial(score.id);
        toast.success(adding ? 'Đã thêm vào kho score mẫu' : 'Đã gỡ khỏi kho score mẫu');
      } catch (error) {
        toast.error(errorMessage(error, 'Thao tác thất bại'));
      } finally {
        setBusyId(null);
        setReload((n) => n + 1);
      }
    },
    [tab],
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
          { value: 'candidates', label: 'Thêm vào kho' },
        ]}
      />

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
                <td>{s.difficulty ? <Badge>{DIFFICULTY_LABELS[s.difficulty]}</Badge> : <span className="adm-subtle">—</span>}</td>
                {tab === 'candidates' && <td className="adm-muted">{s.ownerEmail}</td>}
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink to={`/admin/scores/${s.id}`} size="sm" variant="ghost" icon="eye" title="Xem" />
                    {tab === 'library' ? (
                      <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => toggle(s)}>
                        Gỡ khỏi kho
                      </Button>
                    ) : (
                      <Button size="sm" variant="primary" icon="plus" disabled={busyId === s.id} onClick={() => toggle(s)}>
                        Thêm vào kho
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
                    ? 'Chuyển sang tab “Thêm vào kho” để chọn từ các bản đã công khai.'
                    : 'Chỉ bản đã công khai mới thêm được vào kho.'
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
    </>
  );
}
