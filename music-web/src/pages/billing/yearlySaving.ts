import type { PlanInfo } from '../../types';

export interface YearlySaving {
  /** Trả lẻ 12 tháng thì hết bao nhiêu. */
  fullYear: number;
  /** Trả theo năm rẻ hơn bao nhiêu so với trả lẻ 12 tháng. */
  saved: number;
  /** Phần trăm tiết kiệm, làm tròn. */
  percent: number;
}

/**
 * Khoản tiết kiệm khi trả theo năm thay vì trả lẻ 12 tháng. Tính lúc hiển thị từ hai giá có sẵn của gói (không lưu);
 * gói miễn phí, thiếu một trong hai giá, hay giá năm không rẻ hơn thì trả về null.
 */
export function yearlySaving(plan: Pick<PlanInfo, 'priceMonth' | 'priceYear'>): YearlySaving | null {
  if (plan.priceMonth <= 0 || plan.priceYear <= 0) return null;
  const fullYear = plan.priceMonth * 12;
  const saved = fullYear - plan.priceYear;
  if (saved <= 0) return null;
  return {
    fullYear,
    saved,
    percent: Math.round((saved / fullYear) * 100),
  };
}

/** Mức tiết kiệm cao nhất trong các gói (cho nhãn "−17%" trên nút chọn theo năm); không gói nào giảm thì null. */
export function maxYearlyPercent(plans: Pick<PlanInfo, 'priceMonth' | 'priceYear'>[]): number | null {
  const percents = plans.map((p) => yearlySaving(p)?.percent ?? 0).filter((p) => p > 0);
  return percents.length ? Math.max(...percents) : null;
}
