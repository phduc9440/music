import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Icon } from '../ui';
import { errorMessage } from '../ui/helpers';
import { billingApi } from '../../services';
import type { HeldPlan, PlanInfo } from '../../types';
import { formatDate, t } from '../../i18n/core';
import '../ui/dialog.css';

/** Thời hạn cấm (tháng). */
const BAN_OPTIONS = [1, 3, 6, 12];

export type SanctionMode = 'revoke' | 'ban';

/**
 * Hộp thoại xử lý vi phạm cho một hoặc nhiều thành viên (chỉ SUPER_ADMIN). "Thu hồi gói": gói đang dùng bị hủy ngay, muốn
 * dùng lại phải mua lại. "Cấm dùng gói": trong 1/3/6/12 tháng chỉ dùng Free, không mua hay được cấp gói. Lý do được gửi kèm
 * thông báo cho người bị xử lý.
 */
export default function SanctionDialog({
  mode,
  members,
  onClose,
  onDone,
}: {
  mode: SanctionMode;
  members: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Gói bị cấm: '' = gói đang dùng của từng người; một người thì chọn trong các gói họ đang có
  const [planCode, setPlanCode] = useState('');
  const [held, setHeld] = useState<HeldPlan[] | null>(null);
  const [paidPlans, setPaidPlans] = useState<PlanInfo[]>([]);
  const single = members.length === 1 ? members[0] : null;

  useEffect(() => {
    if (mode !== 'ban') return;
    if (single) {
      billingApi
        .ofMember(single.id)
        .then((res) => {
          const plans = res.data.result.heldPlans ?? [];
          setHeld(plans);
          setPlanCode((code) => code || plans[0]?.code || '');
        })
        .catch(() => setHeld([]));
    }
    billingApi
      .plans()
      .then((res) => setPaidPlans(res.data.result.filter((p) => p.code !== 'FREE')))
      .catch(() => setPaidPlans([]));
  }, [mode, single]);
  const who = single ? single.name : t('admin.sanctions.people', { count: members.length });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    setBusy(true);
    const memberIds = members.map((m) => m.id);
    const note = reason.trim() || undefined;
    try {
      const res =
        mode === 'revoke'
          ? await billingApi.revokePlans({ memberIds, reason: note })
          : await billingApi.banPlans({ memberIds, months, reason: note, planCode: planCode || undefined });
      const okStatus = mode === 'revoke' ? 'REVOKED' : 'BANNED';
      const done = res.data.result.filter((r) => r.status === okStatus);
      const skipped = res.data.result.length - done.length;
      if (single && done.length === 1) {
        toast.success(
          mode === 'revoke'
            ? t('admin.sanctions.revokedOne', { name: single.name })
            : t('admin.sanctions.bannedOne', {
                name: single.name,
                date: done[0].expiresAt ? formatDate(done[0].expiresAt) : '',
              }),
        );
      } else if (done.length > 0) {
        toast.success(
          t(mode === 'revoke' ? 'admin.sanctions.revokedMany' : 'admin.sanctions.bannedMany', {
            done: done.length,
            skipped,
          }),
        );
      } else {
        toast.info(t(mode === 'revoke' ? 'admin.sanctions.nothingToRevoke' : 'admin.sanctions.nothingToBan'));
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
        aria-labelledby="sanction-title"
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
              <h2 id="sanction-title" className="ui-dialog__title">
                {t(mode === 'revoke' ? 'admin.sanctions.revokeTitle' : 'admin.sanctions.banTitle', { who })}
              </h2>
              <p className="ui-dialog__message">
                {t(mode === 'revoke' ? 'admin.sanctions.revokeMessage' : 'admin.sanctions.banMessage')}
              </p>
              {mode === 'ban' && (
                <label className="ui-dialog__field">
                  <span>{t('admin.sanctions.planToBan')}</span>
                  <select
                    className="ui-dialog__input"
                    value={planCode}
                    disabled={busy}
                    onChange={(e) => setPlanCode(e.target.value)}
                  >
                    {single && held && held.length > 0 ? (
                      held.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.source === 'ROLE'
                            ? t('admin.sanctions.heldRole', { plan: p.name })
                            : p.expiresAt
                              ? t('admin.sanctions.heldUntil', { plan: p.name, date: formatDate(p.expiresAt) })
                              : p.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="">{t('admin.sanctions.currentPlanEach')}</option>
                        {paidPlans.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </label>
              )}
              {mode === 'ban' && (
                <label className="ui-dialog__field">
                  <span>{t('admin.sanctions.duration')}</span>
                  <select
                    className="ui-dialog__input"
                    value={months}
                    disabled={busy}
                    onChange={(e) => setMonths(Number(e.target.value))}
                  >
                    {BAN_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {t('admin.grants.monthsOption', { count: n })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="ui-dialog__field">
                <span>{t('admin.sanctions.reason')}</span>
                <input
                  className="ui-dialog__input"
                  value={reason}
                  maxLength={255}
                  disabled={busy}
                  placeholder={t('admin.sanctions.reasonPlaceholder')}
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
              {busy ? t('common.loading') : t(mode === 'revoke' ? 'admin.sanctions.revoke' : 'admin.sanctions.ban')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
