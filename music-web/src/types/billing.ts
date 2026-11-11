// Gói dịch vụ và hạn mức (BE: PlanResponse, MySubscriptionResponse)

/** Hạn mức của gói. Số null = không giới hạn; cờ false hoặc thiếu = không có quyền lợi đó. */
export interface PlanLimits {
  omrPagesPerMonth?: number | null;
  omrConcurrent?: number | null;
  storageMb?: number | null;
  keptVersions?: number | null;
  exportsPerMonth?: number | null;
  collab?: boolean | null;
  team?: boolean | null;
  omrPriority?: boolean | null;
}

/** PERSONAL: gói cá nhân; TEAM: gói nhóm; UNLIMITED: gói ảo của SUPER_ADMIN. */
export type PlanAudience = 'PERSONAL' | 'TEAM' | 'UNLIMITED';

export interface PlanInfo {
  code: string;
  name: string;
  audience: PlanAudience;
  /** Thứ tự hiển thị (nhỏ đứng trước). */
  sortOrder: number;
  priceMonth: number;
  priceYear: number;
  limits: PlanLimits;
}

export interface MySubscription {
  plan: PlanInfo;
  /** ACTIVE (có gói trả phí hoặc được cấp) hoặc FREE. */
  status: 'ACTIVE' | 'FREE' | 'UNLIMITED';
  /** ROLE: quyền lợi theo vai trò quản trị (ADMIN dùng Pro không thời hạn, SUPER_ADMIN không giới hạn). */
  source?: 'PAYMENT' | 'POINTS_TRIAL' | 'ADMIN_GRANT' | 'ROLE' | null;
  roleGrant?: 'SUPER_ADMIN' | 'ADMIN' | null;
  /** Đang bị cấm dùng gói trả phí đến lúc này (chỉ dùng Free). */
  bannedUntil?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  omrPagesUsed: number;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
export type BillingPeriod = 'MONTH' | 'YEAR';
export type PaymentKind = 'NEW' | 'RENEW';

// BE: PaymentOrderResponse. memberEmail chỉ có ở admin, payUrl chỉ có khi vừa tạo đơn.
export interface PaymentOrder {
  id: string;
  orderCode: string;
  planCode: string;
  planName: string;
  period: BillingPeriod;
  /** NEW: mua mới hoặc đổi gói; RENEW: gia hạn đúng gói đang dùng. */
  kind: PaymentKind;
  amount: number;
  provider: string;
  status: PaymentStatus;
  createdAt: string;
  expiresAt: string;
  paidAt?: string | null;
  memberEmail?: string | null;
  payUrl?: string | null;
}

// BE: RevenueResponse (số tiền VND)
export interface Revenue {
  from: string;
  to: string;
  totalAmount: number;
  orderCount: number;
  refundedAmount: number;
  refundedCount: number;
  byDay: { date: string; amount: number; count: number }[];
  byPlan: { planCode: string; planName: string; amount: number; count: number }[];
}
