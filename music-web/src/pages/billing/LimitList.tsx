import { formatNumber, t } from '../../i18n/core';
import type { PlanLimits } from '../../types';
import { Icon } from '../../components/ui';
import { UPLOAD_MAX_PDF_PAGES } from '../../utils/score';

type NumericKey =
  | 'omrPagesPerMonth'
  | 'omrConcurrent'
  | 'keptVersions'
  | 'exportsPerMonth'
  | 'omrMaxPagesPerJob'
  | 'chordGenerationsPerMonth'
  | 'chordOptions'
  | 'chordMaxMeasures';
type FlagKey = 'collab' | 'team' | 'omrPriority' | 'chordAdvanced';

const NUMERIC: NumericKey[] = [
  'omrPagesPerMonth',
  'omrConcurrent',
  'keptVersions',
  'omrMaxPagesPerJob',
  'exportsPerMonth',
  'chordGenerationsPerMonth',
  'chordOptions',
  'chordMaxMeasures',
];
const FLAGS: FlagKey[] = ['collab', 'team', 'omrPriority', 'chordAdvanced'];

/** Dung lượng theo MB; từ 1024 MB trở lên đổi sang GB. */
const formatStorage = (mb: number) => (mb >= 1024 ? `${formatNumber(mb / 1024)} GB` : `${formatNumber(mb)} MB`);

/** Danh sách quyền lợi của một gói (dùng ở bảng giá và trang "Gói của tôi"). */
export default function LimitList({ limits }: { limits: PlanLimits }) {
  const unlimited = t('billing.unlimited');
  return (
    <ul className="bl-limits">
      {NUMERIC.map((key) => {
        // Số trang mỗi lần số hóa luôn có trần hệ thống: để trống trong gói nghĩa là đúng trần đó, không phải không giới hạn
        const value =
          key === 'omrMaxPagesPerJob'
            ? Math.min(limits[key] ?? UPLOAD_MAX_PDF_PAGES, UPLOAD_MAX_PDF_PAGES)
            : limits[key];
        return (
          <li key={key}>
            <span>{t(`billing.limits.${key}`)}</span>
            <strong>{value == null ? unlimited : formatNumber(value as number)}</strong>
          </li>
        );
      })}
      <li>
        <span>{t('billing.limits.storageMb')}</span>
        <strong>{limits.storageMb == null ? unlimited : formatStorage(limits.storageMb)}</strong>
      </li>
      {limits.team && (
        <li>
          <span>{t('billing.limits.teamMembers')}</span>
          <strong>{limits.teamMembers == null ? unlimited : formatNumber(limits.teamMembers)}</strong>
        </li>
      )}
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
