export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div>
        <span className="row-title">{label}</span>
        {description ? <p>{description}</p> : null}
      </div>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}
