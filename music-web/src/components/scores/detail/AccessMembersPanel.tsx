import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { sharingApi } from '../../../services';
import { SHARE_PERMISSION_LABELS, getErrorMessage } from '../../../utils/score';
import type { ScoreSharing, SharePermission } from '../../../types';
import { t } from '../../../i18n/core';

const LEVELS: SharePermission[] = [1, 2, 3];

interface Props {
  scoreId: string;
  /** Mở hộp thoại Chia sẻ để mời thêm người. */
  onInvite: () => void;
  /** Đổi giá trị này (ví dụ khi đóng hộp Chia sẻ) để tải lại danh sách. */
  refreshKey?: number;
  /** Gọi sau khi đổi quyền / thu hồi. */
  onChanged?: () => void;
}

/**
 * Danh sách người đang có quyền với bản nhạc, hiện ngay trên trang chi tiết (không phải mở hộp Chia sẻ): tên, email,
 * quyền xem / nhận xét / chỉnh sửa, đổi quyền và thu hồi tại chỗ. Chỉ chủ bản nhạc (người quản lý chia sẻ) thấy.
 */
export default function AccessMembersPanel({ scoreId, onInvite, refreshKey = 0, onChanged }: Props) {
  const [sharing, setSharing] = useState<ScoreSharing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    sharingApi
      .get(scoreId)
      .then((res) => setSharing(res.data.result))
      .catch(() => setSharing(null));
  }, [scoreId]);

  useEffect(load, [load, refreshKey]);

  const act = async (memberId: string, run: () => Promise<unknown>, okMsg?: string) => {
    setBusy(memberId);
    try {
      await run();
      if (okMsg) toast.success(okMsg);
    } catch (err) {
      toast.error(getErrorMessage(err, t('scores.share.failed')));
    } finally {
      setBusy(null);
      load();
      onChanged?.();
    }
  };

  if (!sharing) return null;

  return (
    <section className="sc-people" aria-label={t('scores.share.members', { count: sharing.members.length })}>
      <div className="sc-people__head">
        <h2>{t('scores.share.members', { count: sharing.members.length })}</h2>
        <button type="button" className="sc-btn sc-btn--sm" onClick={onInvite}>
          {t('scores.share.addPeople')}
        </button>
      </div>
      {sharing.members.length === 0 ? (
        <p className="sc-people__empty">{t('scores.share.noMembers')}</p>
      ) : (
        <ul className="sc-people__list">
          {sharing.members.map((m) => (
            <li key={m.memberId} className="sc-people__item">
              <span className="sc-people__avatar" aria-hidden="true">
                {(m.fullName || m.email).charAt(0).toUpperCase()}
              </span>
              <span className="sc-people__who">
                <strong>{m.fullName || m.email}</strong>
                {m.fullName && <span title={m.email}>{m.email}</span>}
              </span>
              <select
                className="sc-input"
                aria-label={t('scores.share.levelOf', { email: m.email })}
                value={m.permission}
                disabled={busy === m.memberId}
                onChange={(e) =>
                  act(m.memberId, () =>
                    sharingApi.updateMember(scoreId, m.memberId, Number(e.target.value) as SharePermission),
                  )
                }
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SHARE_PERMISSION_LABELS[l]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="sc-btn sc-btn--sm sc-btn--danger"
                aria-label={t('scores.share.revokeOf', { email: m.email })}
                disabled={busy === m.memberId}
                onClick={() =>
                  act(m.memberId, () => sharingApi.removeMember(scoreId, m.memberId), t('scores.share.revoked'))
                }
              >
                {t('scores.share.revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
