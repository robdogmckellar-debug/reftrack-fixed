import type { JSX } from 'preact';

interface SpinnerProps {
  label?: string;
  size?: 'small' | 'medium' | 'large';
}

export function Spinner({ label = 'Loading', size = 'medium' }: SpinnerProps): JSX.Element {
  return (
    <span class={`ui-spinner-wrap ui-spinner-wrap--${size}`} role="status" aria-live="polite">
      <span class="ui-spinner" aria-hidden="true" />
      <span class="visually-hidden">{label}</span>
    </span>
  );
}
