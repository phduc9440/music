import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { sharingApi } from '../../../services';
import { SHARE_PERMISSION_LABELS, getErrorMessage } from '../../../utils/score';
import type { AccessRequest, SharePermission } from '../../../types';
import { t } from '../../../i18n/core';

const LEVELS: SharePermission[] = [1, 2, 3];

/**
 * Chủ bản nhạc thấy ngay trên trang chi tiết ai đang xin quyền (xem, nhận xét hay chỉnh sửa) và đồng ý / từ chối tại
 * chỗ, không cần mở hộp thoại Chia sẻ. Có thể cấp cấp khác với cấp được xin. Không có yêu cầu nào thì không hiện gì.
 */
export default function AccessRequestsPanel({
  scoreId,
  showEmpty = false,
  onChanged,
}: {
  scoreId: string;
  /** Không có yêu cầu nào thì hiện dòng thông báo thay vì ẩn cả khối. */
  showEmpty?: boolean;
  /** Gọi sau khi đồng ý / từ chối để trang cha cập nhật số chờ. */
  onChanged?: () => void;
}) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [grant, setGrant] = useState<Record<string, SharePermission>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    sharingApi
      .accessRequests(scoreId)
      .then((res) => setRequests(res.data.result))
      .catch(() => setRequests([]));
  }, [scoreId]);

  useEffect(load, [load]);

  const act = async (memberId: string, run: () => Promise<unknown>, okMsg: string) => {
    setBusy(memberId);
    try {
      await run();
      toast.success(okMsg);
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.share.failed')));
    } finally {
      setBusy(null);
      load();
      onChanged?.();
    }
  };

  if (requests.length === 0) {
    return showEmpty ? (
      <section className="sc-access sc-access--empty">
        <h2>{t('scores.share.requests', { count: 0 })}</h2>
        <p>{t('scores.settings.noRequests')}</p>
      </section>
    ) : null;
  }

  return (
    <section className="sc-access" aria-label={t('scores.share.requests', { count: requests.length })}>
      <div className="sc-access__head">
        <h2>{t('scores.share.requests', { count: requests.length })}</h2>
        <p>{t('scores.share.requestsHint')}</p>
      </div>
      <ul className="sc-access__list">
        {requests.map((r) => {
          const level = grant[r.memberId] ?? r.requestedPermission;
          return (
            <li key={r.memberId} className="sc-access__item">
              <div className="sc-access__who">
                <strong title={r.email}>{r.fullName || r.email}</strong>
                <span className={`sc-access__level sc-access__level--${r.requestedPermission}`}>
                  {t('scores.share.requestsLevel', { level: SHARE_PERMISSION_LABELS[r.requestedPermission] })}
                </span>
                {r.message && <q className="sc-access__msg">{r.message}</q>}
              </div>
              <div className="sc-access__actions">
                <select
                  className="sc-input"
                  aria-label={t('scores.share.grantTo', { email: r.email })}
                  value={level}
                  disabled={busy === r.memberId}
                  onChange={(e) => setGrant({ ...grant, [r.memberId]: Number(e.target.value) as SharePermission })}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {SHARE_PERMISSION_LABELS[l]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sc-btn sc-btn--primary sc-btn--sm"
                  disabled={busy === r.memberId}
                  onClick={() =>
                    act(
                      r.memberId,
                      () => sharingApi.approveRequest(scoreId, r.memberId, level),
                      t('scores.share.approved'),
                    )
                  }
                >
                  {t('scores.officialRequests.accept')}
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn--sm"
                  disabled={busy === r.memberId}
                  onClick={() =>
                    act(r.memberId, () => sharingApi.rejectRequest(scoreId, r.memberId), t('scores.share.rejected'))
                  }
                >
                  {t('scores.officialRequests.decline')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
