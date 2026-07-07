import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOTKEY_SEQUENCE,
  isValidHotkeyKey,
  resolveHotkeyBindings,
  type HotkeySettings,
} from '../../src/shared/hotkeys/bindings';

function settings(overrides: Partial<HotkeySettings> = {}): HotkeySettings {
  return { enabled: true, bindings: [], ...overrides };
}

describe('resolveHotkeyBindings', () => {
  it('assigns the default sequence (F1-F12 then digits) in order', () => {
    const siteIds = ['a', 'b', 'c'];
    const resolved = resolveHotkeyBindings(siteIds, settings());

    expect(resolved.get('a')).toBe('F1');
    expect(resolved.get('b')).toBe('F2');
    expect(resolved.get('c')).toBe('F3');
  });

  it('honours a custom binding and fills the rest with the next unused default keys', () => {
    const siteIds = ['a', 'b', 'c'];
    const resolved = resolveHotkeyBindings(
      siteIds,
      settings({ bindings: [{ siteId: 'b', key: 'F1' }] }),
    );

    expect(resolved.get('b')).toBe('F1');
    // 'a' skips F1 (taken by the custom binding) and gets the next free key.
    expect(resolved.get('a')).toBe('F2');
    expect(resolved.get('c')).toBe('F3');
  });

  it('overflows to the number row once the function keys are exhausted', () => {
    const siteIds = Array.from({ length: 14 }, (_, index) => `site-${index}`);
    const resolved = resolveHotkeyBindings(siteIds, settings());

    expect(resolved.get('site-11')).toBe('F12');
    expect(resolved.get('site-12')).toBe('1');
    expect(resolved.get('site-13')).toBe('2');
  });

  it('leaves sites unbound when the sequence runs out', () => {
    const siteIds = Array.from(
      { length: DEFAULT_HOTKEY_SEQUENCE.length + 2 },
      (_, index) => `site-${index}`,
    );
    const resolved = resolveHotkeyBindings(siteIds, settings());

    expect(resolved.size).toBe(DEFAULT_HOTKEY_SEQUENCE.length);
    expect(resolved.has(`site-${DEFAULT_HOTKEY_SEQUENCE.length}`)).toBe(false);
  });

  it('treats an explicit empty key as an intentionally disabled hotkey', () => {
    const siteIds = ['a', 'b'];
    const resolved = resolveHotkeyBindings(
      siteIds,
      settings({ bindings: [{ siteId: 'a', key: '' }] }),
    );

    expect(resolved.has('a')).toBe(false);
    // 'a' does not consume F1, so 'b' still receives the first default key.
    expect(resolved.get('b')).toBe('F1');
  });

  it('ignores duplicate custom keys (first binding wins) and unknown sites', () => {
    const siteIds = ['a', 'b'];
    const resolved = resolveHotkeyBindings(
      siteIds,
      settings({
        bindings: [
          { siteId: 'a', key: 'F5' },
          { siteId: 'b', key: 'F5' },
          { siteId: 'ghost', key: 'F6' },
        ],
      }),
    );

    expect(resolved.get('a')).toBe('F5');
    // 'b' explicitly asked for the (already taken) F5, so it stays unbound
    // rather than silently hijacking a default key.
    expect(resolved.has('b')).toBe(false);
    expect(resolved.has('ghost')).toBe(false);
  });
});

describe('isValidHotkeyKey', () => {
  it('accepts supported keys and rejects everything else', () => {
    expect(isValidHotkeyKey('F1')).toBe(true);
    expect(isValidHotkeyKey('F12')).toBe(true);
    expect(isValidHotkeyKey('0')).toBe(true);
    expect(isValidHotkeyKey('')).toBe(false);
    expect(isValidHotkeyKey('F13')).toBe(false);
    expect(isValidHotkeyKey('Ctrl')).toBe(false);
  });
});
