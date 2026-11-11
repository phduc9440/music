import { useEffect, useState } from 'react';
import { Link } from '../../routes/transition-nav';
import { Icon } from '../ui';
import { billingApi } from '../../services';
import { useI18n } from '../../i18n/useI18n';
import type { MySubscription } from '../../types';

/**
 * Nút gói dịch vụ cạnh nút "Tạo bản nhạc" trên thanh trên: hiện tên gói đang dùng và dẫn tới trang "Gói của tôi".
 * Gói Free thì ghi rõ "Nâng cấp" để dẫn tới bảng giá. Lỗi tải gói thì ẩn nút, thanh trên vẫn dùng bình thường.
 */
export default function PlanChip() {
  const { t } = useI18n();
  const [sub, setSub] = useState<MySubscription | null>(null);

  useEffect(() => {
    billingApi
      .mine()
      .then((res) => setSub(res.data.result))
      .catch(() => setSub(null));
  }, []);

  if (!sub) return null;
  const free = sub.status === 'FREE';
  return (
    <Link
      to={free ? '/pricing' : '/billing'}
      className={`app-plan${free ? ' app-plan--free' : ''}`}
      title={t('common.header.planTitle', { plan: sub.plan.name })}
    >
      <Icon name="star" size={16} />
      <span>
        {free ? t('common.header.upgrade') : sub.status === 'UNLIMITED' ? t('billing.unlimitedPlan') : sub.plan.name}
      </span>
    </Link>
  );
}
