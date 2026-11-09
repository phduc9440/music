import type { AiTaskInfo, OmrMeasure, TaskStatus } from '../types';

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

/** 5 bước của quy trình số hóa (đặc tả mục 2.2), cả 5 bước đều chạy thật. */
export const OMR_STEPS: OmrStepDef[] = [
  { key: 'SPLIT_PDF', label: 'Tách trang PDF', available: true },
  { key: 'PREPROCESS', label: 'Tiền xử lý ảnh', available: true },
  { key: 'INFERENCE', label: 'Nhận diện ký hiệu', available: true },
  { key: 'MERGE', label: 'Ghép các trang', available: true },
  { key: 'EXPORT', label: 'Xuất MusicXML và MIDI', available: true },
];

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
  RECOGNITION_EMPTY: {
    title: 'Không nhận diện được nốt nhạc nào',
    hint: 'Hệ thống không đọc ra nốt nào từ các trang. Hãy dùng ảnh rõ, thẳng, đủ sáng hoặc PDF chất lượng cao hơn.',
  },
  MERGE_SPINE_MISMATCH: {
    title: 'Các trang không khớp nhau',
    hint: 'Số khuông nhạc của các trang khác nhau nên không ghép được thành một bản nhạc. Hãy kiểm tra thứ tự và nội dung trang.',
  },
  KERN_PARSE_ERROR: {
    title: 'Kết quả nhận diện bị lỗi cú pháp',
    hint: 'Bản kern sau khi ghép không đọc được. Bạn có thể xem bản kern để gỡ lỗi hoặc thử lại.',
  },
  EXPORT_ERROR: {
    title: 'Không xuất được MusicXML',
    hint: 'Đã nhận diện xong nhưng không chuyển được sang MusicXML hoặc MIDI. Bạn có thể nhận diện lại hoặc dùng ảnh rõ hơn.',
  },
  MODEL_NOT_LOADED: {
    title: 'Mô hình nhận diện chưa sẵn sàng',
    hint: 'Dịch vụ chưa nạp xong mô hình Transcoda. Hãy đợi ít phút rồi thử lại.',
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
export const MEASURE_FLAG_LABELS: Record<OmrMeasure['flags'][number], string> = {
  DURATION: 'Tổng trường độ không khớp số chỉ nhịp',
  COUNT_MISMATCH: 'Số ô của hệ này khác số ô trên ảnh, có thể thừa hoặc thiếu ô',
};

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
