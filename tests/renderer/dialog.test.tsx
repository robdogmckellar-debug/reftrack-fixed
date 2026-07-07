// @vitest-environment jsdom

import type { RefObject } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { Dialog } from '../../src/renderer/design-system/Dialog';

afterEach(() => {
  cleanup();
});

/**
 * Reproduces the focus-stealing bug: a parent that re-renders on every keystroke
 * (and therefore passes a fresh `onClose` identity each render) must not cause the
 * dialog to yank focus back to `initialFocusRef` while the user is typing in
 * another field.
 */
function Harness(): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  return (
    <Dialog
      open
      title="Test dialog"
      onClose={() => {
        /* fresh identity on every render */
      }}
      initialFocusRef={nameRef as RefObject<HTMLElement>}
    >
      <input ref={nameRef} aria-label="Category name" />
      <input
        aria-label="Other field"
        value={value}
        onInput={(event) => setValue((event.target as HTMLInputElement).value)}
      />
    </Dialog>
  );
}

describe('Dialog', () => {
  it('keeps focus on the field being typed in across parent re-renders', async () => {
    render(<Harness />);

    const nameInput = screen.getByLabelText('Category name') as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(nameInput));

    const otherInput = screen.getByLabelText('Other field') as HTMLInputElement;
    otherInput.focus();
    expect(document.activeElement).toBe(otherInput);

    fireEvent.input(otherInput, { target: { value: 'h' } });
    await Promise.resolve();
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    expect(document.activeElement).toBe(otherInput);
    expect(otherInput.value).toBe('h');
  });
});
