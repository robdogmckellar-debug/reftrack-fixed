import electronFuses from '@electron/fuses';

const { FuseV1Options, getCurrentFuseWire } = electronFuses;

if (!FuseV1Options || typeof getCurrentFuseWire !== 'function') {
  throw new Error('The installed @electron/fuses package does not expose the expected API.');
}

// @electron/fuses is CommonJS and does not export FuseState from its public
// entry point. getCurrentFuseWire() returns the raw fuse bytes, where ASCII
// "0" means disabled and ASCII "1" means enabled.
const FuseWireState = Object.freeze({
  DISABLE: '0'.charCodeAt(0),
  ENABLE: '1'.charCodeAt(0),
});

export { FuseV1Options, FuseWireState, getCurrentFuseWire };
