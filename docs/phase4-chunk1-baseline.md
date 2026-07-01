# Phase 4, Chunk 1 — Reproducible baseline

This chunk establishes a clean dependency baseline, static verification and repeatable performance instrumentation without changing RefTrack's user-facing behaviour.

## Required development environment

- Windows 11 x64
- Node.js 22.13.0 or newer, or Node.js 24
- npm 10 or newer

The Electron runtime is pinned to 42.5.1. The application does not use the system Node.js runtime after Electron starts, but npm, ESLint, Prettier and Vitest run under the development Node.js installation.

## Clean verification

From a new terminal in the project directory:

```powershell
npm ci
npm run verify
npm run audit:dependencies
```

`npm ci` must complete without changing `package-lock.json`.

## Windows performance baseline

Close other high-load applications, then run:

```powershell
npm run perf:baseline
```

RefTrack launches, waits until Dashboard cards are rendered, samples process memory after a short settling period, writes a JSON report under `artifacts/performance`, and exits automatically.

The report records:

- Electron, Chromium, Node and V8 versions
- app-ready, DOM-ready, load, ready-to-show and Dashboard-usable milestones
- main and renderer process IDs
- main-process memory information
- Electron process metrics

Run the command three times after a reboot. Keep all three reports. The median values will become the comparison baseline for later chunks.

## Intentional temporary exceptions

The existing renderer, HTML and stylesheet are excluded from Prettier until their incremental conversion. Legacy source files also have a narrow ESLint exception for unused declarations. These exceptions prevent a formatting-only rewrite from obscuring behavioural changes and will be removed as the affected files are replaced.
