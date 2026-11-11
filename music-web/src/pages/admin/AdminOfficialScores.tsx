import { useCallback, useEffect, useState } from 'react';
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
  Tabs,
} from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { officialRequestApi, scoreApi } from '../../services';
import type { OfficialRequest, OfficialRequestStatus, PageResult, ScoreSummary } from '../../types';
import { DIFFICULTY_LABELS } from '../../utils/score';
import { useDialog } from '../../components/ui/dialog-context';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;

type Tab = 'library' | 'candidates' | 'requests';

const REQUEST_STATUS: Record<
  OfficialRequestStatus,
  { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: {
    get label() {
      return t('admin.official.status.PENDING');
    },
    tone: 'warning',
  },
  ACCEPTED: {
    get label() {
      return t('admin.official.status.ACCEPTED');
    },
    tone: 'success',
  },
  DECLINED: {
    get label() {
      return t('admin.official.status.DECLINED');
    },
    tone: 'danger',
  },
  CANCELED: {
    get label() {
      return t('admin.official.status.CANCELED');
    },
    tone: 'neutral',
  },
};

/**
 * Admin (mục 4.5): quản lý kho bản nhạc mẫu. Bản của người dùng chỉ vào kho khi chủ đồng ý: admin gửi lời xin, chủ đồng ý
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
        .catch(() => toast.error(t('admin.official.loadRequestsFailed')));
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
      .catch(() => toast.error(t('admin.official.loadScoresFailed')));
  }, [tab, page, keyword, reload]);

  const toggle = useCallback(
    async (score: ScoreSummary) => {
      const adding = tab === 'candidates';
      const ok = await confirm(
        adding
          ? {
              title: t('admin.official.askTitle', { title: score.title }),
              message: t('admin.official.askMessage', { owner: score.ownerEmail ?? '' }),
              confirmLabel: t('admin.official.send'),
            }
          : {
              title: t('admin.official.removeTitle', { title: score.title }),
              message: score.isOfficial ? t('admin.official.removeCopyMessage') : t('admin.official.removeFlagMessage'),
              confirmLabel: t('admin.official.remove'),
            },
      );
      if (!ok) return;
      setBusyId(score.id);
      try {
        if (adding) await officialRequestApi.request(score.id);
        else await scoreApi.unmarkOfficial(score.id);
        toast.success(adding ? t('admin.official.asked') : t('admin.official.removed'));
      } catch (error) {
        toast.error(errorMessage(error, t('scores.share.failed')));
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
        title: t('admin.official.withdrawTitle', { title: request.scoreTitle }),
        message: t('admin.official.withdrawMessage'),
        confirmLabel: t('admin.official.withdraw'),
      });
      if (!ok) return;
      setBusyId(request.id);
      try {
        await officialRequestApi.cancel(request.id);
        toast.success(t('admin.official.withdrawn'));
      } catch (error) {
        toast.error(errorMessage(error, t('admin.official.withdrawFailed')));
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
        title={t('common.nav.items.officialLibrary')}
        description={t('admin.official.description')}
        actions={
          <SearchForm
            value={keywordInput}
            onChange={setKeywordInput}
            onSubmit={() => {
              setPage(0);
              setKeyword(keywordInput.trim());
            }}
            placeholder={t('scores.explore.searchPlaceholder')}
          />
        }
      />

      <Tabs
        value={tab}
        onChange={switchTab}
        items={[
          { value: 'library', label: t('admin.official.tabLibrary') },
          { value: 'candidates', label: t('admin.official.ask') },
          { value: 'requests', label: t('admin.official.tabRequests') },
        ]}
      />

      {tab === 'requests' ? (
        <Card flush>
          <Table minWidth={720}>
            <thead>
              <tr>
                <th>{t('upload.review.tabs.score')}</th>
                <th>{t('admin.common.owner')}</th>
                <th>{t('admin.official.statusColumn')}</th>
                <th>{t('admin.official.sentDate')}</th>
                <th className="adm-table__actions">{t('scores.files.actions')}</th>
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
                          {t('admin.official.withdraw')}
                        </Button>
                      )}
                      {r.status === 'ACCEPTED' && r.copyScoreId && (
                        <ButtonLink to={`/admin/scores/${r.copyScoreId}`} size="sm" variant="ghost" icon="eye">
                          {t('admin.official.viewCopy')}
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
                  title={t('admin.official.noRequestsTitle')}
                  description={t('admin.official.noRequestsHint')}
                />
              )}
            </tbody>
          </Table>
          {requests && (
            <Pager
              page={requests.pageNumber}
              totalPages={requests.totalPages}
              totalElements={requests.totalElements}
              unit={t('admin.official.unitRequests')}
              onChange={setPage}
            />
          )}
        </Card>
      ) : (
        <Card flush>
          <Table minWidth={720}>
            <thead>
              <tr>
                <th>{t('upload.review.tabs.score')}</th>
                <th>{t('scores.hero.difficulty')}</th>
                {tab === 'candidates' && <th>{t('admin.common.owner')}</th>}
                <th className="adm-table__actions">{t('scores.files.actions')}</th>
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
                      <ButtonLink
                        to={`/admin/scores/${s.id}`}
                        size="sm"
                        variant="ghost"
                        icon="eye"
                        title={t('admin.official.view')}
                      />
                      {tab === 'library' ? (
                        <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => toggle(s)}>
                          {t('admin.official.remove')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          icon="plus"
                          disabled={busyId === s.id}
                          onClick={() => toggle(s)}
                        >
                          {t('admin.official.ask')}
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
                  title={tab === 'library' ? t('admin.official.emptyLibrary') : t('admin.official.emptyCandidates')}
                  description={
                    tab === 'library' ? t('admin.official.emptyLibraryHint') : t('admin.official.emptyCandidatesHint')
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
              unit={t('admin.official.unitScores')}
              onChange={setPage}
            />
          )}
        </Card>
      )}
    </>
  );
}
