import Modal from '../scores/common/Modal';
import type { PlanLimitInfo } from '../../utils/planLimit';
import { t } from '../../i18n/core';

interface UpgradeDialogProps {
  info: PlanLimitInfo;
  onClose: () => void;
  onUpgrade: () => void;
}

const KNOWN_METRICS = ['OMR_PAGES', 'EXPORTS', 'STORAGE_MB'];

/** Hộp thoại báo đã hết hạn mức của gói và dẫn tới trang chọn gói. */
export default function UpgradeDialog({ info, onClose, onUpgrade }: UpgradeDialogProps) {
  const key = KNOWN_METRICS.includes(info.metric) ? info.metric : 'DEFAULT';
  const params = { limit: String(info.limit ?? ''), used: String(info.used) };
  return (
    <Modal title={t('billing.upgrade.title')} onClose={onClose}>
      <p>{t(`billing.upgrade.reason.${key}`, params)}</p>
      {info.upgradeTo && <p>{t('billing.upgrade.suggest', { plan: info.upgradeTo })}</p>}
      <div className="sc-modal__actions">
        <button type="button" className="sc-btn" onClick={onClose}>
          {t('common.close')}
        </button>
        <button type="button" className="sc-btn sc-btn--primary" onClick={onUpgrade}>
          {t('billing.upgrade.viewPlans')}
        </button>
      </div>
    </Modal>
  );
}
