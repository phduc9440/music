import { PlayerPopover } from './PlayerPopover';

interface Props {
  /** Đệm hợp âm đang bật. */
  on: boolean;
  /** Ô không ghi hợp âm có đánh lại hợp âm đang hiệu lực không. */
  carry: boolean;
  onToggle: () => void;
  onCarryChange: (on: boolean) => void;
  disabled?: boolean;
}

/** Một hàng công tắc (role="switch") có chữ và dòng giải thích. */
function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`pl-switch${disabled ? ' pl-switch--disabled' : ''}`}>
      <div className="pl-switch__text">
        <span className="pl-switch__label">{label}</span>
        {hint && <span className="pl-switch__hint">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`pl-switch__track${checked ? ' pl-switch__track--on' : ''}`}
        disabled={disabled}
        onClick={onChange}
      >
        <span className="pl-switch__thumb" />
      </button>
    </div>
  );
}

/**
 * Đệm hợp âm: bật/tắt toàn bộ, và chọn việc ô không ghi ký hiệu hợp âm thì đánh lại hợp âm đang hiệu lực hay để im.
 * Âm lượng đệm chỉnh trong Mixer (hàng "Hợp âm").
 */
export function ChordControl({ on, carry, onToggle, onCarryChange, disabled }: Props) {
  return (
    <PlayerPopover
      label={on ? 'Đệm hợp âm: đang bật' : 'Đệm hợp âm: đang tắt'}
      title="Đệm hợp âm"
      disabled={disabled}
      buttonClassName={on ? 'pl-chip--on' : undefined}
      trigger={<span>Hợp âm</span>}
    >
      <div className="pl-chords">
        <div className="pl-chords__head">Đệm hợp âm</div>
        <Switch label="Đệm hợp âm" checked={on} onChange={onToggle} />
        <Switch
          label="Đánh lại ở ô không ghi hợp âm"
          hint={
            carry
              ? 'Ô nào không ghi hợp âm sẽ đánh lại hợp âm đang hiệu lực ở đầu ô.'
              : 'Ô nào không ghi hợp âm sẽ im phần đệm; hợp âm chỉ đánh ở ô có ghi.'
          }
          checked={carry}
          disabled={!on}
          onChange={() => onCarryChange(!carry)}
        />
        <p className="pl-chords__note">Chỉnh to nhỏ của phần đệm trong Mixer (hàng "Hợp âm").</p>
      </div>
    </PlayerPopover>
  );
}
