import type { MixerState } from '../player/state/mixer';
import type { ExportFormat, ExportHands, ExportOptions, PdfOptions } from '../../types/export';
import type { TaskStatus } from '../../types';
import { hasKey, t } from '../../i18n/core';
import { getErrorCode, getErrorMessage } from '../../utils/score';

export const EXPORT_BITRATES = [128, 192, 320] as const;
export const DEFAULT_BITRATE = 192;
export const EXPORT_TASK_TYPES = ['AUDIO_SYNTHESIS', 'FORMAT_CONVERSION'];

export const isTaskFinished = (status: TaskStatus): boolean =>
  status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';

/** Tên các bước của tác vụ xuất file (khớp AiTaskStep ở BE); bước lạ thì giữ nguyên mã. */
export const stepLabel = (step?: string | null): string => {
  if (!step) return t('export.steps.WAITING');
  return hasKey(`export.steps.${step}`) ? t(`export.steps.${step}`) : step;
};

/** Mã lỗi nằm đầu `errorMessage` của task, dạng "MÃ" hoặc "MÃ: chi tiết". Mã lạ thì giữ nguyên thông điệp. */
export function translateTaskError(message?: string | null): string {
  if (!message) return t('export.failed');
  const code = message.split(':')[0].trim();
  return hasKey(`export.taskErrors.${code}`) ? t(`export.taskErrors.${code}`) : message;
}

/** Thông báo lỗi khi gọi API xuất file (lỗi mạng hoặc mã nghiệp vụ 27xx). */
export function exportErrorMessage(err: unknown): string {
  const code = getErrorCode(err);
  if (code && hasKey(`export.apiErrors.${code}`)) return t(`export.apiErrors.${code}`);
  return getErrorMessage(err, t('export.failed'));
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
    return t('export.validation.tempo');
  if (!Number.isInteger(options.transpose) || options.transpose < -12 || options.transpose > 12)
    return t('export.validation.transpose');
  if (format === 'MP3' && !(EXPORT_BITRATES as readonly number[]).includes(options.bitrate ?? DEFAULT_BITRATE))
    return t('export.validation.bitrate');
  if (options.hands !== 'BOTH' && staffCount !== 2) return t('export.validation.hands');
  return null;
}

/** Kiểm tra tùy chọn PDF trước khi gửi (cùng quy tắc với BE). Trả về lỗi tiếng Việt hoặc null. */
export function validatePdfOptions(options: PdfOptions): string | null {
  if (options.staffSpaceMm < 1.5 || options.staffSpaceMm > 2.2) return t('export.validation.staffSize');
  if (!Number.isInteger(options.marginMm) || options.marginMm < 10 || options.marginMm > 25)
    return t('export.validation.margin');
  return null;
}
