import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { sharingApi } from '../../services';
import { SHARE_PERMISSION_LABELS, getErrorMessage } from '../../utils/score';
import type { AccessRequest, ScoreSharing, SharePermission } from '../../types';
import Modal from './Modal';

interface Props {
  scoreId: string;
  onClose: () => void;
}

const LEVELS: SharePermission[] = [1, 2, 3];

/** Hộp thoại "Chia sẻ": bật liên kết theo cấp (xem / nhận xét / chỉnh sửa) và quản lý người được chia sẻ. */
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
      .catch((err) => setError(getErrorMessage(err, 'Không tải được thông tin chia sẻ')));
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
      setError(getErrorMessage(err, 'Thao tác thất bại, vui lòng thử lại'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const link = sharing?.shareToken ? `${window.location.origin}/s/${sharing.shareToken}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Đã sao chép liên kết');
    } catch {
      toast.error('Không sao chép được, hãy chọn và sao chép thủ công');
    }
  };

  const toggleLink = (on: boolean) => {
    if (!on && !window.confirm('Tắt liên kết? Mọi người đã vào bằng liên kết sẽ mất quyền truy cập.')) return;
    run(() => sharingApi.setLink(scoreId, on ? 1 : null), on ? 'Đã bật liên kết' : 'Đã tắt liên kết');
  };

  const resetLink = () => {
    if (!window.confirm('Tạo liên kết mới? Liên kết cũ sẽ hết hiệu lực và mọi người đã vào bằng nó mất quyền.')) return;
    run(() => sharingApi.resetLink(scoreId), 'Đã tạo liên kết mới');
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (await run(() => sharingApi.addMember(scoreId, email.trim(), inviteLevel), 'Đã chia sẻ')) setEmail('');
  };

  return (
    <Modal title="Chia sẻ bản nhạc" onClose={onClose}>
      {!sharing && !error && <p>Đang tải...</p>}

      {sharing && (
        <>
          <section>
            <label className="sc-label">
              <input
                type="checkbox"
                checked={sharing.linkEnabled}
                disabled={busy}
                onChange={(e) => toggleLink(e.target.checked)}
              />{' '}
              Bất kỳ ai có liên kết (cần đăng nhập)
            </label>

            {sharing.linkEnabled && sharing.linkPermission && (
              <>
                <select
                  className="sc-input"
                  aria-label="Quyền của người có liên kết"
                  value={sharing.linkPermission}
                  disabled={busy}
                  onChange={(e) =>
                    run(() => sharingApi.setLink(scoreId, Number(e.target.value) as SharePermission), 'Đã đổi quyền')
                  }
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {SHARE_PERMISSION_LABELS[l]}
                    </option>
                  ))}
                </select>
                <div className="sc-share__link">
                  <input className="sc-input" readOnly value={link} onFocus={(e) => e.target.select()} />
                  <button type="button" className="sc-btn" onClick={copy}>
                    Sao chép
                  </button>
                </div>
                <button type="button" className="sc-btn sc-btn--sm" disabled={busy} onClick={resetLink}>
                  Tạo liên kết mới
                </button>
              </>
            )}
          </section>

          {requests.length > 0 && (
            <section className="sc-share__requests">
              <h4>Yêu cầu xin quyền ({requests.length})</h4>
              {requests.map((r) => (
                <div key={r.memberId} className="sc-share__request">
                  <span title={r.email}>
                    <strong>{r.fullName || r.email}</strong> xin quyền {SHARE_PERMISSION_LABELS[r.requestedPermission]}
                  </span>
                  {r.message && <span className="sc-upload__hint">“{r.message}”</span>}
                  <div className="sc-share__request-actions">
                    <select
                      className="sc-input"
                      aria-label={`Quyền cấp cho ${r.email}`}
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
                          'Đã đồng ý',
                        )
                      }
                    >
                      Đồng ý
                    </button>
                    <button
                      type="button"
                      className="sc-btn sc-btn--sm"
                      disabled={busy}
                      onClick={() => run(() => sharingApi.rejectRequest(scoreId, r.memberId), 'Đã từ chối')}
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="sc-share__members">
            <h4>Người có quyền ({sharing.members.length})</h4>
            {sharing.members.length === 0 && <p className="sc-upload__hint">Chưa chia sẻ cho ai.</p>}
            <ul className="sc-share__list">
              {sharing.members.map((m) => (
                <li key={m.memberId}>
                  <span title={m.email}>
                    {m.fullName || m.email}
                    {m.source === 'LINK' && <span className="sc-chip"> qua liên kết</span>}
                  </span>
                  <select
                    className="sc-input"
                    aria-label={`Quyền của ${m.email}`}
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
                    aria-label={`Thu hồi quyền của ${m.email}`}
                    disabled={busy}
                    onClick={() => run(() => sharingApi.removeMember(scoreId, m.memberId), 'Đã thu hồi quyền')}
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
                placeholder="Mời theo email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select
                className="sc-input"
                aria-label="Quyền khi mời"
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
                Mời
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
