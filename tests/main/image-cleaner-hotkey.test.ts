import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  globalShortcut: { register: vi.fn(), unregister: vi.fn() },
}));

import { ImageCleanerHotkey } from '../../src/main/services/image-cleaner-hotkey';

describe('ImageCleanerHotkey', () => {
  it('registers an accelerator and invokes the trigger when pressed', () => {
    const onTrigger = vi.fn();
    let captured: (() => void) | null = null;
    const register = vi.fn((_accelerator: string, callback: () => void) => {
      captured = callback;
      return true;
    });
    const hotkey = new ImageCleanerHotkey({ onTrigger, register, unregister: vi.fn() });

    expect(hotkey.apply('CommandOrControl+Shift+K')).toEqual({ ok: true });
    expect(register).toHaveBeenCalledWith('CommandOrControl+Shift+K', expect.any(Function));
    expect(hotkey.accelerator).toBe('CommandOrControl+Shift+K');

    captured?.();
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it('reports a conflict when the accelerator is already taken', () => {
    const hotkey = new ImageCleanerHotkey({
      onTrigger: vi.fn(),
      register: () => false,
      unregister: vi.fn(),
    });
    expect(hotkey.apply('CommandOrControl+K')).toEqual({ ok: false, reason: 'conflict' });
    expect(hotkey.accelerator).toBeNull();
  });

  it('reports invalid when registration throws', () => {
    const hotkey = new ImageCleanerHotkey({
      onTrigger: vi.fn(),
      register: () => {
        throw new Error('malformed accelerator');
      },
      unregister: vi.fn(),
    });
    expect(hotkey.apply('not-a-real-accelerator')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('unregisters the previous accelerator on replace and on clear', () => {
    const unregister = vi.fn();
    const hotkey = new ImageCleanerHotkey({
      onTrigger: vi.fn(),
      register: () => true,
      unregister,
    });

    hotkey.apply('CommandOrControl+K');
    hotkey.apply('CommandOrControl+J');
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+K');

    expect(hotkey.apply(null)).toEqual({ ok: true });
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+J');
    expect(hotkey.accelerator).toBeNull();
  });
});
