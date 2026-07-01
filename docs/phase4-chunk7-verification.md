# Phase 4, Chunk 7 — Verification record

## Automated verification

The following commands completed successfully in the review environment:

```text
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:app
npm audit --audit-level=high
```

Results:

```text
Strict TypeScript build:       Passed
ESLint:                        Passed
Prettier:                      Passed
Executed tests:                81 passed
Approved future-fix tests:     1 TODO
Main production build:         Passed
Importer-worker build:         Passed
Preload production build:      Passed
Renderer production build:     Passed
npm audit:                     0 known vulnerabilities reported
```

Production bundle sizes:

```text
Main entry:             81.39 kB
Importer worker:        12.39 kB
Shared worker chunk:    14.29 kB
Performance probe:       4.44 kB
Preload:                  3.77 kB
Renderer JavaScript:     68.41 kB
Renderer CSS:            72.94 kB
Renderer HTML:           29.00 kB
```

`parse5@8.0.1` is the only new direct runtime dependency in this chunk. It is used for structural HTML parsing in both the static and rendered-page extraction paths.

## Automated importer coverage

Tests verify that:

- only credential-free HTTPS URLs on port 443 are accepted;
- local-use hostnames and private/reserved IPv4 and IPv6 ranges are rejected;
- a hostname is rejected when any resolved address is non-public;
- the public-address resolver selects a valid public address;
- structural extraction reads anchors, metadata and JSON-LD entries;
- same-domain navigation, duplicate hosts and common non-partner destinations are filtered;
- proposed site names are normalised and confidence is calculated;
- only one import can run at a time;
- progress and success events retain the correct job ID;
- a browser fallback runs only when the static result requests it;
- cancellation terminates the active worker and produces one cancellation result;
- worker errors are converted to structured IPC errors;
- the old scraper channel and legacy IPC module no longer exist;
- the production build emits a separate importer-worker entry.

## Windows 11 verification procedure

1. Extract the full Chunk 7 project into a fresh directory.
2. Run:

```powershell
npm ci
npm run verify
npm start
```

3. Open **Daily Tasks**, then open the partner-page importer.
4. Enter a normal public HTTPS landing page that contains direct partner links.
5. Confirm the UI reports genuine stages rather than a repeating timer.
6. Confirm the completed result shows the extraction method, confidence, warnings and a reviewable site list.
7. Edit a proposed name or URL, deselect one entry, and confirm only the selected valid entries are added.
8. Start another import and choose **Cancel** while it is loading. Confirm the operation stops, the dialog does not remain busy, and no category is added.
9. Try to start two imports rapidly and confirm only one job is accepted.
10. Test a JavaScript-rendered public page and confirm the interface reports when the isolated browser fallback begins.
11. Confirm an unsupported page returns a recoverable error without closing or freezing RefTrack.
12. Confirm the following inputs are rejected before import:

```text
http://example.com
https://user:password@example.com
https://example.com:8443
https://localhost
https://127.0.0.1
https://192.168.1.1
https://[::1]
```

13. Close and reopen the importer after success, failure and cancellation. Confirm no old progress state or stale results remain.
14. Repeat imports several times and use Windows Task Manager to confirm no hidden RefTrack browser or utility process remains after each job finishes.

Use only pages you are authorised to access. Authenticated pages are intentionally unsupported.

## Expected compatibility limitation

The isolated browser permits requests only to the approved page hosts. A page that requires third-party JavaScript, APIs, challenge services or content delivery hosts may fail to render fully. This is deliberate. Manual entry is the safe fallback for those pages.

## Runtime limitation in this environment

The Electron graphical application could not be launched in this Linux review container because the Electron Linux executable was unavailable. Type checking, linting, formatting, unit/integration tests, dependency auditing and all production builds completed successfully. Interactive Windows networking, Chromium rendering and process cleanup must be confirmed with the procedure above on Windows 11.

## Remaining approved Phase 2 item

- complete keyboard operation and managed dialog focus, to be addressed as part of the new renderer shell and design system.
