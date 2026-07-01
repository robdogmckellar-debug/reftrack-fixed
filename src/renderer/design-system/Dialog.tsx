import type { ComponentChildren, JSX, RefObject } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

import { getFocusableElements, trapTabKey } from '../accessibility/focus-utils';

interface DialogProps {
  open: boolean;
  title: string;
  children: ComponentChildren;
  onClose: () => void;
  description?: string;
  footer?: ComponentChildren;
  initialFocusRef?: RefObject<HTMLElement>;
  closeOnBackdrop?: boolean;
}

export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  initialFocusRef,
  closeOnBackdrop = true,
}: DialogProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestedTarget = initialFocusRef?.current;
    const target =
      requestedTarget instanceof HTMLElement
        ? requestedTarget
        : (getFocusableElements(panel)[0] ?? panel);
    queueMicrotask(() => target.focus());

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      trapTabKey(event, panel);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (previousFocus?.isConnected) queueMicrotask(() => previousFocus.focus());
    };
  }, [initialFocusRef, onClose, open]);

  if (!open) return null;

  return (
    <div
      class="ui-dialog-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        class="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header class="ui-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button
            class="ui-dialog__close"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div class="ui-dialog__body">{children}</div>
        {footer ? <footer class="ui-dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
