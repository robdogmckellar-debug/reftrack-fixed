# Phase 4, Chunk 7 — Restricted partner-page importer

## Scope

This chunk removes the legacy partner-page scraper and replaces it with a bounded, cancellable import pipeline. Static extraction is attempted first in a short-lived utility process. A temporary isolated Chromium window is used only when the static response is unavailable or does not contain enough usable partner links.

The current screen structure and broad visual design remain in place. This chunk changes the importer interaction only: progress now reflects actual work, cancellation is supported, warnings are displayed, and extracted sites still require user review before they are saved.

## Import pipeline

A partner-page import now follows this sequence:

1. Validate the submitted URL in the main process.
2. Reject non-HTTPS, credential-bearing, nonstandard-port, local, private and reserved destinations.
3. Start a dedicated Electron utility process for the static download and extraction attempt.
4. Resolve the destination and reject any host that resolves to a private or reserved address.
5. Download a bounded HTML response while reporting real progress.
6. Parse the document structurally and score the extracted partner links.
7. Use the static result directly when its confidence is sufficient.
8. Start a temporary isolated Chromium fallback only when static extraction is inconclusive or a supported server response requires browser rendering.
9. Destroy the worker, browser window and temporary session when the job succeeds, fails or is cancelled.
10. Return a reviewable result. No site or category is written until the user confirms the import.

Only one import job may run at a time.

## Static importer limits

The utility-process importer enforces:

- credential-free HTTPS URLs only;
- standard HTTPS port 443 only;
- a maximum of five redirects;
- validation and public-address resolution after every redirect;
- DNS pinning of each static HTTPS request to the validated public address;
- TLS certificate validation and the original hostname as SNI/Host;
- a 20-second total static-import deadline;
- a 10-second per-request timeout;
- a 2 MiB response limit;
- HTML or XHTML content types only;
- no authentication prompts;
- explicit cancellation;
- no persistent worker process after completion.

HTTP 403, 429 and 503 responses can request the isolated browser fallback. Other unsupported or invalid responses fail with a structured, recoverable error.

## Network destination policy

The importer rejects:

- HTTP and all non-HTTPS schemes;
- URLs containing usernames or passwords;
- nonstandard ports;
- `localhost` and local-use hostname suffixes;
- IPv4 loopback, link-local, private, carrier-grade NAT, test, benchmark, multicast and reserved ranges;
- IPv6 loopback, link-local, unique-local, documentation, transition, multicast and reserved ranges;
- hostnames whose DNS result includes any private or reserved address.

The static importer connects to the validated resolved address rather than performing an unbounded second DNS lookup during the request.

## Structural extraction

`parse5` is used to parse the downloaded or rendered HTML. The extractor considers:

- page title and metadata for the proposed brand name;
- ordinary anchor links;
- JSON-LD URL entries;
- anchor text, image alternative text, title attributes and hostnames for proposed site names;
- duplicate hosts and duplicate URLs;
- same-page navigation and common non-partner destinations;
- confidence based on the number and quality of extracted candidates.

The result is capped at 500 candidate sites before it reaches the renderer.

## Isolated Chromium fallback

The browser fallback uses a new temporary in-memory Electron session for each job. It is configured with:

- `sandbox: true`;
- `contextIsolation: true`;
- `nodeIntegration: false`;
- no preload script;
- no DevTools, plugins or webviews;
- permissions denied;
- popups denied;
- downloads denied;
- authentication prompts denied;
- audio muted;
- navigation and network requests restricted to the approved source/final hosts;
- an 18-second load timeout;
- a 2 MiB rendered-HTML limit;
- seven short DOM inspection attempts;
- immediate destruction and storage/cache clearing after completion.

Third-party scripts and resources are intentionally blocked. This materially reduces the fallback's attack and tracking surface, but it can make some pages that depend on third-party assets impossible to import. That is an accepted security-over-compatibility decision. Such a page should be entered manually rather than weakening the importer globally.

Authenticated pages are not supported.

## IPC and progress contract

Removed:

- the legacy `scrape-partner-page` handler;
- `src/main/legacy/legacy-ipc.js`;
- `src/main/legacy/legacy-ipc.d.ts`;
- timer-based simulated import progress.

Added:

- `importer:start`;
- `importer:cancel`;
- `importer:progress`;
- `importer:completed`;
- typed worker messages validated with Zod;
- typed progress stages and completion results;
- `IMPORT_IN_PROGRESS`, `IMPORT_CANCELLED`, `IMPORT_TIMEOUT`, `IMPORT_NETWORK_REJECTED` and `IMPORT_UNSUPPORTED_PAGE` errors.

The renderer receives real stages such as validating, connecting, downloading, analysing, starting the browser, inspecting rendered content and finalising. Event subscriptions return explicit unsubscribe functions.

## New main-process modules

### `src/main/importer/network-policy.ts`

Owns URL validation, private/reserved address rejection and public DNS resolution.

### `src/main/importer/static-import.ts`

Owns bounded HTTPS requests, redirect handling, response limits, timeouts and static-extraction orchestration.

### `src/main/importer/static-extractor.ts`

Owns structural HTML parsing, candidate naming, filtering, deduplication and confidence scoring.

### `src/main/importer/importer-worker.ts`

Runs static network and parsing work in a dedicated Electron utility process.

### `src/main/importer/worker-protocol.ts`

Defines and validates messages exchanged between the utility process and the main process.

### `src/main/importer/browser-fallback.ts`

Owns the short-lived restricted Chromium fallback and its temporary session.

### `src/main/importer/import-coordinator.ts`

Owns the single active job, worker lifecycle, browser fallback, cancellation, timeout handling and renderer progress/completion events.

## Performance decisions

- Ordinary partner pages do not create a Chromium window.
- Network download and HTML parsing do not run on Electron's main UI thread.
- The utility process exists only for the duration of one import.
- Only one importer job can consume resources at a time.
- Download size, redirect count, response time, browser lifetime and rendered HTML are bounded.
- The renderer no longer runs fake progress timers.
- No persistent browser session, cookies or cache survive an import.

## Deliberately unchanged

- The renderer remains the transitional JavaScript UI.
- Imported sites still use the current review and category-creation interface.
- The broader Preact renderer and design-system work begins in Chunk 8.
- Windows packaging hardening remains scheduled for the final packaging chunk.
