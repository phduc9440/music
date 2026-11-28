/**
 * Tổng hợp âm thanh bản nhạc ngay trên trình duyệt (khi máy chủ chưa cài MuseScore): chạy đúng bộ máy phát của trình
 * phát (mẫu âm piano, nhạc cụ tổng hợp, đệm hợp âm) trên một OfflineAudioContext, nên nghe giống hệt lúc bấm Phát.
 */
import { ScoreDocument } from '../../editor/core/ScoreDocument';
import { detectInstrument } from '../../editor/audio/instruments';
import { getSharedAudioContext } from '../../editor/audio/previewTone';
import { PlayerEngine } from '../../player/engine/PlayerEngine';
import { getPianoSampler } from '../../player/engine/sampler';
import { buildTimeline, CHORD_TRACK_ID } from '../../player/engine/timeline';
import type { Timeline } from '../../player/engine/timeline';
import type { MixerState } from '../../player/state/mixer';
import { loadPlayerSettings, loadScoreSettings } from '../../player/state/settings';
import type { ExportHands, ExportOptions } from '../../../types/export';
import { encodeWav } from './fileWriters';

const SAMPLE_RATE = 44100;
/** Ngân thêm sau nốt cuối (giây) để tiếng không bị cắt cụt. */
const TAIL_S = 2.5;
/** Bước đồng hồ giả khi hẹn giờ nốt (giây); bộ máy phát nhìn trước 0,25 giây nên bước nhỏ hơn thế. */
const STEP_S = 0.2;
/** Giới hạn độ dài tổng hợp trên trình duyệt (bộ nhớ: 15 phút stereo khoảng 300 MB). */
export const MAX_BROWSER_AUDIO_S = 15 * 60;

export class AudioTooLongError extends Error {}

/** Mute / Solo khi chỉ xuất một tay: tắt khuông của tay kia và phần đệm hợp âm (thuần tính toán, có test). */
export function handsMixer(timeline: Pick<Timeline, 'tracks'>, hands: ExportHands): MixerState {
  if (hands === 'BOTH') return {};
  const keep = hands === 'RIGHT' ? 1 : 2;
  const mixer: Record<string, { mute: boolean; solo: boolean; volume: number }> = {};
  for (const track of timeline.tracks) {
    if (track.id === CHORD_TRACK_ID || track.staff !== keep) mixer[track.id] = { mute: true, solo: false, volume: 100 };
  }
  return mixer;
}

/** Thời lượng (giây) của bản nhạc ở tempo đã chọn. */
export const audioSeconds = (timeline: Pick<Timeline, 'total'>, tempoPercent: number): number =>
  timeline.total / (tempoPercent / 100);

export interface RenderAudioOptions extends ExportOptions {
  /** Chỉ tổng hợp bấy nhiêu giây đầu (nghe thử). */
  limitSeconds?: number;
}

/** Tổng hợp bản nhạc thành file WAV (PCM 16 bit, 44,1 kHz, stereo). */
export async function renderScoreWav(
  xml: string,
  scoreId: string,
  options: RenderAudioOptions,
  fallbackBpm?: number | null,
): Promise<Blob> {
  const doc = ScoreDocument.parse(xml);
  const saved = loadScoreSettings(scoreId);
  const timeline = buildTimeline(doc, fallbackBpm, loadPlayerSettings().chordStyle);
  if (timeline.events.length === 0) throw new Error('empty score');
  const full = audioSeconds(timeline, options.tempoPercent);
  if (!options.limitSeconds && full > MAX_BROWSER_AUDIO_S) throw new AudioTooLongError();
  const seconds = Math.min(full, options.limitSeconds ?? Infinity);

  // Mẫu âm piano nạp một lần cho cả trang (dùng chung với trình phát); lỗi thì bộ máy phát tự dùng piano tổng hợp
  const sampler = getPianoSampler();
  const live = getSharedAudioContext();
  if (live) await sampler.load(live, loadPlayerSettings().quality).catch(() => undefined);

  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + TAIL_S) * SAMPLE_RATE), SAMPLE_RATE);
  let clock = 0;
  const engine = new PlayerEngine({
    ctx,
    sampler,
    now: () => clock,
    autoTick: false,
    tempoPercent: options.tempoPercent,
    transpose: options.transpose,
    mixer: handsMixer(timeline, options.hands),
    chordCarry: saved.chordCarry,
  });
  try {
    engine.setTimeline(timeline, (part) => detectInstrument(doc, part));
    engine.play(0);
    while (engine.getStatus() === 'playing' && clock < seconds) {
      clock += STEP_S;
      engine.tick();
    }
    const rendered = await ctx.startRendering();
    const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
    return new Blob([encodeWav(channels, rendered.sampleRate)], { type: 'audio/wav' });
  } finally {
    try {
      engine.dispose();
    } catch {
      // context đã tổng hợp xong: không còn giọng nào để tắt
    }
  }
}
