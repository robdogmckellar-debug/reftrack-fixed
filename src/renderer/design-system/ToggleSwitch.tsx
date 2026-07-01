import type { JSX } from 'preact';

export interface ToggleSwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  pending?: boolean;
  onChange(checked: boolean): void;
}

export function ToggleSwitch({
  id,
  label,
  description,
  checked,
  disabled = false,
  pending = false,
  onChange,
}: ToggleSwitchProps): JSX.Element {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div class={`ui-toggle${disabled || pending ? ' is-disabled' : ''}`}>
      <span class="ui-toggle__copy">
        <label class="ui-toggle__label" htmlFor={id}>
          {label}
        </label>
        {description ? (
          <span id={descriptionId} class="ui-toggle__description">
            {description}
          </span>
        ) : null}
      </span>

      <label class="ui-toggle__control" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled || pending}
          aria-describedby={descriptionId}
          aria-busy={pending || undefined}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span class="ui-toggle__track" aria-hidden="true">
          <span class="ui-toggle__thumb" />
        </span>
      </label>
    </div>
  );
}
