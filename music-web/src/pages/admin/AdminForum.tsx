import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ForumCategoriesPanel from '../../components/admin/forum/ForumCategoriesPanel';
import ForumThreadModal from '../../components/admin/forum/ForumThreadModal';
import {
  Badge,
  Button,
  Card,
  CellTitle,
  PageHeader,
  Pager,
  Table,
  TableState,
  Tabs,
  Toolbar,
} from '../../components/ui';
import { errorMessage, formatDateTime, DEFAULT_PAGE_SIZE } from '../../components/ui/helpers';
import { adminForumApi } from '../../services';
import type { AdminForumCategory, AdminForumStatus, AdminForumThread, PageResult } from '../../types';
import { t } from '../../i18n/core';
import '../../components/admin/forum/admin-forum.css';

type Section = 'threads' | 'categories';
const STATUSES: AdminForumStatus[] = ['ALL', 'REPORTED', 'VISIBLE', 'HIDDEN', 'PINNED', 'LOCKED'];

/** Admin: quản lý diễn đàn (mục 5.5) với hai tab: chủ đề (ghim, khóa, ẩn / khôi phục) và chuyên mục. */
export default function AdminForum() {
  const [params, setParams] = useSearchParams();
  const section: Section = params.get('tab') === 'categories' ? 'categories' : 'threads';
  const openId = params.get('thread');

  const setSection = (next: Section) => setParams(next === 'threads' ? {} : { tab: next });
  const openThread = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('thread', id);
    else next.delete('thread');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title={t('admin.menu.items.forum')} description={t('admin.forum.description')} />
      <Tabs
        value={section}
        onChange={setSection}
        items={[
          { value: 'threads', label: t('admin.forum.tabs.threads') },
          { value: 'categories', label: t('admin.forum.tabs.categories') },
        ]}
      />
      {section === 'threads' ? <ThreadsPanel openId={openId} onOpen={openThread} /> : <ForumCategoriesPanel />}
    </>
  );
}

function ThreadsPanel({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const [status, setStatus] = useState<AdminForumStatus>('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const changePageSize = (n: number) => {
    setPageSize(n);
    setPage(0);
  };
  const [reload, setReload] = useState(0);
  const [categories, setCategories] = useState<AdminForumCategory[]>([]);
  const [result, setResult] = useState<PageResult<AdminForumThread> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    adminForumApi
      .categories()
      .then((res) => setCategories(res.data.result))
      .catch(() => undefined);
  }, []);

  // Gõ tìm kiếm: chờ ngừng gõ rồi mới gọi API
  useEffect(() => {
    if (keywordInput.trim() === keyword) return;
    const timer = setTimeout(() => {
      setResult(null);
      setPage(0);
      setKeyword(keywordInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [keywordInput, keyword]);

  useEffect(() => {
    let cancelled = false;
    adminForumApi
      .threads({ keyword: keyword || undefined, categoryId: categoryId || undefined, status, page, size: pageSize })
      .then((res) => {
        if (cancelled) return;
        const data = res.data.result;
        if (data.content.length === 0 && page > 0) setPage(page - 1);
        else setResult(data);
      })
      .catch((err) => !cancelled && toast.error(errorMessage(err, t('admin.forum.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [keyword, categoryId, status, page, pageSize, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const closeModal = useCallback(() => onOpen(null), [onOpen]);

  const quickHide = async (th: AdminForumThread) => {
    if (busyId) return;
    setBusyId(th.id);
    try {
      await adminForumApi.setThreadHidden(th.id, !th.hidden);
      toast.success(t(th.hidden ? 'admin.forum.restored' : 'admin.forum.hidden'));
      refresh();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.actionFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setResult(null);
      setPage(0);
      set(v);
    };

  return (
    <>
      <Toolbar>
        <Tabs
          value={status}
          onChange={change(setStatus)}
          items={STATUSES.map((v) => ({ value: v, label: t(`admin.forum.status.${v}`) }))}
        />
        <select
          className="adm-input"
          aria-label={t('admin.forum.allCategories')}
          value={categoryId}
          onChange={(e) => change(setCategoryId)(e.target.value)}
        >
          <option value="">{t('admin.forum.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          className="adm-input af-search"
          placeholder={t('admin.forum.search')}
          aria-label={t('admin.forum.search')}
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
        />
      </Toolbar>

      <Card flush>
        <Table minWidth={960}>
          <thead>
            <tr>
              <th>{t('admin.forum.columns.thread')}</th>
              <th>{t('admin.forum.columns.author')}</th>
              <th>{t('admin.forum.columns.replies')}</th>
              <th>{t('admin.forum.columns.created')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={5} loading />}
            {result?.content.map((th) => (
              <tr key={th.id} className={th.hidden ? 'af-row--hidden' : undefined}>
                <td>
                  <CellTitle sub={th.categoryName}>
                    <button type="button" className="af-link" onClick={() => onOpen(th.id)}>
                      {th.title}
                    </button>
                  </CellTitle>
                  <div className="af-badges">
                    {th.pinned && <Badge tone="warning">{t('admin.forum.badges.pinned')}</Badge>}
                    {th.locked && <Badge tone="neutral">{t('admin.forum.badges.locked')}</Badge>}
                    {th.hidden && <Badge tone="danger">{t('admin.forum.badges.hidden')}</Badge>}
                    {th.answered && <Badge tone="success">{t('admin.forum.badges.answered')}</Badge>}
                    {th.pendingReports > 0 && (
                      <Badge tone="danger">{t('admin.forum.badges.reports', { count: th.pendingReports })}</Badge>
                    )}
                  </div>
                </td>
                <td className="adm-muted">{th.author.fullName || th.author.email}</td>
                <td>
                  {th.replyCount}
                  {th.hiddenReplyCount > 0 && (
                    <span className="adm-muted">
                      {' '}
                      ({t('admin.forum.hiddenReplies', { count: th.hiddenReplyCount })})
                    </span>
                  )}
                </td>
                <td className="adm-nowrap adm-muted">{formatDateTime(th.createdAt)}</td>
                <td className="adm-table__actions">
                  <Button size="sm" icon="eye" onClick={() => onOpen(th.id)}>
                    {t('admin.forum.actions.open')}
                  </Button>{' '}
                  <Button
                    size="sm"
                    variant={th.hidden ? 'secondary' : 'danger'}
                    disabled={busyId === th.id}
                    onClick={() => quickHide(th)}
                  >
                    {th.hidden ? t('admin.forum.actions.restore') : t('admin.forum.actions.hide')}
                  </Button>
                </td>
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={5}
                icon="inbox"
                title={t('admin.forum.emptyTitle')}
                description={t('admin.forum.emptyHint')}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            pageSize={pageSize}
            onPageSizeChange={changePageSize}
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.forum.unit')}
            onChange={setPage}
          />
        )}
      </Card>

      {openId && <ForumThreadModal threadId={openId} onClose={closeModal} onChanged={refresh} />}
    </>
  );
}
