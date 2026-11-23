import { getErrorCode } from './score';

/** Mã lỗi BE trả khi vượt hạn mức của gói (PLAN_LIMIT_REACHED). */
export const PLAN_LIMIT_CODE = 3702;

/** Nội dung kèm lỗi 3702 (khớp PlanLimitPayload của BE). */
export interface PlanLimitInfo {
  metric: string;
  limit: number | null;
  used: number;
  upgradeTo: string | null;
}

type Listener = (info: PlanLimitInfo) => void;

const listeners = new Set<Listener>();

const EMPTY_INFO: PlanLimitInfo = { metric: '', limit: null, used: 0, upgradeTo: null };

/** Đọc thông tin hạn mức từ lỗi API; undefined nếu không phải lỗi vượt hạn mức. */
export const planLimitOf = (err: unknown): PlanLimitInfo | undefined => {
  if (getErrorCode(err) !== PLAN_LIMIT_CODE) return undefined;
  const result = (err as { response?: { data?: { result?: Partial<PlanLimitInfo> } } }).response?.data?.result;
  return { ...EMPTY_INFO, ...result };
};

/**
 * Nếu lỗi là vượt hạn mức gói thì mở hộp thoại nâng cấp và trả true; ngược lại trả false để nơi gọi tự xử lý lỗi.
 */
export const reportPlanLimit = (err: unknown): boolean => {
  const info = planLimitOf(err);
  if (!info) return false;
  listeners.forEach((listener) => listener(info));
  return true;
};

/** Đăng ký nhận sự kiện vượt hạn mức; trả hàm huỷ đăng ký. */
export const subscribePlanLimit = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
