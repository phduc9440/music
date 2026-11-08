/**
 * Mute / Solo / âm lượng theo track (mỗi track là một khuông của một part). Chỉ chứa hàm thuần để engine, hook và
 * giao diện dùng chung một quy tắc.
 *
 * Quy tắc: có ít nhất một track Solo → chỉ track Solo phát; ngược lại track Mute không phát. Bản nhạc chỉ có một
 * track thì bỏ qua toàn bộ (không có giao diện để bỏ tắt tiếng, nên cài đặt cũ còn sót không được làm bản nhạc im).
 */

export interface TrackMix {
  mute: boolean;
  solo: boolean;
  /** Âm lượng 0–100 (%). */
  volume: number;
}

/** Chỉ lưu các track khác mặc định. */
export type MixerState = Readonly<Record<string, TrackMix>>;

export const DEFAULT_TRACK_MIX: TrackMix = { mute: false, solo: false, volume: 100 };
export const EMPTY_MIXER: MixerState = {};

export const clampVolume = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : DEFAULT_TRACK_MIX.volume;

export const mixOf = (mixer: MixerState, trackId: string): TrackMix => mixer[trackId] ?? DEFAULT_TRACK_MIX;

const isDefaultMix = (mix: TrackMix): boolean => !mix.mute && !mix.solo && mix.volume === DEFAULT_TRACK_MIX.volume;

/** Có ít nhất một track Solo trong `trackIds`. */
export const hasSolo = (mixer: MixerState, trackIds: readonly string[]): boolean =>
  trackIds.some((id) => mixOf(mixer, id).solo);

/** Độ lợi 0–1 của một track sau khi áp Mute / Solo / âm lượng. */
export function trackGain(mixer: MixerState, trackIds: readonly string[], trackId: string): number {
  if (trackIds.length < 2) return 1;
  const mix = mixOf(mixer, trackId);
  if (hasSolo(mixer, trackIds)) return mix.solo ? mix.volume / 100 : 0;
  return mix.mute ? 0 : mix.volume / 100;
}

/** Các track không phát ra tiếng (Mute, không Solo khi có Solo, hoặc âm lượng 0). */
export function silentTracks(mixer: MixerState, trackIds: readonly string[]): Set<string> {
  return new Set(trackIds.filter((id) => trackGain(mixer, trackIds, id) === 0));
}

/** Trả về bản mới với `patch` áp lên track `trackId`; track trở về mặc định thì bị bỏ khỏi bảng. */
export function withTrackMix(mixer: MixerState, trackId: string, patch: Partial<TrackMix>): MixerState {
  const merged: TrackMix = { ...mixOf(mixer, trackId), ...patch };
  merged.volume = clampVolume(merged.volume);
  const next = { ...mixer };
  if (isDefaultMix(merged)) delete next[trackId];
  else next[trackId] = merged;
  return next;
}

/** Bỏ các mục không còn khớp với `trackIds` (sau khi sửa bản nhạc làm đổi số khuông). */
export function pruneMixer(mixer: MixerState, trackIds: readonly string[]): MixerState {
  const keys = Object.keys(mixer);
  if (keys.every((id) => trackIds.includes(id))) return mixer;
  const next: Record<string, TrackMix> = {};
  for (const id of keys) if (trackIds.includes(id)) next[id] = mixer[id];
  return next;
}

/** Đọc bảng mixer từ dữ liệu không đáng tin (localStorage): bỏ mục sai kiểu, kẹp âm lượng, bỏ mục mặc định. */
export function sanitizeMixer(raw: unknown): MixerState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_MIXER;
  const out: Record<string, TrackMix> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(\d+:\d+|chords)$/.test(id) || !value || typeof value !== 'object') continue;
    const v = value as Partial<Record<keyof TrackMix, unknown>>;
    const mix: TrackMix = {
      mute: v.mute === true,
      solo: v.solo === true,
      volume: typeof v.volume === 'number' ? clampVolume(v.volume) : DEFAULT_TRACK_MIX.volume,
    };
    if (!isDefaultMix(mix)) out[id] = mix;
  }
  return out;
}
