import { describe, expect, it } from 'vitest';

import {
  FuseVersion,
  FuseV1Options,
  FuseWireState,
  flipFuses,
  getCurrentFuseWire,
} from '../../scripts/lib/electron-fuses.mjs';

describe('@electron/fuses CommonJS interoperability', () => {
  it('loads the public API through the package default export', () => {
    expect(FuseVersion.V1).toBe('1');
    expect(typeof flipFuses).toBe('function');
    expect(typeof getCurrentFuseWire).toBe('function');
    expect(FuseV1Options.RunAsNode).toBe(0);
    expect(FuseV1Options.GrantFileProtocolExtraPrivileges).toBe(7);
  });

  it('uses the raw fuse-wire bytes returned by getCurrentFuseWire', () => {
    expect(FuseWireState.DISABLE).toBe('0'.charCodeAt(0));
    expect(FuseWireState.ENABLE).toBe('1'.charCodeAt(0));
  });
});
