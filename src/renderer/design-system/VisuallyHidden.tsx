import type { ComponentChildren, JSX } from 'preact';

export function VisuallyHidden({ children }: { children: ComponentChildren }): JSX.Element {
  return <span class="visually-hidden">{children}</span>;
}
