import Modal from '../scores/common/Modal';
import type { PlanLimitInfo } from '../../utils/planLimit';
import { t } from '../../i18n/core';

interface UpgradeDialogProps {
  info: PlanLimitInfo;
  onClose: () => void;
  onUpgrade: () => void;
}

const KNOWN_METRICS = [
  'OMR_PAGES',
  'EXPORTS',
  'STORAGE_MB',
  'CHORD_GENERATIONS',
  'OMR_PAGES_PER_JOB',
  'CHORD_MEASURES',
  'CHORD_ADVANCED',
];

/** Hạn mức cho một lần dùng (số trang mỗi lần, số ô nhịp) và quyền lợi theo gói: không phải "hết hạn mức tháng". */
const TITLE_BY_METRIC: Record<string, string> = {
  OMR_PAGES_PER_JOB: 'perRequest',
  CHORD_MEASURES: 'perRequest',
  CHORD_ADVANCED: 'feature',
};

/** Hộp thoại báo vượt hạn mức của gói và dẫn tới trang chọn gói. Tiêu đề theo loại hạn mức (OMR-04). */
export default function UpgradeDialog({ info, onClose, onUpgrade }: UpgradeDialogProps) {
  const key = KNOWN_METRICS.includes(info.metric) ? info.metric : 'DEFAULT';
  const params = { limit: String(info.limit ?? ''), used: String(info.used) };
  const title = TITLE_BY_METRIC[info.metric]
    ? t(`billing.upgrade.titles.${TITLE_BY_METRIC[info.metric]}`)
    : t('billing.upgrade.title');
  return (
    <Modal title={title} onClose={onClose}>
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
