# Phase 4, Chunk 4 — Verification record

## Automated verification

Executed from a clean `npm ci` installation:

```text
TypeScript project build:        passed
ESLint:                          passed
Prettier:                        passed
Executed tests:                  48 passed
Approved future-fix tests:       5 TODO
Main production build:           passed
Preload production build:        passed
Renderer production build:       passed
npm audit --audit-level=high:     0 known vulnerabilities
```

## Added test coverage

- canonical state schema and duplicate-ID rejection;
- integer-cent currency and historical aggregation;
- renderer/canonical compatibility conversion;
- stable Daily Task identity after reordering;
- orphan Daily Task progress removal;
- default state creation;
- corrupted-primary recovery from backup;
- temporary-file cleanup after commit;
- serial concurrent mutations;
- immutable state snapshots; and
- rejected replacements leaving the committed state unchanged.

## Production bundle sizes

```text
Main entry:             43.68 kB
Performance probe:       4.44 kB
Preload:                  0.76 kB
Renderer JavaScript:     60.59 kB
Renderer CSS:            71.31 kB
Renderer HTML:           28.32 kB
```

The main bundle increased because it now contains the domain model, runtime schema validation, compatibility conversion, atomic store and recovery service. The renderer bundle decreased slightly and received no framework or UI dependency.

## Runtime limitation of this review environment

The Electron npm package did not materialise its platform executable in this Linux container, so the interactive application could not be launched here. The TypeScript build, tests and all three production bundles completed successfully. Windows 11 runtime verification is still required.

## Windows verification checklist

1. Run `npm ci` and `npm run verify`.
2. Start RefTrack and verify all five screens still open.
3. Record a Copy and a Success, close RefTrack, reopen it and verify the values remain.
4. Confirm `%APPDATA%\reftrack\reftrack-state-v1.json` and its `.backup` file exist.
5. Confirm an old `reftrack-data.json`, when present, remains untouched.
6. Edit a Daily Task category, reorder its rows, save it, and verify each site's completion remains attached to the correct site.
7. Confirm statistics can still display records older than 90 days when such fixture data is present.
8. Keep Folder Cleaner disabled; its safe replacement has not yet been implemented.
