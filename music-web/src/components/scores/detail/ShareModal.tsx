import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { sharingApi } from '../../../services';
import { SHARE_PERMISSION_LABELS, getErrorMessage } from '../../../utils/score';
import type { AccessRequest, ScoreSharing, SharePermission, Visibility } from '../../../types';
import Modal from '../common/Modal';
import { labelMap, t } from '../../../i18n/core';
import Skeleton from '../../ui/Skeleton';

interface Props {
  scoreId: string;
  onClose: () => void;
}

const LEVELS: SharePermission[] = [1, 2, 3];

const VISIBILITY_HINTS: Record<Visibility, string> = labelMap('scores.share.hint', ['PRIVATE', 'PENDING', 'PUBLIC']);

/** Hộp thoại "Chia sẻ": mời theo email, duyệt yêu cầu xin quyền và quản lý người được chia sẻ. */
export default function ShareModal({ scoreId, onClose }: Props) {
  const [sharing, setSharing] = useState<ScoreSharing | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  // Cấp sẽ cấp khi bấm Đồng ý (mặc định đúng cấp người ta xin), theo từng người
  const [grant, setGrant] = useState<Record<string, SharePermission>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [inviteLevel, setInviteLevel] = useState<SharePermission>(1);

  useEffect(() => {
    sharingApi
      .get(scoreId)
      .then((res) => setSharing(res.data.result))
      .catch((err) => setError(getErrorMessage(err, t('scores.share.loadFailed'))));
    sharingApi
      .accessRequests(scoreId)
      .then((res) => setRequests(res.data.result))
      .catch(() => setRequests([]));
  }, [scoreId]);

  const reloadRequests = () =>
    sharingApi
      .accessRequests(scoreId)
      .then((res) => setRequests(res.data.result))
      .catch(() => undefined);

  // Chạy một thao tác rồi cập nhật lại trạng thái từ phản hồi của BE
  const run = async (action: () => Promise<{ data: { result: ScoreSharing } }>, okMsg?: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await action();
      setSharing(res.data.result);
      reloadRequests(); // đồng ý / từ chối / mời đều có thể làm đổi danh sách chờ
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (err) {
      setError(getErrorMessage(err, t('scores.share.failed')));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => sharingApi.addMember(scoreId, email.trim(), inviteLevel), t('scores.share.shared')))
      setEmail('');
  };

  return (
    <Modal title={t('scores.share.title')} onClose={onClose}>
      {!sharing && !error && <Skeleton lines={3} />}

      {sharing && (
        <>
          <section>
            <p className="sc-upload__hint">
              {VISIBILITY_HINTS[sharing.visibility]} {t('scores.share.changeHint')}
            </p>
          </section>

          {requests.length > 0 && (
            <section className="sc-share__requests">
              <h4>{t('scores.share.requests', { count: requests.length })}</h4>
              {requests.map((r) => (
                <div key={r.memberId} className="sc-share__request">
                  <span title={r.email}>
                    <strong>{r.fullName || r.email}</strong>{' '}
                    {t('scores.share.requestsLevel', { level: SHARE_PERMISSION_LABELS[r.requestedPermission] })}
                  </span>
                  {r.message && <span className="sc-upload__hint">“{r.message}”</span>}
                  <div className="sc-share__request-actions">
                    <select
                      className="sc-input"
                      aria-label={t('scores.share.grantTo', { email: r.email })}
                      value={grant[r.memberId] ?? r.requestedPermission}
                      disabled={busy}
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
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            sharingApi.approveRequest(scoreId, r.memberId, grant[r.memberId] ?? r.requestedPermission),
                          t('scores.share.approved'),
                        )
                      }
                    >
                      {t('scores.officialRequests.accept')}
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn--sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => sharingApi.rejectRequest(scoreId, r.memberId), t('scores.share.rejected'))
                      }
                    >
                      {t('scores.officialRequests.decline')}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="sc-share__members">
            <h4>{t('scores.share.members', { count: sharing.members.length })}</h4>
            {sharing.members.length === 0 && <p className="sc-upload__hint">{t('scores.share.noMembers')}</p>}
            <ul className="sc-share__list">
              {sharing.members.map((m) => (
                <li key={m.memberId}>
                  <span title={m.email}>{m.fullName || m.email}</span>
                  <select
                    className="sc-input"
                    aria-label={t('scores.share.levelOf', { email: m.email })}
                    value={m.permission}
                    disabled={busy}
                    onChange={(e) =>
                      run(() => sharingApi.updateMember(scoreId, m.memberId, Number(e.target.value) as SharePermission))
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
                    className="sc-icon-btn"
                    aria-label={t('scores.share.revokeOf', { email: m.email })}
                    disabled={busy}
                    onClick={() => run(() => sharingApi.removeMember(scoreId, m.memberId), t('scores.share.revoked'))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <form className="sc-share__invite" onSubmit={invite}>
              <input
                className="sc-input"
                type="email"
                placeholder={t('scores.share.invitePlaceholder')}
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select
                className="sc-input"
                aria-label={t('scores.share.inviteLevel')}
                value={inviteLevel}
                disabled={busy}
                onChange={(e) => setInviteLevel(Number(e.target.value) as SharePermission)}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SHARE_PERMISSION_LABELS[l]}
                  </option>
                ))}
              </select>
              <button type="submit" className="sc-btn sc-btn--primary" disabled={busy || !email.trim()}>
                {t('scores.share.invite')}
              </button>
            </form>
          </section>
        </>
      )}

      {error && <div className="sc-error">{error}</div>}

      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          Xong
        </button>
      </div>
    </Modal>
  );
}
