export interface HotkeyBinding {
  siteId: string;
  key: string;
}

export interface HotkeySettings {
  enabled: boolean;
  bindings: HotkeyBinding[];
}

/**
 * Default assignment order requested by the user: the function keys first,
 * then the number row. Sites are matched to these keys in dashboard order.
 */
export const DEFAULT_HOTKEY_SEQUENCE: readonly string[] = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
];

export const ALLOWED_HOTKEY_KEYS: ReadonlySet<string> = new Set(DEFAULT_HOTKEY_SEQUENCE);

export function isValidHotkeyKey(key: string): boolean {
  return ALLOWED_HOTKEY_KEYS.has(key);
}

/**
 * Resolves the effective key for every site.
 *
 * Explicit custom bindings win. Any remaining site (in the supplied order)
 * receives the next unused key from {@link DEFAULT_HOTKEY_SEQUENCE}. Sites that
 * run past the end of the sequence, or whose custom key is invalid/duplicated,
 * are left unbound.
 */
export function resolveHotkeyBindings(
  orderedSiteIds: readonly string[],
  settings: HotkeySettings,
): Map<string, string> {
  const resolved = new Map<string, string>();
  const usedKeys = new Set<string>();
  const orderedSiteIdSet = new Set(orderedSiteIds);
  const explicitSiteIds = new Set<string>();
  let nextDefaultKeyIndex = 0;

  const customBySite = new Map<string, string>();
  for (const binding of settings.bindings) {
    if (!orderedSiteIdSet.has(binding.siteId)) continue;
    explicitSiteIds.add(binding.siteId);
    if (!isValidHotkeyKey(binding.key)) continue;
    if (usedKeys.has(binding.key)) continue;
    if (customBySite.has(binding.siteId)) continue;
    customBySite.set(binding.siteId, binding.key);
    usedKeys.add(binding.key);
  }

  for (const siteId of orderedSiteIds) {
    const custom = customBySite.get(siteId);
    if (custom) {
      resolved.set(siteId, custom);
      continue;
    }

    // A site with an explicit (but cleared/invalid) binding stays unbound so
    // users can intentionally remove a hotkey without it being reassigned.
    if (explicitSiteIds.has(siteId)) continue;

    let nextKey: string | undefined;
    while (nextDefaultKeyIndex < DEFAULT_HOTKEY_SEQUENCE.length) {
      const candidate = DEFAULT_HOTKEY_SEQUENCE[nextDefaultKeyIndex];
      nextDefaultKeyIndex += 1;
      if (candidate && !usedKeys.has(candidate)) {
        nextKey = candidate;
        break;
      }
    }
    if (!nextKey) continue;
    resolved.set(siteId, nextKey);
    usedKeys.add(nextKey);
  }

  return resolved;
}
