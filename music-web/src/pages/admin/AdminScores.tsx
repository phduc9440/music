import { useEffect, useState } from 'react';
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
  Toolbar,
  VisibilityBadge,
} from '../../components/ui';
import { VISIBILITY, errorMessage, formatDateTime } from '../../components/ui/helpers';
import { adminApi, scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';

const PAGE_SIZE = 20;

const SOURCE_LABEL: Record<string, string> = { OMR: 'Số hóa (OMR)', IMPORT: 'Nhập file', MANUAL: 'Tạo trong editor' };
const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  EXPERT: 'Chuyên gia',
};
const SORT_LABEL: Record<string, string> = {
  UPDATED: 'Mới cập nhật',
  CREATED: 'Mới tạo',
  TITLE: 'Tên A-Z',
  VIEWS: 'Nhiều lượt xem',
};

type BulkAction = 'PUBLIC' | 'PRIVATE' | 'DELETE';

/** Admin: xem mọi bản nhạc của mọi người dùng, tìm kiếm, lọc, sắp xếp; thao tác từng bản hoặc hàng loạt. */
export default function AdminScores() {
  const { confirm, prompt } = useDialog();
  const [result, setResult] = useState<PageResult<ScoreSummary> | null>(null);
  const [page, setPage] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [visibility, setVisibility] = useState('');
  const [official, setOfficial] = useState('');
  const [source, setSource] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('UPDATED');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .getScores({
        page,
        size: PAGE_SIZE,
        keyword: keyword || undefined,
        visibility: visibility || undefined,
        official: official || undefined,
        source: source || undefined,
        difficulty: difficulty || undefined,
        sort,
      })
      .then((res) => {
        const data = res.data.result;
        // Xóa hết bản cuối của một trang thì lùi về trang trước
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else {
          setResult(data);
          // Bản vừa bị xóa/đổi khỏi trang thì bỏ khỏi danh sách đã chọn
          const ids = new Set(data.content.map((r) => r.id));
          setSelected((prev) => (prev.size === 0 ? prev : new Set([...prev].filter((id) => ids.has(id)))));
        }
      })
      .catch(() => toast.error('Không tải được danh sách bản nhạc'));
  }, [page, keyword, visibility, official, source, difficulty, sort, reload]);

  // Đổi bộ lọc, trang hoặc dữ liệu thì bỏ chọn để không thao tác nhầm lên bản đã không còn hiển thị
  const changeFilter = (apply: () => void) => {
    apply();
    setPage(0);
    setSelected(new Set());
  };

  const filtered = !!(keyword || visibility || official || source || difficulty);
  const clearFilters = () =>
    changeFilter(() => {
      setKeyword('');
      setKeywordInput('');
      setVisibility('');
      setOfficial('');
      setSource('');
      setDifficulty('');
    });

  const rows = result?.content ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (score: ScoreSummary, action: () => Promise<unknown>, okMsg: string, failMsg: string) => {
    setBusyId(score.id);
    try {
      await action();
      toast.success(okMsg);
    } catch (error) {
      toast.error(errorMessage(error, failMsg));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  const publish = async (score: ScoreSummary) => {
    const ok = await confirm({
      title: `Duyệt công khai "${score.title}"?`,
      message: 'Chủ sở hữu đã xin công khai bản này. Sau khi duyệt, mọi người dùng đã đăng nhập sẽ xem được.',
      confirmLabel: 'Duyệt công khai',
    });
    if (!ok) return;
    run(score, () => adminApi.setScoreVisibility(score.id, 'PUBLIC'), 'Đã duyệt công khai', 'Không duyệt được bản nhạc');
  };

  const unpublish = async (score: ScoreSummary) => {
    const input = await prompt({
      title: `Gỡ công khai "${score.title}"?`,
      message: `Bản nhạc về riêng tư${score.isOfficial ? ' và rời kho score mẫu' : ''}. Chủ sở hữu sẽ nhận thông báo kèm lý do.`,
      label: 'Lý do (có thể bỏ trống)',
      maxLength: 255,
      confirmLabel: 'Gỡ công khai',
      tone: 'danger',
    });
    if (input === null) return;
    run(
      score,
      () => adminApi.setScoreVisibility(score.id, 'PRIVATE', input.trim() || undefined),
      'Đã gỡ công khai',
      'Không đổi được quyền riêng tư',
    );
  };

  const toggleOfficial = (score: ScoreSummary) =>
    score.isOfficial
      ? run(score, () => scoreApi.unmarkOfficial(score.id), 'Đã gỡ khỏi kho score mẫu', 'Không gỡ được khỏi kho')
      : run(score, () => scoreApi.markOfficial(score.id), 'Đã thêm vào kho score mẫu', 'Không thêm được vào kho');

  const remove = async (score: ScoreSummary) => {
    const input = await prompt({
      title: `Chuyển "${score.title}" vào thùng rác?`,
      message: `Bản nhạc của ${score.ownerEmail} nằm trong thùng rác 30 ngày, chủ sở hữu có thể khôi phục và sẽ nhận thông báo kèm lý do.`,
      label: 'Lý do (có thể bỏ trống)',
      maxLength: 255,
      confirmLabel: 'Chuyển vào thùng rác',
      tone: 'danger',
    });
    if (input === null) return;
    run(
      score,
      () => scoreApi.remove(score.id, input.trim() || undefined),
      'Đã chuyển vào thùng rác',
      'Không xóa được bản nhạc',
    );
  };

  const bulk = async (action: BulkAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (action === 'DELETE') {
      const input = await prompt({
        title: `Chuyển ${ids.length} bản nhạc đã chọn vào thùng rác?`,
        message: 'Các bản nằm trong thùng rác 30 ngày, chủ sở hữu có thể khôi phục và sẽ nhận thông báo kèm lý do.',
        label: 'Lý do (có thể bỏ trống)',
        maxLength: 255,
        confirmLabel: 'Chuyển vào thùng rác',
        tone: 'danger',
      });
      if (input === null) return;
      reason = input.trim() || undefined;
    } else if (action === 'PUBLIC') {
      const ok = await confirm({
        title: `Duyệt công khai ${ids.length} bản nhạc đã chọn?`,
        message: 'Chỉ duyệt được các bản đang chờ duyệt. Bản ở trạng thái khác sẽ báo lỗi trong danh sách.',
        confirmLabel: 'Duyệt công khai',
      });
      if (!ok) return;
    } else {
      const input = await prompt({
        title: `Gỡ công khai ${ids.length} bản nhạc đã chọn?`,
        message: 'Các bản về riêng tư, bản trong kho mẫu sẽ rời kho. Chủ sở hữu sẽ nhận thông báo.',
        label: 'Lý do (có thể bỏ trống)',
        maxLength: 255,
        confirmLabel: 'Gỡ công khai',
        tone: 'danger',
      });
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBulkBusy(true);
    try {
      const res = await adminApi.bulkScores(ids, action, reason);
      const { success, failures } = res.data.result;
      if (failures.length === 0) {
        toast.success(`Đã xử lý ${success} bản nhạc`);
      } else {
        const titleOf = (id: string) => rows.find((r) => r.id === id)?.title ?? id;
        toast.warn(
          `Thành công ${success}, lỗi ${failures.length}: ` +
            failures.map((f) => `"${titleOf(f.id)}" (${f.message})`).join('; '),
          { autoClose: 10000 },
        );
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Thao tác hàng loạt thất bại'));
    } finally {
      setBulkBusy(false);
      setSelected(new Set());
      setReload((n) => n + 1);
    }
  };

  const select = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select
      className="adm-input"
      aria-label={label}
      value={value}
      onChange={(e) => changeFilter(() => onChange(e.target.value))}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader
        title="Quản lý bản nhạc"
        description="Mọi bản nhạc của mọi người dùng. Chọn nhiều bản để công khai, gỡ công khai hoặc xóa cùng lúc."
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => changeFilter(() => setKeyword(keywordInput.trim()))}
            placeholder="Tên, tác giả hoặc email chủ sở hữu"
          />
        }
      />

      <Toolbar>
        {select('Quyền riêng tư', visibility, setVisibility, [
          ['', 'Mọi quyền riêng tư'],
          ...Object.entries(VISIBILITY).map(([v, x]) => [v, x.label] as [string, string]),
        ])}
        {select('Kho mẫu', official, setOfficial, [
          ['', 'Kho mẫu: tất cả'],
          ['true', 'Trong kho mẫu'],
          ['false', 'Ngoài kho mẫu'],
        ])}
        {select('Nguồn', source, setSource, [['', 'Mọi nguồn'], ...Object.entries(SOURCE_LABEL)])}
        {select('Độ khó', difficulty, setDifficulty, [['', 'Mọi độ khó'], ...Object.entries(DIFFICULTY_LABEL)])}
        {filtered && (
          <Button variant="ghost" icon="x" onClick={clearFilters}>
            Xóa bộ lọc
          </Button>
        )}
        <span className="adm-toolbar__spacer" />
        {select(
          'Sắp xếp',
          sort,
          setSort,
          Object.entries(SORT_LABEL).map(([v, l]) => [v, `Sắp xếp: ${l}`] as [string, string]),
        )}
      </Toolbar>

      {selected.size > 0 && (
        <div className="adm-bulkbar" role="toolbar" aria-label="Thao tác hàng loạt">
          <span className="adm-bulkbar__count">Đã chọn {selected.size} bản</span>
          <Button size="sm" variant="primary" icon="globe" loading={bulkBusy} onClick={() => bulk('PUBLIC')}>
            Duyệt các bản đang chờ
          </Button>
          <Button size="sm" icon="lock" disabled={bulkBusy} onClick={() => bulk('PRIVATE')}>
            Gỡ công khai
          </Button>
          <Button size="sm" variant="danger" icon="trash" disabled={bulkBusy} onClick={() => bulk('DELETE')}>
            Xóa
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      <Card flush>
        <Table minWidth={1000}>
          <thead>
            <tr>
              <th className="adm-table__check">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả bản trên trang"
                  checked={allChecked}
                  onChange={toggleAll}
                />
              </th>
              <th>Bản nhạc</th>
              <th>Chủ sở hữu</th>
              <th>Trạng thái</th>
              <th>Cập nhật</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={6} loading />}
            {rows.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? 'adm-row--selected' : undefined}>
                <td className="adm-table__check">
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${s.title}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                  />
                </td>
                <td>
                  <CellTitle sub={s.composer || undefined}>
                    <Link to={`/admin/scores/${s.id}`}>{s.title}</Link>
                  </CellTitle>
                </td>
                <td className="adm-muted">{s.ownerEmail}</td>
                <td>
                  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <VisibilityBadge value={s.visibility} />
                    {s.isOfficial && <Badge tone="violet">Kho mẫu</Badge>}
                  </span>
                </td>
                <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink to={`/admin/scores/${s.id}`} size="sm" variant="ghost" icon="eye" title="Xem" />
                    {s.visibility === 'PUBLIC' ? (
                      <>
                        <Button size="sm" icon="library" disabled={busyId === s.id} onClick={() => toggleOfficial(s)}>
                          {s.isOfficial ? 'Gỡ khỏi kho' : 'Thêm vào kho'}
                        </Button>
                        <Button size="sm" icon="lock" disabled={busyId === s.id} onClick={() => unpublish(s)}>
                          Gỡ công khai
                        </Button>
                      </>
                    ) : s.visibility === 'PENDING' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        icon="globe"
                        disabled={busyId === s.id}
                        onClick={() => publish(s)}
                      >
                        Duyệt công khai
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={`Xóa ${s.title}`}
                      title="Xóa"
                      disabled={busyId === s.id}
                      onClick={() => remove(s)}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {result && rows.length === 0 && (
              <TableState
                colSpan={6}
                icon="music"
                title="Không có bản nhạc nào"
                description={filtered ? 'Không có bản nào khớp bộ lọc. Thử bỏ bớt điều kiện.' : undefined}
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
            onChange={(p) => {
              setSelected(new Set());
              setPage(p);
            }}
          />
        )}
      </Card>
    </>
  );
}
