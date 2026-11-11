/*
 * Lõi đa ngôn ngữ (mục 6.2), không phụ thuộc React và không thêm thư viện: đọc/ghi lựa chọn, tra chuỗi t(key, params),
 * số nhiều, định dạng ngày/số. Tiếng Việt là ngôn ngữ mặc định và là bản dự phòng khi thiếu chuỗi tiếng Anh.
 *
 * Chuỗi nằm ở src/locales/{vi,en}/<ns>.json; khóa gọi là "<ns>.đường.dẫn" (ví dụ "common.nav.explore").
 * Số nhiều: truyền { count } thì ưu tiên khóa "<khóa>_one" / "<khóa>_other" theo Intl.PluralRules, không có thì dùng
 * chính khóa. Tham số trong chuỗi viết {name}.
 */

export type Locale = 'vi' | 'en';

export const LOCALES: Locale[] = ['vi', 'en'];
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_STORAGE_KEY = 'locale';

type Messages = { [key: string]: string | Messages };

/** Nạp mọi file JSON dưới src/locales/<ngôn ngữ>/<ns>.json lúc build. */
const modules = import.meta.glob<{ default: Messages }>('../locales/*/*.json', { eager: true });

const catalog: Record<Locale, Record<string, Messages>> = { vi: {}, en: {} };
for (const [path, mod] of Object.entries(modules)) {
  const match = /\/locales\/(vi|en)\/([^/]+)\.json$/.exec(path);
  if (match) catalog[match[1] as Locale][match[2]] = mod.default;
}

export const isLocale = (value: unknown): value is Locale => value === 'vi' || value === 'en';

/** Lựa chọn đã lưu trong trình duyệt; chưa có hoặc không đọc được thì tiếng Việt. */
export function getStoredLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE; // trình duyệt chặn localStorage (chế độ riêng tư...)
  }
}

let current: Locale = getStoredLocale();
const listeners = new Set<() => void>();

export const getLocale = (): Locale => current;

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Đặt ngôn ngữ đang dùng: lưu trình duyệt, cập nhật <html lang> và báo cho giao diện dựng lại. */
export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // không lưu được thì chỉ mất lựa chọn sau khi tải lại trang
  }
  applyDocumentLanguage();
  listeners.forEach((listener) => listener());
}

export function applyDocumentLanguage(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/** Giá trị server (VI/EN) sang ngôn ngữ ở web; null (chưa chọn) thì không đổi gì. */
export function fromServerLocale(value: string | null | undefined): Locale | null {
  const lower = value?.toLowerCase();
  return isLocale(lower) ? lower : null;
}

export const toServerLocale = (locale: Locale): 'VI' | 'EN' => locale.toUpperCase() as 'VI' | 'EN';

/**
 * Áp ngôn ngữ đã lưu trên server khi vừa tải hồ sơ, để lựa chọn đi theo tài khoản giữa các máy. Chưa từng chọn (null)
 * thì giữ lựa chọn của trình duyệt này.
 */
export function adoptServerLocale(value: string | null | undefined): void {
  const locale = fromServerLocale(value);
  if (locale) setLocale(locale);
}

// ----------------------------------------------------------------------------------------------------- tra chuỗi

function lookup(locale: Locale, key: string): string | undefined {
  const dot = key.indexOf('.');
  if (dot < 0) return undefined;
  let node: string | Messages | undefined = catalog[locale][key.slice(0, dot)];
  for (const part of key.slice(dot + 1).split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type Params = Record<string, string | number>;

/** Có chuỗi cho khóa này (ở ngôn ngữ đang dùng hoặc dự phòng tiếng Việt) không? */
export const hasKey = (key: string, locale: Locale = current): boolean =>
  lookup(locale, key) !== undefined || lookup(DEFAULT_LOCALE, key) !== undefined;

function resolve(key: string, locale: Locale, count: number | undefined): string | undefined {
  if (count !== undefined) {
    const rule = new Intl.PluralRules(locale).select(count);
    const plural = lookup(locale, `${key}_${rule}`);
    if (plural !== undefined) return plural;
  }
  return lookup(locale, key);
}

const warned = new Set<string>();

/**
 * Dịch theo ngôn ngữ đang dùng. Thiếu bản tiếng Anh thì lấy bản tiếng Việt; thiếu cả hai thì trả về chính khóa (và cảnh
 * báo một lần ở bản dev) để dễ thấy chỗ quên.
 */
export function t(key: string, params?: Params): string {
  const count = typeof params?.count === 'number' ? params.count : undefined;
  let text = resolve(key, current, count) ?? resolve(key, DEFAULT_LOCALE, count);
  if (text === undefined) {
    if (import.meta.env.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] thiếu chuỗi "${key}"`); // i18n-ignore: log cho lập trình viên
    }
    return key;
  }
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
  }
  return text;
}

/**
 * Bảng nhãn cho một nhóm giá trị enum: labelMap('scores.labels.difficulty', ['EASY', ...]) cho đối tượng có các thuộc tính
 * EASY, ... mỗi thuộc tính là getter tra "<tiền tố>.<giá trị>" ở thời điểm đọc. Nhờ vậy các hằng số kiểu
 * DIFFICULTY_LABELS[x] đang dùng khắp app tự theo ngôn ngữ đang dùng mà không phải sửa nơi gọi.
 */
export function labelMap<K extends string | number>(prefix: string, keys: readonly K[]): Record<K, string> {
  const map = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(map, key, { enumerable: true, get: () => t(`${prefix}.${key}`) });
  }
  return map;
}

// ------------------------------------------------------------------------------------------- ngày, số, thời gian

/** Mã ngôn ngữ cho Intl. */
const intlLocale = (): string => (current === 'vi' ? 'vi-VN' : 'en-US');

/** Tên tháng viết ngắn theo ngôn ngữ đang dùng (month: 0 – 11), dùng cho nhãn biểu đồ. */
export const monthShortName = (month: number): string =>
  new Intl.DateTimeFormat(intlLocale(), { month: 'short' }).format(new Date(2000, month, 1));

export const formatNumber = (value: number): string => new Intl.NumberFormat(intlLocale()).format(value);

/** Số gọn cho trục biểu đồ: "1,2 Tr" / "1.2M". */
export const formatCompact = (value: number): string =>
  new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export const formatDate = (value: string | number | Date): string => new Date(value).toLocaleDateString(intlLocale());

export const formatDateTime = (value: string | number | Date): string => new Date(value).toLocaleString(intlLocale());

/** Tiền luôn là VND, chỉ cách ngăn số theo ngôn ngữ. */
export const formatVnd = (value: number): string =>
  new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

/** "vừa xong", "5 phút trước", "3 ngày trước"...; quá 30 ngày thì hiện ngày tháng. */
export function formatRelativeTime(value: string | number | Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSec < 60) return t('common.time.justNow');
  const min = Math.floor(diffSec / 60);
  if (min < 60) return t('common.time.minutesAgo', { count: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return t('common.time.hoursAgo', { count: hour });
  const day = Math.floor(hour / 24);
  if (day <= 30) return t('common.time.daysAgo', { count: day });
  return formatDate(value);
}

// ---------------------------------------------------------------------------------------------- lỗi từ backend

type ApiError = { response?: { data?: { code?: number; message?: string } }; message?: string };

/**
 * Câu lỗi cho người dùng: ưu tiên bản dịch theo mã lỗi của BE ("errors.<code>"), không có thì dùng message của BE, rồi
 * tới câu mặc định. BE không phải dịch.
 */
export function translateError(error: unknown, fallback: string): string {
  const data = (error as ApiError | null | undefined)?.response?.data;
  if (data?.code !== undefined && hasKey(`errors.${data.code}`))
    return errorCodeMessage(data.code, data.message) ?? fallback;
  return data?.message ?? fallback;
}

/**
 * Bản dịch cho riêng một mã lỗi nếu có, để nơi gọi tự quyết định khi không có. Chuỗi có {min} (độ dài tối thiểu, BE
 * ghi sẵn con số vào message) thì lấy số nguyên đầu tiên trong message của BE.
 */
export function errorCodeMessage(code: number | undefined, backendMessage?: string): string | undefined {
  if (code === undefined || !hasKey(`errors.${code}`)) return undefined;
  const min = backendMessage?.match(/\d+/)?.[0];
  return t(`errors.${code}`, min ? { min } : undefined);
}
