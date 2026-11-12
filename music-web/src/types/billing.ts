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
  /** Số thành viên tối đa mỗi team (gói có team = true); null = không giới hạn. */
  teamMembers?: number | null;
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

/** Một gói mua/được cấp còn hạn (BE: HeldSubscription). Mỗi người có tối đa một gói cá nhân và một gói team. */
export interface HeldSubscription {
  plan: PlanInfo;
  source: 'PAYMENT' | 'POINTS_TRIAL' | 'ADMIN_GRANT';
  startsAt?: string | null;
  expiresAt: string;
  /** Gói đang bị cấm dùng: còn hạn nhưng không dùng hay gia hạn được tới khi hết cấm. */
  banned: boolean;
}

export interface MySubscription {
  /** Gói chính: gói cao nhất đang dùng (Free nếu không có gói nào). */
  plan: PlanInfo;
  /** Hạn mức đang áp dụng, gộp từ mọi gói đang dùng (mỗi chỉ số lấy mức cao hơn). */
  limits: PlanLimits;
  /** Các gói mua/được cấp còn hạn, gói chính trước. */
  subscriptions?: HeldSubscription[];
  /** ACTIVE (có gói trả phí hoặc được cấp) hoặc FREE. */
  status: 'ACTIVE' | 'FREE' | 'UNLIMITED';
  /** ROLE: quyền lợi theo vai trò quản trị (ADMIN dùng Pro không thời hạn, SUPER_ADMIN không giới hạn). */
  source?: 'PAYMENT' | 'POINTS_TRIAL' | 'ADMIN_GRANT' | 'ROLE' | null;
  roleGrant?: 'SUPER_ADMIN' | 'ADMIN' | null;
  /** Các gói đang có (chưa tính lệnh cấm): gói mua/được cấp và Pro theo vai trò của ADMIN. */
  heldPlans?: HeldPlan[];
  /** Các gói đang bị cấm dùng (kèm hạn). */
  bans?: PlanBan[];
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

/** Một lệnh cấm đang hiệu lực (BE: PlanBanInfo). */
export interface PlanBan {
  planCode: string;
  planName: string;
  until: string;
}

/** Một gói thành viên đang có, chưa tính lệnh cấm (BE: HeldPlan). source: PAYMENT / ADMIN_GRANT / POINTS_TRIAL / ROLE. */
export interface HeldPlan {
  code: string;
  name: string;
  source: string;
  expiresAt?: string | null;
}
