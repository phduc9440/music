import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Markdown from '../../forum/Markdown';
import Modal from '../../scores/common/Modal';
import { Badge, Button } from '../../ui';
import { errorMessage, formatDateTime } from '../../ui/helpers';
import { adminForumApi } from '../../../services';
import type { AdminForumPerson, AdminForumThreadDetail } from '../../../types';
import { t } from '../../../i18n/core';

const who = (p: AdminForumPerson | null) => (p ? p.fullName || p.email : '—');

/**
 * Chi tiết một chủ đề cho admin: nội dung, mọi bài trả lời (kể cả bài đã ẩn), và các việc ghim / khóa / ẩn. Mọi thao tác
 * nạp lại chi tiết và báo cho trang danh sách làm mới.
 */
export default function ForumThreadModal({
  threadId,
  onClose,
  onChanged,
}: {
  threadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminForumThreadDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail((await adminForumApi.thread(threadId)).data.result);
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.loadFailed')));
      onClose();
    }
  }, [threadId, onClose]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.actionFailed')));
    } finally {
      setBusy(false);
    }
  };

  const th = detail?.thread;
  return (
    <Modal title={th?.title ?? t('admin.forum.loading')} onClose={onClose} className="af-modal">
      {!detail || !th ? (
        <p className="adm-muted">{t('admin.forum.loading')}</p>
      ) : (
        <div className="af-detail">
          <div className="af-detail__meta">
            <Badge tone="primary">{th.categoryName}</Badge>
            {th.pinned && <Badge tone="warning">{t('admin.forum.badges.pinned')}</Badge>}
            {th.locked && <Badge tone="neutral">{t('admin.forum.badges.locked')}</Badge>}
            {th.hidden && <Badge tone="danger">{t('admin.forum.badges.hidden')}</Badge>}
            {th.answered && <Badge tone="success">{t('admin.forum.badges.answered')}</Badge>}
            {th.pendingReports > 0 && (
              <Badge tone="danger">{t('admin.forum.badges.reports', { count: th.pendingReports })}</Badge>
            )}
            <span className="adm-muted">
              {who(th.author)} · {formatDateTime(th.createdAt)}
            </span>
          </div>
          {th.hidden && th.hiddenBy && (
            <p className="adm-muted">{t('admin.forum.hiddenBy', { name: who(th.hiddenBy) })}</p>
          )}

          <div className="af-actions">
            <Button
              size="sm"
              icon="star"
              disabled={busy}
              onClick={() => act(() => adminForumApi.setThreadPinned(th.id, !th.pinned))}
            >
              {th.pinned ? t('admin.forum.actions.unpin') : t('admin.forum.actions.pin')}
            </Button>
            <Button
              size="sm"
              icon={th.locked ? 'unlock' : 'lock'}
              disabled={busy}
              onClick={() => act(() => adminForumApi.setThreadLocked(th.id, !th.locked))}
            >
              {th.locked ? t('admin.forum.actions.unlock') : t('admin.forum.actions.lock')}
            </Button>
            <Button
              size="sm"
              variant={th.hidden ? 'secondary' : 'danger'}
              icon={th.hidden ? 'eye' : 'x'}
              disabled={busy}
              onClick={() => act(() => adminForumApi.setThreadHidden(th.id, !th.hidden))}
            >
              {th.hidden ? t('admin.forum.actions.restore') : t('admin.forum.actions.hide')}
            </Button>
          </div>

          <div className={`af-body${th.hidden ? ' is-hidden' : ''}`}>
            <Markdown source={th.body ?? ''} />
          </div>

          <h3 className="af-section">
            {t('admin.forum.replies', { count: detail.posts.length })}
            {th.hiddenReplyCount > 0 && (
              <span className="adm-muted"> · {t('admin.forum.hiddenReplies', { count: th.hiddenReplyCount })}</span>
            )}
          </h3>
          {detail.posts.length === 0 && <p className="adm-muted">{t('admin.forum.noReplies')}</p>}
          <ol className="af-posts">
            {detail.posts.map((p) => (
              <li key={p.id} className={`af-post${p.hidden ? ' is-hidden' : ''}`}>
                <div className="af-post__head">
                  <strong>{who(p.author)}</strong>
                  <span className="adm-muted">{formatDateTime(p.createdAt)}</span>
                  {p.accepted && <Badge tone="success">{t('admin.forum.badges.bestAnswer')}</Badge>}
                  {p.hidden && <Badge tone="danger">{t('admin.forum.badges.hidden')}</Badge>}
                  {p.pendingReports > 0 && (
                    <Badge tone="danger">{t('admin.forum.badges.reports', { count: p.pendingReports })}</Badge>
                  )}
                  <span className="af-post__action">
                    <Button
                      size="sm"
                      variant={p.hidden ? 'secondary' : 'ghost'}
                      disabled={busy}
                      onClick={() => act(() => adminForumApi.setPostHidden(p.id, !p.hidden))}
                    >
                      {p.hidden ? t('admin.forum.actions.restore') : t('admin.forum.actions.hide')}
                    </Button>
                  </span>
                </div>
                <Markdown source={p.body} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
