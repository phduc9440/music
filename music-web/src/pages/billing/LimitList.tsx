import { formatNumber, t } from '../../i18n/core';
import type { PlanLimits } from '../../types';
import { Icon } from '../../components/ui';

type NumericKey = 'omrPagesPerMonth' | 'omrConcurrent' | 'keptVersions' | 'exportsPerMonth';
type FlagKey = 'collab' | 'team' | 'omrPriority';

const NUMERIC: NumericKey[] = ['omrPagesPerMonth', 'omrConcurrent', 'keptVersions', 'exportsPerMonth'];
const FLAGS: FlagKey[] = ['collab', 'team', 'omrPriority'];

/** Dung lượng theo MB; từ 1024 MB trở lên đổi sang GB. */
const formatStorage = (mb: number) => (mb >= 1024 ? `${formatNumber(mb / 1024)} GB` : `${formatNumber(mb)} MB`);

/** Danh sách quyền lợi của một gói (dùng ở bảng giá và trang "Gói của tôi"). */
export default function LimitList({ limits }: { limits: PlanLimits }) {
  const unlimited = t('billing.unlimited');
  return (
    <ul className="bl-limits">
      {NUMERIC.map((key) => (
        <li key={key}>
          <span>{t(`billing.limits.${key}`)}</span>
          <strong>{limits[key] == null ? unlimited : formatNumber(limits[key] as number)}</strong>
        </li>
      ))}
      <li>
        <span>{t('billing.limits.storageMb')}</span>
        <strong>{limits.storageMb == null ? unlimited : formatStorage(limits.storageMb)}</strong>
      </li>
      {FLAGS.map((key) => (
        <li key={key}>
          <span>{t(`billing.limits.${key}`)}</span>
          {limits[key] ? (
            <Icon name="check" size={16} aria-label={t('billing.included')} />
          ) : (
            <strong aria-label={t('billing.notIncluded')}>—</strong>
          )}
        </li>
      ))}
    </ul>
  );
}
