import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Button, ButtonLink, Card, CellTitle, PageHeader, Pager, Table, TableState } from '../../components/ui';
import { errorMessage, formatDateTime } from '../../components/ui/helpers';
import { scoreApi } from '../../services';
import type { PageResult, ScoreSummary } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';
import { t } from '../../i18n/core';

const PAGE_SIZE = 20;

/** Admin (mục 4.4): duyệt hoặc từ chối các bản nhạc chủ sở hữu xin công khai, cũ nhất trước. */
export default function AdminPendingScores() {
  const { confirm, prompt } = useDialog();
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
      .catch(() => toast.error(t('admin.pending.loadFailed')));
  }, [page, reload]);

  const review = async (score: ScoreSummary, approve: boolean) => {
    let reason: string | undefined;
    if (approve) {
      const ok = await confirm({
        title: t('admin.pending.approveTitle', { title: score.title }),
        message: t('admin.pending.approveMessage'),
        confirmLabel: t('admin.pending.approve'),
      });
      if (!ok) return;
    } else {
      const input = await prompt({
        title: t('admin.pending.rejectTitle', { title: score.title }),
        message: t('admin.pending.rejectMessage'),
        label: t('admin.pending.rejectReason'),
        maxLength: 255,
        confirmLabel: t('admin.pending.reject'),
        tone: 'danger',
      });
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setBusyId(score.id);
    try {
      if (approve) await scoreApi.approvePublic(score.id);
      else await scoreApi.rejectPublic(score.id, reason);
      toast.success(approve ? t('admin.pending.approved') : t('admin.pending.rejected'));
    } catch (error) {
      // Ví dụ admin khác đã xử lý trước: báo lỗi rồi tải lại danh sách
      toast.error(errorMessage(error, t('scores.share.failed')));
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  };

  return (
    <>
      <PageHeader title={t('admin.menu.items.pending')} description={t('admin.pending.description')} />

      <Card flush>
        <Table minWidth={800}>
          <thead>
            <tr>
              <th>{t('upload.review.tabs.score')}</th>
              <th>{t('admin.common.owner')}</th>
              <th>{t('admin.pending.sentAt')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!result && <TableState colSpan={4} loading />}
            {result?.content.map((s) => (
              <tr key={s.id}>
                <td>
                  <CellTitle sub={s.composer || undefined}>
                    <Link to={`/admin/scores/${s.id}`} title={t('admin.pending.openToReview')}>
                      {s.title}
                    </Link>
                  </CellTitle>
                </td>
                <td className="adm-muted">{s.ownerEmail}</td>
                <td className="adm-nowrap adm-muted">{formatDateTime(s.updatedAt)}</td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    <ButtonLink
                      to={`/admin/scores/${s.id}`}
                      size="sm"
                      variant="ghost"
                      icon="eye"
                      title={t('admin.pending.preview')}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      icon="check"
                      disabled={busyId === s.id}
                      onClick={() => review(s, true)}
                    >
                      {t('admin.pending.approve')}
                    </Button>
                    <Button size="sm" icon="x" disabled={busyId === s.id} onClick={() => review(s, false)}>
                      {t('admin.pending.reject')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {result && result.content.length === 0 && (
              <TableState
                colSpan={4}
                icon="check"
                title={t('admin.pending.emptyTitle')}
                description={t('admin.pending.emptyHint')}
              />
            )}
          </tbody>
        </Table>
        {result && (
          <Pager
            page={result.pageNumber}
            totalPages={result.totalPages}
            totalElements={result.totalElements}
            unit={t('admin.pending.unit')}
            onChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
