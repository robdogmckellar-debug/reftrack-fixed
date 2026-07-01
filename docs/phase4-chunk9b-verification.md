# Phase 4, Chunk 9B — Verification record

## Automated verification

Executed from a clean dependency installation:

```text
npm ci                         Passed
npm run typecheck              Passed
npm run lint                   Passed
npm run format:check           Passed
npm test                       Passed
npm run build:app              Passed
npm audit                      0 known vulnerabilities
```

## Test results

```text
Test files:                    25 passed
TODO-only files:               1
Executed tests:               113 passed
Approved remaining TODOs:      1
```

The remaining TODO is the application-wide keyboard acceptance item. The Dashboard and Site Editor are now covered, while Statistics, Settings, and Daily Tasks still use the transitional renderer.

## New coverage

Chunk 9B adds tests for:

- stable site-to-draft conversion;
- typed request normalisation;
- exact preview formatting;
- insecure and credentialed URL rejection;
- malformed currency and daily limits;
- automatic first-site selection;
- semantic master-detail structure;
- invalid-form focus and IPC suppression;
- committed-snapshot save behaviour;
- unsaved selection protection;
- guarded primary navigation;
- accessible deletion confirmation; and
- deterministic next-site selection after deletion.

## Production build output

```text
Main process:                         81.78 kB
Importer worker:                      12.39 kB
Shared worker code:                   14.29 kB
Performance probe:                     4.44 kB
Preload:                               3.77 kB
Preact shell + Dashboard + Editor:   158.42 kB
Transitional legacy-screen JS:        61.68 kB
Combined renderer CSS:               115.38 kB
Renderer HTML:                         0.73 kB
```

Compared with Chunk 9A, the transitional JavaScript bundle falls from 68.35 kB to 61.68 kB because the old Site Editor implementation was removed. The typed renderer bundle grows as expected because the new form, validation, navigation protection, and UI are now production code.

## Windows 11 acceptance checklist

1. Run `npm ci`, `npm run verify`, and `npm start` in a fresh extracted project.
2. Open Site Editor and confirm the first site is selected automatically.
3. Use Arrow Up, Arrow Down, Home, and End in the site list.
4. Edit a field, select another site, and confirm the unsaved-change dialog appears.
5. Choose Keep editing and confirm the draft and keyboard focus are preserved.
6. Repeat and choose Discard changes; confirm the requested site opens.
7. Edit a field and select Dashboard, Statistics, Settings, or Daily Tasks; confirm navigation is guarded.
8. Add a site with valid values and confirm it appears on the Dashboard after save.
9. Attempt blank name, HTTP URL, credentialed URL, three-decimal bonus, negative limit, and limit above 1,000; confirm inline errors.
10. Confirm a blank URL may be saved and is clearly labelled No URL in the site list.
11. Test the live preview with each supported date/time format.
12. Use Test link with a valid HTTPS URL and confirm Windows opens it in the default browser.
13. Cancel changes on an existing site and confirm the committed values return.
14. Cancel a new site and confirm the previous site is restored.
15. Delete a site, cancel once, then confirm deletion; verify the next logical site is selected.
16. Restart RefTrack and confirm saved additions, edits, and deletions persist.
17. Verify the screen at 125%, 150%, and 200% Windows scaling.
18. Verify visible focus and readable contrast in Windows high-contrast mode.

## Environment limitation

The Electron graphical application could not be launched in the Linux build environment because the Electron Linux executable was unavailable. A Chromium-only preview attempt was also blocked by the container's process and networking restrictions. Type checking, linting, formatting, unit/component tests, clean production builds, and dependency auditing completed successfully. Native Windows layout, title-bar interaction, default-browser opening, and display scaling require the acceptance checks above.
