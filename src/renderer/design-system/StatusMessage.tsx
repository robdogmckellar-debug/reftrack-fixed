import type { ComponentChildren, JSX } from 'preact';

interface StatusMessageProps {
  title: string;
  children?: ComponentChildren;
  tone?: 'neutral' | 'danger';
}

export function StatusMessage({
  title,
  children,
  tone = 'neutral',
}: StatusMessageProps): JSX.Element {
  return (
    <section
      class={`status-message status-message--${tone}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <h1>{title}</h1>
      {children ? <div class="status-message__body">{children}</div> : null}
    </section>
  );
}
