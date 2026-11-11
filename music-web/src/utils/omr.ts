import { labelMap, t } from '../i18n/core';
import type { AiTaskInfo, OmrMeasure, TaskStatus } from '../types';

/** Loại tác vụ OMR (khớp AiTaskType.OMR_CONVERSION của BE). */
export const OMR_TASK_TYPE = 'OMR_CONVERSION';

/** Chu kỳ hỏi tiến độ trên trang xử lý (đặc tả mục 2.4: 2 giây). */
export const PROCESSING_POLL_MS = 2000;

/** Nhãn dòng chữ phụ của bước chưa được hỗ trợ ở bản hiện tại. */
export const stepLaterHint = (): string => t('upload.steps.later');

export interface OmrStepDef {
  /** Trùng với AiTaskStep của BE. */
  key: string;
  label: string;
  /** false: bước dành cho nhánh sau, chưa chạy thật. */
  available: boolean;
}

/** 5 bước của quy trình số hóa (đặc tả mục 2.2), cả 5 bước đều chạy thật. */
export const OMR_STEPS: OmrStepDef[] = (['SPLIT_PDF', 'PREPROCESS', 'INFERENCE', 'MERGE', 'EXPORT'] as const).map(
  (key) => ({
    key,
    get label() {
      return t(`upload.steps.${key}`);
    },
    available: true,
  }),
);

export type StepState = 'done' | 'active' | 'pending' | 'failed' | 'skipped' | 'later';

/** Tác vụ đã kết thúc (không cần hỏi tiến độ nữa). */
export const isTerminalStatus = (status: TaskStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';

/** Tác vụ OMR mới nhất trong danh sách (BE trả mới nhất trước). */
export const pickLatestOmrTask = (tasks: AiTaskInfo[]): AiTaskInfo | undefined =>
  tasks.find((t) => t.taskType === OMR_TASK_TYPE);

/**
 * Quy trình dừng sớm theo cấu hình (resultData.stoppedAfter là PREPROCESS hoặc MERGE).
 * Chạy đủ các bước thì BE không ghi stoppedAfter (hoặc ghi EXPORT), khi đó không phải dừng sớm.
 */
export const stoppedEarly = (task: AiTaskInfo): boolean => {
  const stoppedAfter = task.resultData?.stoppedAfter;
  return typeof stoppedAfter === 'string' && stoppedAfter.length > 0 && stoppedAfter !== 'EXPORT';
};

/**
 * Trạng thái hiển thị của từng bước trong danh sách.
 *
 * @param task tác vụ hiện tại
 * @param usesPdf bản gốc là PDF; nếu là ảnh thì bước "Tách trang PDF" được đánh dấu bỏ qua
 */
export const computeStepStates = (task: AiTaskInfo, usesPdf: boolean): StepState[] => {
  const current = OMR_STEPS.findIndex((s) => s.key === task.step);
  const completed = task.status === 'COMPLETED';
  const failed = task.status === 'FAILED' || task.status === 'CANCELLED';
  // Bước cuối đã chạy khi task COMPLETED: stoppedAfter nếu dừng sớm, không thì chạy đủ cả 5 bước
  const stoppedAfter = typeof task.resultData?.stoppedAfter === 'string' ? task.resultData.stoppedAfter : '';
  const stopIndex = stoppedAfter ? OMR_STEPS.findIndex((s) => s.key === stoppedAfter) : OMR_STEPS.length - 1;

  return OMR_STEPS.map((step, index): StepState => {
    if (!usesPdf && step.key === 'SPLIT_PDF') return 'skipped';
    if (completed) return index <= stopIndex ? 'done' : 'later';
    if (!step.available) return 'later';
    if (current < 0) {
      // Chưa có bước nào (đang xếp hàng): lỗi thì gán cho bước thật đầu tiên, còn lại đều chờ
      return failed && index === (usesPdf ? 0 : 1) ? 'failed' : 'pending';
    }
    if (index < current) return 'done';
    if (index === current) return failed ? 'failed' : 'active';
    return 'pending';
  });
};

/** Mã bản nhạc hợp lệ (UUID hoặc chuỗi tương tự): chặn đường dẫn lạ trước khi gọi API. */
export const isValidScoreId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9-]{8,64}$/.test(id);

/** Tách mã lỗi và chi tiết từ errorMessage của BE, dạng "MÃ" hoặc "MÃ: chi tiết". */
export const parseTaskError = (message?: string | null): { code: string; detail: string } => {
  if (!message) return { code: '', detail: '' };
  const index = message.indexOf(':');
  if (index < 0) return { code: message.trim(), detail: '' };
  return { code: message.slice(0, index).trim(), detail: message.slice(index + 1).trim() };
};

interface ErrorText {
  title: string;
  hint: string;
}

const KNOWN_TASK_ERRORS = [
  'PAGE_UNREADABLE',
  'NO_STAFF_DETECTED',
  'TASK_TIMEOUT',
  'AI_SERVICE_UNAVAILABLE',
  'CANCELLED_BY_USER',
  'JOB_REJECTED',
  'ORIGINAL_FILE_MISSING',
  'RECOGNITION_EMPTY',
  'MERGE_SPINE_MISMATCH',
  'KERN_PARSE_ERROR',
  'EXPORT_ERROR',
  'MODEL_NOT_LOADED',
  'INTERNAL_ERROR',
];

/** Tiêu đề và gợi ý của một mã lỗi OMR, theo ngôn ngữ đang dùng (chuỗi ở locales, nhóm upload). */
const errorText = (code: string): ErrorText => ({
  title: t(`upload.errors.${code}.title`),
  hint: t(`upload.errors.${code}.hint`),
});

/** Câu thông báo cho tác vụ FAILED hoặc CANCELLED, kèm chi tiết (ví dụ số trang) nếu có. */
export const describeTaskError = (task: AiTaskInfo): ErrorText & { detail: string } => {
  const { code, detail } = parseTaskError(task.errorMessage);
  const key = KNOWN_TASK_ERRORS.includes(code) ? code : task.status === 'CANCELLED' ? 'CANCELLED_BY_USER' : 'GENERIC';
  return { ...errorText(key), detail };
};

/** Các cảnh báo (trang bị bỏ qua, góc nghiêng quá lớn...) trong resultData.warnings. */
export const getTaskWarnings = (task: AiTaskInfo): string[] => {
  const warnings = task.resultData?.warnings;
  return Array.isArray(warnings) ? warnings.filter((w): w is string => typeof w === 'string') : [];
};

/** Cảnh báo kèm số trang (tách từ tiền tố "Trang N, ..."); page = null nếu cảnh báo chung. */
interface ParsedWarning {
  page: number | null;
  text: string;
}

/** Tách số trang từ chuỗi cảnh báo do music-ai sinh, ví dụ "Trang 2, ô nhịp 3: ...". */
export const parseWarning = (raw: string): ParsedWarning => {
  const match = /^Trang\s+(\d+)\s*[,:]?\s*(.*)$/s.exec(raw);
  if (!match) return { page: null, text: raw };
  return { page: Number(match[1]), text: match[2] || raw };
};

/** Kích thước ảnh trang đã tiền xử lý (music-ai); khung ô trong measureMap tính theo kích thước này. */
export const PAGE_IMAGE_WIDTH = 1050;
export const PAGE_IMAGE_HEIGHT = 1485;

/** Nhãn của cờ cần kiểm tra trong measureMap. */
export const MEASURE_FLAG_LABELS: Record<OmrMeasure['flags'][number], string> = labelMap('upload.measureFlags', [
  'DURATION',
  'COUNT_MISMATCH',
]);

/** Các ô cần kiểm tra (có ít nhất một cờ), theo số ô tăng dần. */
export const flaggedMeasures = (map: OmrMeasure[] | undefined): OmrMeasure[] =>
  (map ?? []).filter((m) => m.flags.length > 0).sort((a, b) => a.measure - b.measure);

/** Khung ô quy ra phần trăm của ảnh trang để vẽ lớp phủ; null nếu ô chưa có khung. */
export const boxToPercent = (
  box: OmrMeasure['box'],
): { left: string; top: string; width: string; height: string } | null => {
  if (!box) return null;
  const [x0, y0, x1, y1] = box;
  if (x1 <= x0 || y1 <= y0) return null;
  const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`;
  return {
    left: pct(x0, PAGE_IMAGE_WIDTH),
    top: pct(y0, PAGE_IMAGE_HEIGHT),
    width: pct(x1 - x0, PAGE_IMAGE_WIDTH),
    height: pct(y1 - y0, PAGE_IMAGE_HEIGHT),
  };
};
