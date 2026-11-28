/** Một hàng công tắc (role="switch") có chữ và dòng giải thích, dùng trong các hộp nổi của trình phát. */
export function PlayerSwitch({
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
