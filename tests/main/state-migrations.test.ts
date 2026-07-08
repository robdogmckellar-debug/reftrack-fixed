import { describe, expect, it } from 'vitest';

import { APP_STATE_SCHEMA_VERSION } from '../../src/domain/app-state';
import { createDefaultAppState } from '../../src/domain/defaults';
import {
  CURRENT_SCHEMA_VERSION,
  UnsupportedFutureStateError,
  migrateToCurrent,
} from '../../src/main/persistence/migrations';

describe('state migrations', () => {
  it('reports the current schema version from the domain model', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(APP_STATE_SCHEMA_VERSION);
  });

  it('returns a current-version document unchanged', () => {
    const state = createDefaultAppState();
    expect(migrateToCurrent(state)).toBe(state);
  });

  it('treats a structurally-valid object without a version as the first schema', () => {
    const value = { sites: [] };
    // v1 is current, so an unversioned object passes straight through to validation.
    expect(migrateToCurrent(value)).toBe(value);
  });

  it('refuses to migrate data from a newer, unsupported schema version', () => {
    expect(() => migrateToCurrent({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(
      UnsupportedFutureStateError,
    );
  });

  it('passes non-object values through for downstream validation to reject', () => {
    expect(migrateToCurrent('not-an-object')).toBe('not-an-object');
    expect(migrateToCurrent(null)).toBe(null);
  });
});
