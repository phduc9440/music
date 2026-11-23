import { Icon } from '../../ui';
import type { IconName } from '../../ui';
import { t } from '../../../i18n/core';

const BADGE: Record<string, { icon: IconName; label: string }> = {
  PUBLIC: {
    icon: 'globe',
    get label() {
      return t('scores.labels.visibilityShort.PUBLIC');
    },
  },
  PENDING: {
    icon: 'clock',
    get label() {
      return t('scores.labels.visibilityShort.PENDING');
    },
  },
  PRIVATE: {
    icon: 'lock',
    get label() {
      return t('scores.labels.visibilityShort.PRIVATE');
    },
  },
};

/** Nhãn quyền riêng tư (Công khai / Chờ duyệt / Riêng tư) có icon, dùng ở thẻ bản nhạc và trang chi tiết. */
export default function VisibilityBadge({ value, className = '' }: { value: string; className?: string }) {
  const key = BADGE[value] ? value : 'PRIVATE';
  const b = BADGE[key];
  return (
    <span className={`sc-vis sc-vis--${key.toLowerCase()} ${className}`.trim()}>
      <Icon name={b.icon} size={12} />
      {b.label}
    </span>
  );
}
