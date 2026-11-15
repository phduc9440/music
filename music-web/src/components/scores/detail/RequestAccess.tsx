import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import { sharingApi } from '../../../services';
import { SHARE_PERMISSION_LABELS, getErrorCode, getErrorMessage } from '../../../utils/score';
import type { SharePermission } from '../../../types';
import { t } from '../../../i18n/core';
import Rich from '../../../i18n/Rich';

interface Props {
  scoreId: string;
  /** Có quyền rồi (ví dụ vừa được duyệt) thì báo cho trang cha tải lại bản nhạc. */
  onGranted: () => void;
  /** Các cấp được phép xin; mặc định xem, nhận xét hoặc chỉnh sửa. */
  levels?: SharePermission[];
  /** Đang xem được bản nhạc rồi (ví dụ xin thêm quyền sửa): không tự coi là "đã được cấp quyền" khi mở. */
  hasViewAccess?: boolean;
}

const DEFAULT_LEVELS: SharePermission[] = [1, 2, 3];

/** Màn hình thay cho "Không tìm thấy" khi người dùng chưa có quyền xem bản nhạc: gửi yêu cầu xin quyền. */
export default function RequestAccess({ scoreId, onGranted, levels = DEFAULT_LEVELS, hasViewAccess = false }: Props) {
  const LEVELS = levels;
  const [level, setLevel] = useState<SharePermission>(levels[0]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<SharePermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    sharingApi
      .myAccess(scoreId)
      .then((res) => {
        if (res.data.result.accessLevel && !hasViewAccess) onGranted();
        else setPending(res.data.result.requestedPermission);
      })
      .catch(() => undefined); // không tải được trạng thái thì vẫn cho gửi yêu cầu
  }, [scoreId, onGranted, hasViewAccess]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await sharingApi.requestAccess(scoreId, level, message.trim() || undefined);
      setPending(res.data.result.requestedPermission);
      toast.success(t('scores.request.sent'));
    } catch (err) {
      if (getErrorCode(err) === 2404) {
        // Bản công khai (hoặc đã được cấp): yêu cầu xem thì chỉ cần báo là xem được ngay
        toast.info(t('scores.request.alreadyPublic'));
        if (level === 1) onGranted();
        else setError(t('scores.request.alreadyHas'));
      } else {
        setError(getErrorMessage(err, t('scores.request.failed')));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sc-empty">
      <h3>{hasViewAccess ? t('scores.detail.requestMoreTitle') : t('scores.request.noAccess')}</h3>
      {pending && (
        <p>
          <Rich text={t('scores.request.pending', { level: SHARE_PERMISSION_LABELS[pending] })} />
        </p>
      )}
      <form onSubmit={submit} className="sc-request">
        <label className="sc-label" htmlFor="rq-level">
          {t('scores.request.level')}
        </label>
        <select
          id="rq-level"
          className="sc-input"
          value={level}
          disabled={busy}
          onChange={(e) => setLevel(Number(e.target.value) as SharePermission)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {SHARE_PERMISSION_LABELS[l]}
            </option>
          ))}
        </select>
        <label className="sc-label" htmlFor="rq-message">
          {t('scores.request.message')} <span className="sc-upload__optional">({t('scores.request.optional')})</span>
        </label>
        <textarea
          id="rq-message"
          className="sc-input"
          rows={3}
          maxLength={500}
          value={message}
          disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <div className="sc-error">{error}</div>}
        <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
          {busy ? t('scores.request.sending') : pending ? t('scores.request.resend') : t('scores.request.ask')}
        </button>
      </form>
    </div>
  );
}
