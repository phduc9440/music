import type { AiTaskInfo, TaskStatus } from '../types';

/** Loại tác vụ OMR (khớp AiTaskType.OMR_CONVERSION của BE). */
export const OMR_TASK_TYPE = 'OMR_CONVERSION';

/** Chu kỳ hỏi tiến độ trên trang xử lý (đặc tả mục 2.4: 2 giây). */
export const PROCESSING_POLL_MS = 2000;

/** Nhãn dòng chữ phụ của bước chưa được hỗ trợ ở bản hiện tại. */
export const STEP_LATER_HINT = 'Sẽ có ở bản sau';

export interface OmrStepDef {
  /** Trùng với AiTaskStep của BE. */
  key: string;
  label: string;
  /** false: bước dành cho nhánh sau, chưa chạy thật. */
  available: boolean;
}

/** 5 bước của quy trình số hóa (đặc tả mục 2.2). Hiện chỉ 2 bước đầu chạy thật. */
export const OMR_STEPS: OmrStepDef[] = [
  { key: 'SPLIT_PDF', label: 'Tách trang PDF', available: true },
  { key: 'PREPROCESS', label: 'Tiền xử lý ảnh', available: true },
  { key: 'INFERENCE', label: 'Nhận diện ký hiệu', available: false },
  { key: 'MERGE', label: 'Ghép các trang', available: false },
  { key: 'EXPORT', label: 'Xuất MusicXML và MIDI', available: false },
];

export type StepState = 'done' | 'active' | 'pending' | 'failed' | 'skipped' | 'later';

/** Tác vụ đã kết thúc (không cần hỏi tiến độ nữa). */
export const isTerminalStatus = (status: TaskStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';

/** Tác vụ OMR mới nhất trong danh sách (BE trả mới nhất trước). */
export const pickLatestOmrTask = (tasks: AiTaskInfo[]): AiTaskInfo | undefined =>
  tasks.find((t) => t.taskType === OMR_TASK_TYPE);

/** Nhánh hiện tại dừng sau bước tiền xử lý (resultData.stoppedAfter) nên các bước sau chưa chạy. */
export const stoppedEarly = (task: AiTaskInfo): boolean =>
  typeof task.resultData?.stoppedAfter === 'string' && task.resultData.stoppedAfter.length > 0;

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
  const finishedAll = completed && !stoppedEarly(task);

  return OMR_STEPS.map((step, index): StepState => {
    if (!usesPdf && step.key === 'SPLIT_PDF') return 'skipped';
    if (finishedAll) return 'done';
    if (!step.available) return 'later';
    if (completed) return 'done';
    if (current < 0) {
      // Chưa có bước nào (đang xếp hàng): lỗi thì gán cho bước thật đầu tiên, còn lại đều chờ
      return failed && index === (usesPdf ? 0 : 1) ? 'failed' : 'pending';
    }
    if (index < current) return 'done';
    if (index === current) return failed ? 'failed' : 'active';
    return 'pending';
  });
};

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

const TASK_ERROR_TEXTS: Record<string, ErrorText> = {
  PAGE_UNREADABLE: {
    title: 'Không đọc được trang nhạc',
    hint: 'Ảnh hoặc PDF bị hỏng, quá mờ hoặc không mở được. Hãy chụp hoặc quét lại rõ hơn rồi tải lên.',
  },
  NO_STAFF_DETECTED: {
    title: 'Không tìm thấy khuông nhạc',
    hint: 'Hệ thống không thấy dòng kẻ khuông nhạc nào. Hãy chụp sát trang nhạc, đủ sáng và thẳng rồi tải lại.',
  },
  TASK_TIMEOUT: {
    title: 'Xử lý quá thời gian',
    hint: 'Hệ thống không nhận được phản hồi trong thời gian cho phép. Bạn có thể thử lại.',
  },
  AI_SERVICE_UNAVAILABLE: {
    title: 'Dịch vụ số hóa chưa sẵn sàng',
    hint: 'Chưa kết nối được dịch vụ xử lý ảnh. Hãy thử lại sau ít phút.',
  },
  CANCELLED_BY_USER: {
    title: 'Bạn đã hủy tác vụ',
    hint: 'Bạn có thể chạy lại trên các file đã tải hoặc tải file khác.',
  },
  JOB_REJECTED: {
    title: 'Yêu cầu bị từ chối',
    hint: 'Dịch vụ xử lý không chấp nhận dữ liệu này. Hãy thử tải lại file khác.',
  },
  ORIGINAL_FILE_MISSING: {
    title: 'Không còn file gốc',
    hint: 'File gốc không còn trên hệ thống nên không thể chạy lại. Hãy tải file lên lại.',
  },
  INTERNAL_ERROR: {
    title: 'Có lỗi trong quá trình xử lý',
    hint: 'Đã xảy ra lỗi ngoài dự kiến. Bạn có thể thử lại.',
  },
};

const GENERIC_ERROR: ErrorText = {
  title: 'Số hóa thất bại',
  hint: 'Đã xảy ra lỗi khi xử lý. Bạn có thể thử lại hoặc tải file khác.',
};

/** Câu thông báo tiếng Việt cho tác vụ FAILED hoặc CANCELLED, kèm chi tiết (ví dụ số trang) nếu có. */
export const describeTaskError = (task: AiTaskInfo): ErrorText & { detail: string } => {
  const { code, detail } = parseTaskError(task.errorMessage);
  const fallback = task.status === 'CANCELLED' ? TASK_ERROR_TEXTS.CANCELLED_BY_USER : GENERIC_ERROR;
  const text = TASK_ERROR_TEXTS[code] ?? fallback;
  return { ...text, detail };
};

/** Các cảnh báo (trang bị bỏ qua, góc nghiêng quá lớn...) trong resultData.warnings. */
export const getTaskWarnings = (task: AiTaskInfo): string[] => {
  const warnings = task.resultData?.warnings;
  return Array.isArray(warnings) ? warnings.filter((w): w is string => typeof w === 'string') : [];
};
