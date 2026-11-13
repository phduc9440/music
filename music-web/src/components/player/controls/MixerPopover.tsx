import { PlayerPopover } from './PlayerPopover';
import { IconMixer } from './PlayerIcons';
import { DEFAULT_TRACK_MIX, hasSolo, mixOf, silentTracks } from '../state/mixer';
import type { MixerState, TrackMix } from '../state/mixer';
import type { TimelineTrack } from '../engine/timeline';
import { t } from '../../../i18n/core';

interface Props {
  tracks: readonly TimelineTrack[];
  mixer: MixerState;
  onChange: (trackId: string, patch: Partial<TrackMix>) => void;
  onReset: () => void;
  disabled?: boolean;
  /** Chỉ vẽ nội dung, dùng trong bottom sheet trên điện thoại. */
  inline?: boolean;
}

/**
 * Mixer theo khuông: mỗi hàng một track có nút M (tắt tiếng), S (chỉ nghe track này) và âm lượng 0–100%. Có Solo thì
 * chỉ track Solo phát. Bản nhạc chỉ có một khuông thì nút bị khóa kèm gợi ý.
 */
export function MixerPopover({ tracks, mixer, onChange, onReset, disabled, inline }: Props) {
  const single = tracks.length < 2;
  const ids = tracks.map((t) => t.id);
  const silent = silentTracks(mixer, ids);
  const soloActive = hasSolo(mixer, ids);
  const allSilent = !single && silent.size === tracks.length;
  const touched = !single && Object.keys(mixer).length > 0;

  return (
    <PlayerPopover
      inline={inline}
      label={t('player.mixer.label')}
      title={single ? t('player.mixer.single') : t('player.mixer.hint')}
      disabled={disabled || single}
      buttonClassName={touched ? 'pl-chip--on' : undefined}
      trigger={
        <span className="pl-chip__inner">
          <IconMixer />
          <span className="pl-chip__text">Mixer</span>
        </span>
      }
    >
      <div className="pl-mix">
        <div className="pl-mix__head">
          <span>{t('player.mixer.staff')}</span>
          <button type="button" className="pl-link pl-mix__reset" onClick={onReset} disabled={!touched}>
            {t('player.mixer.reset')}
          </button>
        </div>
        {tracks.map((track) => {
          const mix = mixOf(mixer, track.id);
          const quiet = silent.has(track.id);
          return (
            <div key={track.id} className={`pl-mix__row${quiet ? ' pl-mix__row--silent' : ''}`}>
              <span className="pl-mix__name" title={track.label}>
                {track.label}
              </span>
              <button
                type="button"
                className={`pl-mix__btn pl-mix__btn--mute${mix.mute ? ' pl-mix__btn--on' : ''}`}
                aria-pressed={mix.mute}
                aria-label={t('player.mixer.muteLabel', { name: track.label })}
                title={t('player.mixer.muteTitle')}
                onClick={() => onChange(track.id, { mute: !mix.mute })}
              >
                M
              </button>
              <button
                type="button"
                className={`pl-mix__btn pl-mix__btn--solo${mix.solo ? ' pl-mix__btn--on' : ''}`}
                aria-pressed={mix.solo}
                aria-label={t('player.mixer.soloLabel', { name: track.label })}
                title={t('player.mixer.soloTitle')}
                onClick={() => onChange(track.id, { solo: !mix.solo })}
              >
                S
              </button>
              <input
                type="range"
                className="pl-range pl-mix__vol"
                min={0}
                max={100}
                step={5}
                value={mix.volume}
                aria-label={t('player.mixer.volume', { name: track.label })}
                aria-valuetext={`${mix.volume}%`}
                onChange={(e) => onChange(track.id, { volume: Number(e.target.value) })}
                onDoubleClick={() => onChange(track.id, { volume: DEFAULT_TRACK_MIX.volume })}
              />
              <output className="pl-mix__pct">{mix.volume}%</output>
            </div>
          );
        })}
        {allSilent && (
          <p className="pl-mix__note" role="status">
            {t('player.mixer.allSilent')}
          </p>
        )}
        {soloActive && !allSilent && (
          <p className="pl-mix__note" role="status">
            {t('player.mixer.soloActive')}
          </p>
        )}
      </div>
    </PlayerPopover>
  );
}
