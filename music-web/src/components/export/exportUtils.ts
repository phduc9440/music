import type { MixerState } from '../player/mixer';
import type { ExportFormat, ExportHands, ExportOptions, PdfOptions } from '../../types/export';
import type { TaskStatus } from '../../types';
import { getErrorCode, getErrorMessage } from '../../utils/score';

export const EXPORT_BITRATES = [128, 192, 320] as const;
export const DEFAULT_BITRATE = 192;
export const EXPORT_TASK_TYPES = ['AUDIO_SYNTHESIS', 'FORMAT_CONVERSION'];

export const isTaskFinished = (status: TaskStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';

/** Tên các bước của tác vụ xuất file (khớp AiTaskStep ở BE). */
export const EXPORT_STEP_LABELS: Record<string, string> = {
  PREPARE: 'Chuẩn bị bản nhạc',
  RENDER: 'Đang tổng hợp âm thanh',
  SAVE: 'Lưu file',
};

export const stepLabel = (step?: string | null): string => (step ? (EXPORT_STEP_LABELS[step] ?? step) : 'Đang chờ');

const TASK_ERROR_LABELS: Record<string, string> = {
  EXPORT_ERROR: 'Không xuất được file, vui lòng thử lại',
  MUSESCORE_TIMEOUT: 'Xuất file quá lâu nên đã dừng. Hãy thử lại hoặc tăng tempo để bản nhạc ngắn hơn',
  TASK_TIMEOUT: 'Tác vụ xuất file quá hạn, vui lòng thử lại',
  AI_SERVICE_UNAVAILABLE: 'Dịch vụ xử lý nhạc tạm thời không khả dụng, vui lòng thử lại sau',
  CANCELLED_BY_USER: 'Đã hủy',
};

/** Mã lỗi nằm đầu `errorMessage` của task, dạng "MÃ" hoặc "MÃ: chi tiết". Mã lạ thì giữ nguyên thông điệp. */
export function translateTaskError(message?: string | null): string {
  if (!message) return 'Không xuất được file, vui lòng thử lại';
  const code = message.split(':')[0].trim();
  return TASK_ERROR_LABELS[code] ?? message;
}

const API_ERROR_LABELS: Record<number, string> = {
  1002: 'Bạn không có quyền xuất bản nhạc này',
  2001: 'Bản nhạc không tồn tại',
  2012: 'Bản nhạc chưa có MusicXML, hãy đợi số hóa xong',
  2701: 'Tùy chọn xuất file không hợp lệ',
  2702: 'Bản nhạc quá dài để xuất âm thanh (tối đa 20 phút), hãy tăng tempo',
  2703: 'Bạn đang xuất quá nhiều file, vui lòng đợi các tác vụ đang chạy hoàn tất',
  2704: 'Máy chủ chưa sẵn sàng xuất file, vui lòng liên hệ quản trị viên',
};

/** Thông báo lỗi khi gọi API xuất file (lỗi mạng hoặc mã nghiệp vụ 27xx). */
export function exportErrorMessage(err: unknown): string {
  const code = getErrorCode(err);
  return (code && API_ERROR_LABELS[code]) || getErrorMessage(err, 'Không xuất được file, vui lòng thử lại');
}

/**
 * Tay mặc định khi xuất, suy từ Mute/Solo trong Player. Chỉ áp dụng cho bản nhạc có đúng 2 khuông; track có dạng
 * "{part}:{staff}", staff 1 là tay phải, staff 2 là tay trái.
 */
export function handsFromMixer(mixer: MixerState, staffCount: number | null | undefined): ExportHands {
  if (staffCount !== 2) return 'BOTH';
  const entries = Object.entries(mixer).filter(([id]) => /:[12]$/.test(id));
  const solo = new Set(entries.filter(([, mix]) => mix.solo).map(([id]) => id.slice(-1)));
  if (solo.size === 1) return solo.has('1') ? 'RIGHT' : 'LEFT';
  if (solo.size > 1) return 'BOTH';
  const silent = new Set(entries.filter(([, mix]) => mix.mute || mix.volume === 0).map(([id]) => id.slice(-1)));
  if (silent.has('1') && !silent.has('2')) return 'LEFT';
  if (silent.has('2') && !silent.has('1')) return 'RIGHT';
  return 'BOTH';
}

const HAND_SUFFIX: Record<ExportHands, string> = { BOTH: '', RIGHT: '-tay-phai', LEFT: '-tay-trai' };

/** Tên file gợi ý, ví dụ "Bài ca-75pct-+2.mp3"; chỉ ghi những tùy chọn khác mặc định. */
export function exportFileName(title: string, format: ExportFormat, options: Partial<ExportOptions>): string {
  const tempo = options.tempoPercent ?? 100;
  const transpose = options.transpose ?? 0;
  let name = title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'ban-nhac';
  if (tempo !== 100) name += `-${tempo}pct`;
  if (transpose !== 0) name += `-${transpose > 0 ? '+' : ''}${transpose}`;
  name += HAND_SUFFIX[options.hands ?? 'BOTH'];
  return `${name}.${format.toLowerCase()}`;
}

/** Kiểm tra tùy chọn trước khi gửi (cùng quy tắc với BE: ExportOptionsValidator). Trả về lỗi tiếng Việt hoặc null. */
export function validateExportOptions(
  format: ExportFormat,
  options: ExportOptions,
  staffCount: number | null | undefined,
): string | null {
  if (!Number.isInteger(options.tempoPercent) || options.tempoPercent < 20 || options.tempoPercent > 200)
    return 'Tempo phải từ 20% đến 200%';
  if (!Number.isInteger(options.transpose) || options.transpose < -12 || options.transpose > 12)
    return 'Chuyển giọng phải từ -12 đến +12 nửa cung';
  if (format === 'MP3' && !(EXPORT_BITRATES as readonly number[]).includes(options.bitrate ?? DEFAULT_BITRATE))
    return 'Chất lượng MP3 phải là 128, 192 hoặc 320 kbps';
  if (options.hands !== 'BOTH' && staffCount !== 2) return 'Chỉ chọn riêng một tay được với bản nhạc có 2 khuông';
  return null;
}

/** Kiểm tra tùy chọn PDF trước khi gửi (cùng quy tắc với BE). Trả về lỗi tiếng Việt hoặc null. */
export function validatePdfOptions(options: PdfOptions): string | null {
  if (options.staffSpaceMm < 1.5 || options.staffSpaceMm > 2.2) return 'Cỡ khuông phải từ 1,5 đến 2,2 mm';
  if (!Number.isInteger(options.marginMm) || options.marginMm < 10 || options.marginMm > 25)
    return 'Lề phải từ 10 đến 25 mm';
  return null;
}
