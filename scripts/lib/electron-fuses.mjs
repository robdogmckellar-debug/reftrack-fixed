import { FuseVersion, FuseV1Options, flipFuses, getCurrentFuseWire } from '@electron/fuses';

if (
  !FuseVersion ||
  !FuseV1Options ||
  typeof flipFuses !== 'function' ||
  typeof getCurrentFuseWire !== 'function'
) {
  throw new Error('The installed @electron/fuses package does not expose the expected API.');
}

// getCurrentFuseWire() returns the raw fuse bytes, where ASCII "0" means
// disabled and ASCII "1" means enabled. We compare against these wire bytes
// rather than the FuseState enum so the check is independent of enum values.
const FuseWireState = Object.freeze({
  DISABLE: '0'.charCodeAt(0),
  ENABLE: '1'.charCodeAt(0),
});

export { FuseVersion, FuseV1Options, FuseWireState, flipFuses, getCurrentFuseWire };
