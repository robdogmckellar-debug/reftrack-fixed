# Phase 4, Chunk 1 — Verification record

## Scope

This chunk establishes the reproducible dependency baseline, static quality checks, characterisation tests and Windows performance instrumentation. It does not implement the approved security, persistence, Folder Cleaner, IPC or UI redesign work from later chunks.

## Dependency baseline

Direct development dependencies are pinned exactly:

- Electron 42.5.1
- electron-builder 26.15.3
- ESLint 10.6.0
- @eslint/js 10.0.1
- globals 17.7.0
- Prettier 3.9.4
- Vitest 4.1.9

`package.json` and the root declaration in `package-lock.json` match. The lockfile uses public `registry.npmjs.org` package URLs.

## Commands executed

```text
npm ci
npm run verify
npm run audit:dependencies
```

## Results

- ESLint: passed
- Prettier check: passed
- Test files: 4 passed, 1 skipped because it contains approved future-work TODO cases
- Executed tests: 19 passed
- Approved future-work tests: 8 TODO
- npm audit: 0 known vulnerabilities
- Authored JavaScript syntax checks: passed

## Behavioural coverage added

Characterisation tests now cover:

- Existing date and time formatting
- Existing referral-link composition order
- Local daily date keys
- Daily, monthly and yearly statistic aggregation
- Per-site leaderboard aggregation
- Leap-year date generation
- Daily Tasks completion and aggregate progress
- Exact direct dependency pinning
- Current privileged IPC channel inventory
- Syntax parsing of every authored JavaScript file

The approved corrections are recorded as explicit TODO tests so they are converted into passing regression tests as their implementation chunks begin.

## Performance probe status

The performance probe is implemented and statically verified. It records startup milestones, Dashboard readiness, process IDs and Electron process memory metrics.

A valid performance baseline was not produced in this review container because the target application is Windows 11 and the Windows Electron runtime cannot execute here. Run `npm run perf:baseline` three times on the target Windows 11 computer before approving a later performance-sensitive chunk.

## Known intentional exceptions

The legacy renderer, HTML, stylesheet, main process and preload files are not reformatted wholesale. Narrow lint and formatting exceptions preserve reviewable diffs until each file is replaced incrementally.
