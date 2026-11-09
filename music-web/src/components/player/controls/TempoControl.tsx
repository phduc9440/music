import { PlayerPopover } from './PlayerPopover';
import { DEFAULT_TEMPO_PERCENT, MAX_TEMPO_PERCENT, MIN_TEMPO_PERCENT } from '../state/settings';

const PRESETS = [50, 75, 100];
const STEP = 5;

interface Props {
  /** Tempo hiện tại (% so với tempo gốc). */
  percent: number;
  /** Tempo gốc của bản nhạc (nốt đen mỗi phút) để hiện BPM thực. */
  baseBpm: number;
  onChange: (percent: number) => void;
  disabled?: boolean;
  /** Chỉ vẽ nội dung, dùng trong bottom sheet trên điện thoại. */
  inline?: boolean;
}

/** Điều khiển tempo 20–200%: thanh trượt bước 5%, ba mức nhanh 50 / 75 / 100%, nhấp đúp thanh trượt để về 100%. */
export function TempoControl({ percent, baseBpm, onChange, disabled, inline }: Props) {
  const bpm = Math.round((baseBpm * percent) / 100);
  const changed = percent !== DEFAULT_TEMPO_PERCENT;
  return (
    <PlayerPopover
      inline={inline}
      label={`Tốc độ phát: ${percent}% (${bpm} BPM)`}
      title="Tốc độ phát"
      disabled={disabled}
      buttonClassName={changed ? 'pl-chip--on' : undefined}
      trigger={
        <span className="pl-tempo__value">
          <strong>{percent}%</strong>
          <span className="pl-tempo__bpm">{bpm} BPM</span>
        </span>
      }
    >
      <div className="pl-tempo">
        <div className="pl-tempo__head">
          <span>Tốc độ</span>
          <output className="pl-tempo__out" aria-live="off">
            {percent}% · {bpm} BPM
          </output>
        </div>
        <input
          type="range"
          className="pl-range"
          min={MIN_TEMPO_PERCENT}
          max={MAX_TEMPO_PERCENT}
          step={STEP}
          value={percent}
          aria-label="Tốc độ phát (%)"
          aria-valuetext={`${percent}%, ${bpm} BPM`}
          onChange={(e) => onChange(Number(e.target.value))}
          onDoubleClick={() => onChange(DEFAULT_TEMPO_PERCENT)}
        />
        <div className="pl-tempo__scale" aria-hidden="true">
          <span>{MIN_TEMPO_PERCENT}%</span>
          <span>{MAX_TEMPO_PERCENT}%</span>
        </div>
        <div className="pl-tempo__presets" role="group" aria-label="Mức tốc độ nhanh">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={`pl-preset${percent === value ? ' pl-preset--active' : ''}`}
              aria-pressed={percent === value}
              onClick={() => onChange(value)}
            >
              {value}%
            </button>
          ))}
        </div>
      </div>
    </PlayerPopover>
  );
}
