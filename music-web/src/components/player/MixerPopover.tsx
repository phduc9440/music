import { PlayerPopover } from './PlayerPopover';
import { IconMixer } from './PlayerIcons';
import { DEFAULT_TRACK_MIX, hasSolo, mixOf, silentTracks } from './mixer';
import type { MixerState, TrackMix } from './mixer';
import type { TimelineTrack } from './timeline';

interface Props {
  tracks: readonly TimelineTrack[];
  mixer: MixerState;
  onChange: (trackId: string, patch: Partial<TrackMix>) => void;
  onReset: () => void;
  disabled?: boolean;
}

/**
 * Mixer theo khuông: mỗi hàng một track có nút M (tắt tiếng), S (chỉ nghe track này) và âm lượng 0–100%. Có Solo thì
 * chỉ track Solo phát. Bản nhạc chỉ có một khuông thì nút bị khóa kèm gợi ý.
 */
export function MixerPopover({ tracks, mixer, onChange, onReset, disabled }: Props) {
  const single = tracks.length < 2;
  const ids = tracks.map((t) => t.id);
  const silent = silentTracks(mixer, ids);
  const soloActive = hasSolo(mixer, ids);
  const allSilent = !single && silent.size === tracks.length;
  const touched = !single && Object.keys(mixer).length > 0;

  return (
    <PlayerPopover
      label="Mixer các khuông"
      title={single ? 'Bản nhạc chỉ có một khuông' : 'Tắt tiếng, chỉ nghe một khuông, chỉnh âm lượng'}
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
          <span>Khuông</span>
          <button type="button" className="pl-link pl-mix__reset" onClick={onReset} disabled={!touched}>
            Đặt lại
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
                aria-label={`Tắt tiếng ${track.label}`}
                title="Tắt tiếng (M)"
                onClick={() => onChange(track.id, { mute: !mix.mute })}
              >
                M
              </button>
              <button
                type="button"
                className={`pl-mix__btn pl-mix__btn--solo${mix.solo ? ' pl-mix__btn--on' : ''}`}
                aria-pressed={mix.solo}
                aria-label={`Chỉ nghe ${track.label}`}
                title="Chỉ nghe khuông này (S)"
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
                aria-label={`Âm lượng ${track.label}`}
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
            Đang tắt tiếng toàn bộ
          </p>
        )}
        {soloActive && !allSilent && (
          <p className="pl-mix__note" role="status">
            Đang chỉ nghe các khuông Solo
          </p>
        )}
      </div>
    </PlayerPopover>
  );
}
