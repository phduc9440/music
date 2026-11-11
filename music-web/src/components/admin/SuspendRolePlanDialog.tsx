import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Icon } from '../ui';
import { errorMessage } from '../ui/helpers';
import { billingApi } from '../../services';
import { formatDate, t } from '../../i18n/core';
import '../ui/dialog.css';

/** Thời hạn tạm ngưng: 0 = đến hết tháng này. */
const OPTIONS = [0, 1, 3, 6, 12];

/**
 * Hộp thoại tạm ngưng gói Pro theo vai trò của một hoặc nhiều ADMIN (chỉ SUPER_ADMIN): chọn thời hạn và lý do. Hết hạn thì
 * họ tự dùng lại Pro. Dùng ở tab "Tạm ngưng gói" và trang chi tiết thành viên.
 */
export default function SuspendRolePlanDialog({
  members,
  onClose,
  onDone,
}: {
  members: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [months, setMonths] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const single = members.length === 1 ? members[0] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    setBusy(true);
    const note = reason.trim() || undefined;
    try {
      if (single) {
        const res = await billingApi.suspendRolePlan(single.id, { months, reason: note });
        const until = res.data.result.rolePlanSuspendedUntil;
        toast.success(t('admin.suspensions.done', { name: single.name, date: until ? formatDate(until) : '' }));
      } else {
        const res = await billingApi.suspendRolePlans({ memberIds: members.map((m) => m.id), months, reason: note });
        const done = res.data.result.filter((r) => r.status === 'SUSPENDED').length;
        toast.success(t('admin.suspensions.doneMany', { done, skipped: res.data.result.length - done }));
      }
      onDone();
    } catch (error) {
      toast.error(errorMessage(error, t('admin.plan.failed')));
      setBusy(false);
    }
  };

  return (
    <div className="ui-dialog-overlay" onMouseDown={() => !busy && onClose()}>
      <div
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspend-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="ui-dialog__body">
            <span className="ui-dialog__icon ui-dialog__icon--danger">
              <Icon name="alert" size={20} />
            </span>
            <div className="ui-dialog__text">
              <h2 id="suspend-title" className="ui-dialog__title">
                {single
                  ? t('admin.suspensions.title', { name: single.name })
                  : t('admin.suspensions.titleMany', { count: members.length })}
              </h2>
              <p className="ui-dialog__message">{t('admin.suspensions.message')}</p>
              <label className="ui-dialog__field">
                <span>{t('admin.suspensions.duration')}</span>
                <select
                  className="ui-dialog__input"
                  value={months}
                  disabled={busy}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  {OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? t('admin.suspensions.untilMonthEnd') : t('admin.grants.monthsOption', { count: n })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ui-dialog__field">
                <span>{t('admin.suspensions.reason')}</span>
                <input
                  className="ui-dialog__input"
                  value={reason}
                  maxLength={255}
                  disabled={busy}
                  placeholder={t('admin.suspensions.reasonPlaceholder')}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="ui-dialog__actions">
            <button type="button" className="ui-dialog__btn" disabled={busy} onClick={onClose}>
              {t('admin.plans.cancel')}
            </button>
            <button type="submit" className="ui-dialog__btn ui-dialog__btn--danger" disabled={busy}>
              {busy ? t('common.loading') : t('admin.suspensions.suspend')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
