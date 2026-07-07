import { APP_STATE_SCHEMA_VERSION } from '../../../domain/app-state';

export const CURRENT_SCHEMA_VERSION = APP_STATE_SCHEMA_VERSION;

/**
 * Raised when an on-disk state file was written by a NEWER version of RefTrack
 * than this build understands. This must never be treated as corruption — wiping
 * it would destroy data the user created with a later version — so the store
 * lets it propagate and refuses to overwrite the file.
 */
export class UnsupportedFutureStateError extends Error {
  constructor(readonly detectedVersion: number) {
    super(
      `The saved data is from a newer version of RefTrack (schema v${detectedVersion}); ` +
        `this build supports up to v${CURRENT_SCHEMA_VERSION}.`,
    );
    this.name = 'UnsupportedFutureStateError';
  }
}

type StateRecord = Record<string, unknown>;
type Migration = (state: StateRecord) => StateRecord;

/**
 * Ordered forward migrations. `MIGRATIONS[n]` upgrades a version-`n` document to
 * version `n + 1`. There are none yet (only schema v1 exists); the framework is
 * in place so future schema changes can load old files losslessly instead of
 * failing strict validation and being discarded.
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 1: (state) => ({ ...state, schemaVersion: 2, /* new fields */ }),
};

function detectVersion(value: unknown): number {
  if (typeof value !== 'object' || value === null) return CURRENT_SCHEMA_VERSION;
  const raw = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) return raw;
  // A structurally-valid object without a usable version is treated as v1.
  return 1;
}

/**
 * Bring a parsed-but-unvalidated JSON document up to the current schema version.
 * Returns the value unchanged when it is already current (or not a versioned
 * object, in which case downstream strict validation decides its fate).
 */
export function migrateToCurrent(value: unknown): unknown {
  const detected = detectVersion(value);
  if (detected > CURRENT_SCHEMA_VERSION) throw new UnsupportedFutureStateError(detected);
  if (detected >= CURRENT_SCHEMA_VERSION) return value;

  let state = value as StateRecord;
  for (let version = detected; version < CURRENT_SCHEMA_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`No migration is registered from schema version ${version}.`);
    }
    state = migration(state);
  }
  return state;
}
