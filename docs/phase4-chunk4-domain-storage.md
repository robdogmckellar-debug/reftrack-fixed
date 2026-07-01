# Phase 4, Chunk 4 — Domain model and recoverable storage

## Scope

This chunk replaces the synchronous renderer-owned JSON persistence path with a typed, main-owned canonical state foundation. The current JavaScript renderer remains in place through a compatibility adapter so screen layout and core workflows are not redesigned prematurely.

## Canonical model

`AppStateV1` is the first versioned state contract. It contains:

- stable sites;
- permanent daily site metrics;
- bounded activity entries;
- typed application settings;
- stable Daily Task categories and sites; and
- Daily Task completion keyed by date and stable IDs.

Currency is stored as integer cents. Site and lifetime totals are derived from daily records rather than persisted in multiple locations.

## Storage

The main process now writes:

```text
%APPDATA%\reftrack\reftrack-state-v1.json
```

Each commit:

1. validates the complete candidate state;
2. increments the state revision;
3. writes the previous committed state to a backup through a same-directory temporary file;
4. flushes and atomically renames the backup;
5. writes, flushes and atomically renames the new primary state; and
6. updates the in-memory canonical snapshot only after disk persistence succeeds.

The backup file is:

```text
reftrack-state-v1.json.backup
```

On startup, RefTrack attempts the primary state, then the backup, then a fresh default. Invalid files are archived with a `.corrupt-<timestamp>` suffix rather than silently overwritten.

## Serial mutation service

All canonical mutations are placed on a single promise queue. A mutation observes every previously committed mutation, and a failed mutation does not poison the queue or change the current in-memory state.

The current renderer still sends a whole compatibility snapshot. Chunk 5 replaces that temporary API with narrow typed commands so renderer state can no longer overwrite unrelated canonical data.

## Compatibility adapter

`LegacyStateGateway` converts between:

- the current renderer's dollar-based `dailyState`, `tasks`, and `tasksDailyState`; and
- canonical integer-cent `dailyRecords`, `taskCategories`, and `taskDailyRecords`.

Totals shown by the renderer are derived from canonical history on load. Historical daily metrics are no longer pruned after 90 days.

The previous `reftrack-data.json` file is intentionally not migrated. This follows the approved product decision and leaves the old file untouched.

## Stable identifiers

New sites, categories, task sites and activities now use `crypto.randomUUID()`-backed IDs. Daily Task editor rows retain their original ID in `data-site-id`, so reordering or deleting rows no longer transfers progress to another site by array position.

## Deferred items

This chunk does not yet replace:

- generic legacy IPC channels;
- renderer-owned business commands;
- unsafe Folder Cleaner behaviour;
- external URL handling;
- partner importing; or
- the current UI.

Those changes remain assigned to later approved chunks.
