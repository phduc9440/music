import { useEffect, useState } from 'react';
import { Link } from '../../routes/transition-nav';
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
import { adminApi, officialRequestApi, scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';
import { labelMap, t } from '../../i18n/core';

const PAGE_SIZE = 20;

const SOURCE_LABEL: Record<string, string> = labelMap('admin.scores.source', ['OMR', 'IMPORT', 'MANUAL']);
const DIFFICULTY_LABEL: Record<string, string> = labelMap('admin.scores.difficulty', [
  'EASY',
  'MEDIUM',
  'HARD',
  'EXPERT',
]);
const SORT_LABEL: Record<string, string> = labelMap('admin.scores.sort', ['UPDATED', 'CREATED', 'TITLE', 'VIEWS']);

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
      .catch(() => toast.error(t('admin.official.loadScoresFailed')));
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
      title: t('admin.pending.approveTitle', { title: score.title }),
      message: t('admin.scores.publishMessage'),
      confirmLabel: t('admin.scores.publish'),
    });
    if (!ok) return;
    run(
      score,
      () => adminApi.setScoreVisibility(score.id, 'PUBLIC'),
      t('admin.pending.approved'),
      t('admin.scores.publishFailed'),
    );
  };

  const unpublish = async (score: ScoreSummary) => {
    const input = await prompt({
      title: t('admin.scores.unpublishTitle', { title: score.title }),
      message: score.isOfficial ? t('admin.scores.unpublishOfficialMessage') : t('admin.scores.unpublishMessage'),
      label: t('admin.pending.rejectReason'),
      maxLength: 255,
      confirmLabel: t('admin.scores.unpublish'),
      tone: 'danger',
    });
    if (input === null) return;
    run(
      score,
      () => adminApi.setScoreVisibility(score.id, 'PRIVATE', input.trim() || undefined),
      t('admin.scores.unpublished'),
      t('admin.scores.visibilityFailed'),
    );
  };

  const toggleOfficial = async (score: ScoreSummary) => {
    if (score.isOfficial) {
      run(
        score,
        () => scoreApi.unmarkOfficial(score.id),
        t('admin.official.removed'),
        t('admin.scores.removeOfficialFailed'),
      );
      return;
    }
    const ok = await confirm({
      title: t('admin.official.askTitle', { title: score.title }),
      message: t('admin.scores.askMessage', { owner: score.ownerEmail ?? '' }),
      confirmLabel: t('admin.official.send'),
    });
    if (!ok) return;
    run(score, () => officialRequestApi.request(score.id), t('admin.official.asked'), t('admin.scores.askFailed'));
  };

  const remove = async (score: ScoreSummary) => {
    const input = await prompt({
      title: t('admin.scores.trashTitle', { title: score.title }),
      message: t('admin.scores.trashMessage', { owner: score.ownerEmail ?? '' }),
      label: t('admin.pending.rejectReason'),
      maxLength: 255,
      confirmLabel: t('admin.scores.trash'),
      tone: 'danger',
    });
    if (input === null) return;
    run(
      score,
      () => scoreApi.remove(score.id, input.trim() || undefined),
      t('admin.scores.trashed'),
      t('admin.scores.trashFailed'),
    );
  };

  const bulk = async (action: BulkAction) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (action === 'DELETE') {
      const input = await prompt({
        title: t('admin.scores.bulkTrashTitle', { count: ids.length }),
        message: t('admin.scores.bulkTrashMessage'),
        label: t('admin.pending.rejectReason'),
        maxLength: 255,
        confirmLabel: t('admin.scores.trash'),
        tone: 'danger',
      });
      if (input === null) return;
      reason = input.trim() || undefined;
    } else if (action === 'PUBLIC') {
      const ok = await confirm({
        title: t('admin.scores.bulkPublishTitle', { count: ids.length }),
        message: t('admin.scores.bulkPublishMessage'),
        confirmLabel: t('admin.scores.publish'),
      });
      if (!ok) return;
    } else {
      const input = await prompt({
        title: t('admin.scores.bulkUnpublishTitle', { count: ids.length }),
        message: t('admin.scores.bulkUnpublishMessage'),
        label: t('admin.pending.rejectReason'),
        maxLength: 255,
        confirmLabel: t('admin.scores.unpublish'),
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
        toast.success(t('admin.scores.processed', { count: success }));
      } else {
        const titleOf = (id: string) => rows.find((r) => r.id === id)?.title ?? id;
        toast.warn(
          t('admin.scores.partial', { success, failed: failures.length }) +
            failures.map((f) => `"${titleOf(f.id)}" (${f.message})`).join('; '),
          { autoClose: 10000 },
        );
      }
    } catch (error) {
      toast.error(errorMessage(error, t('admin.scores.bulkFailed')));
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
        title={t('admin.menu.items.scores')}
        description={t('admin.scores.description')}
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => changeFilter(() => setKeyword(keywordInput.trim()))}
            placeholder={t('admin.scores.searchPlaceholder')}
          />
        }
      />

      <Toolbar>
        {select(t('admin.members.privacy'), visibility, setVisibility, [
          ['', t('admin.scores.anyPrivacy')],
          ...Object.entries(VISIBILITY).map(([v, x]) => [v, x.label] as [string, string]),
        ])}
        {select(t('admin.members.curated'), official, setOfficial, [
          ['', t('admin.scores.officialAll')],
          ['true', t('admin.scores.officialIn')],
          ['false', t('admin.scores.officialOut')],
        ])}
        {select(t('admin.scores.sourceLabel'), source, setSource, [
          ['', t('admin.scores.anySource')],
          ...Object.entries(SOURCE_LABEL),
        ])}
        {select(t('scores.hero.difficulty'), difficulty, setDifficulty, [
          ['', t('admin.scores.anyDifficulty')],
          ...Object.entries(DIFFICULTY_LABEL),
        ])}
        {filtered && (
          <Button variant="ghost" icon="x" onClick={clearFilters}>
            {t('admin.scores.clearFilters')}
          </Button>
        )}
        <span className="adm-toolbar__spacer" />
        {select(
          t('admin.scores.sortLabel'),
          sort,
          setSort,
          Object.entries(SORT_LABEL).map(([v, l]) => [v, t('admin.scores.sortBy', { label: l })] as [string, string]),
        )}
      </Toolbar>

      {selected.size > 0 && (
        <div className="adm-bulkbar" role="toolbar" aria-label={t('admin.scores.bulkActions')}>
          <span className="adm-bulkbar__count">{t('admin.scores.selected', { count: selected.size })}</span>
          <Button size="sm" variant="primary" icon="globe" loading={bulkBusy} onClick={() => bulk('PUBLIC')}>
            {t('admin.scores.approvePending')}
          </Button>
          <Button size="sm" icon="lock" disabled={bulkBusy} onClick={() => bulk('PRIVATE')}>
            {t('admin.scores.unpublish')}
          </Button>
          <Button size="sm" variant="danger" icon="trash" disabled={bulkBusy} onClick={() => bulk('DELETE')}>
            {t('common.delete')}
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected(new Set())}>
            {t('admin.scores.deselect')}
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
                  aria-label={t('admin.scores.selectAll')}
                  checked={allChecked}
                  onChange={toggleAll}
                />
              </th>
              <th>{t('upload.review.tabs.score')}</th>
              <th>{t('admin.common.owner')}</th>
              <th>{t('admin.official.statusColumn')}</th>
              <th>{t('admin.members.updated')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={6} loading />}
            {rows.map((s) => (
              <tr key={s.id} className={selected.has(s.id) ? 'adm-row--selected' : undefined}>
                <td className="adm-table__check">
                  <input
                    type="checkbox"
                    aria-label={t('admin.scores.selectOne', { title: s.title })}
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
                    {s.isOfficial && <Badge tone="violet">{t('admin.members.curated')}</Badge>}
                  </span>
                </td>
                <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink
                      to={`/admin/scores/${s.id}`}
                      size="sm"
                      variant="ghost"
                      icon="eye"
                      title={t('admin.official.view')}
                    />
                    {s.visibility === 'PUBLIC' ? (
                      <>
                        <Button size="sm" icon="library" disabled={busyId === s.id} onClick={() => toggleOfficial(s)}>
                          {s.isOfficial ? t('admin.official.remove') : t('admin.official.ask')}
                        </Button>
                        <Button size="sm" icon="lock" disabled={busyId === s.id} onClick={() => unpublish(s)}>
                          {t('admin.scores.unpublish')}
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
                        {t('admin.scores.publish')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      aria-label={t('admin.scores.deleteOne', { title: s.title })}
                      title={t('common.delete')}
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
                title={t('admin.official.emptyCandidates')}
                description={filtered ? t('admin.scores.noMatch') : undefined}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.official.unitScores')}
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
