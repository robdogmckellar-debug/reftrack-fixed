# Phase 4, Chunk 3 — Verification record

## Automated verification

Completed successfully in the review environment:

- strict TypeScript project build;
- ESLint;
- Prettier verification;
- 34 executed tests passed;
- 8 approved future-fix tests remain TODO;
- electron-vite main, preload, and renderer production builds;
- custom protocol path-containment tests;
- production/development navigation-policy tests;
- single-instance focus-behaviour tests;
- authored project-baseline checks;
- clean `npm ci`; and
- `npm audit --audit-level=high` with zero known vulnerabilities.

Production output sizes after this chunk:

- main entry: approximately 25.67 kB;
- performance probe: approximately 4.44 kB;
- preload: approximately 0.76 kB;
- renderer JavaScript: approximately 60.84 kB;
- renderer CSS: approximately 71.31 kB; and
- renderer HTML: approximately 28.32 kB.

The renderer bundle is unchanged from Chunk 2. The main bundle grew because it now contains the typed application protocol and security shell.

## Runtime limitation in the review environment

A Linux Electron runtime launch was attempted under Xvfb, but the Electron package could not download its Linux binary in this environment. The three-process production build completed successfully, but final launch verification must therefore be performed on the Windows 11 target machine.

## Required Windows 11 checks

Run:

```powershell
npm ci
npm run verify
npm start
```

Then verify:

1. RefTrack opens to the Dashboard with the existing UI unchanged.
2. All five screens still open.
3. Closing the only window exits the process.
4. Launching RefTrack a second time does not create another window and instead focuses the first window.
5. Minimise the first window, launch RefTrack again, and confirm it restores and focuses.
6. Copy Link, Success, Undo, Site Editor, Statistics, Settings, and Daily Tasks retain their existing behaviour.
7. Close and reopen RefTrack and confirm data remains available.
8. Run `npm run preview` and confirm the compiled application loads through the production build.

Do not enable the Folder Cleaner. Its image-only replacement is not part of this chunk.
