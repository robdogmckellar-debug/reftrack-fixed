import type { ComponentChildren, JSX, Ref } from 'preact';

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  size?: 'small' | 'medium';
  pending?: boolean;
  leadingIcon?: ComponentChildren;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function Button({
  children,
  class: className,
  variant = 'secondary',
  size = 'medium',
  pending = false,
  leadingIcon,
  buttonRef,
  disabled,
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  const classes = ['ui-button', `ui-button--${variant}`, `ui-button--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...props}
      ref={buttonRef ?? null}
      type={type}
      class={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? <span class="ui-spinner ui-spinner--button" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
    </button>
  );
}
