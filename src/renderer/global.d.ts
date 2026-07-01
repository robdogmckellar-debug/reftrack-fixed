import type { RefTrackApi } from '../shared/ipc/contract';

declare global {
  interface Window {
    reftrack: RefTrackApi;
  }
}

export {};
