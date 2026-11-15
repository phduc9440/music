import { PlayerPopover } from './PlayerPopover';
import { t } from '../../../i18n/core';

interface Props {
  /** Đệm hợp âm đang bật. */
  on: boolean;
  /** Ô không ghi hợp âm có đánh lại hợp âm đang hiệu lực không. */
  carry: boolean;
  onToggle: () => void;
  onCarryChange: (on: boolean) => void;
  disabled?: boolean;
  /** Chỉ vẽ nội dung, dùng trong bottom sheet trên điện thoại. */
  inline?: boolean;
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
export function ChordControl({ on, carry, onToggle, onCarryChange, disabled, inline }: Props) {
  return (
    <PlayerPopover
      inline={inline}
      label={on ? t('player.chords.label.on') : t('player.chords.label.off')}
      title={t('player.chords.title')}
      disabled={disabled}
      buttonClassName={on ? 'pl-chip--on' : undefined}
      trigger={<span>{t('player.chords.trigger')}</span>}
    >
      <div className="pl-chords">
        <div className="pl-chords__head">{t('player.chords.title')}</div>
        <Switch label={t('player.chords.title')} checked={on} onChange={onToggle} />
        <Switch
          label={t('player.chords.carry')}
          hint={carry ? t('player.chords.carryOn') : t('player.chords.carryOff')}
          checked={carry}
          disabled={!on}
          onChange={() => onCarryChange(!carry)}
        />
        <p className="pl-chords__note">{t('player.chords.note')}</p>
      </div>
    </PlayerPopover>
  );
}
