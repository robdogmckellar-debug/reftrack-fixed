# Phase 4, Chunk 5 — Typed IPC and command boundary

## Scope

This chunk replaces the broad renderer-controlled IPC bridge with a narrow, validated application-command boundary. It does not redesign the visual interface and does not yet replace the legacy Folder Cleaner or partner-page importer implementations.

## Architecture changes

### Main-owned mutations

The renderer can no longer submit the complete application state. The removed compatibility operations include:

- `load-data`
- `save-data`
- `copy-to-clipboard`
- `show-notification`
- `open-url`
- `pick-folder`
- `clear-folder`
- `scrape-partner-page`

All state changes now run through `ApplicationCommandService`, which mutates the canonical `AppStateV1` through the serial `StateService` queue.

### Typed channel contract

The shared IPC layer now contains:

- `channels.ts` — namespaced channel constants;
- `contract.ts` — request, response and preload API types;
- `schemas.ts` — strict Zod request validation;
- `result.ts` — structured success and failure results; and
- `renderer-snapshot.ts` — the temporary read-only view model expected by the current JavaScript UI.

The preload exposes `window.reftrack` with nested, domain-oriented functions. It does not expose `ipcRenderer`, a generic invoke function, or a generic save operation.

### Sender validation

Every handler verifies that the request:

1. comes from the current main RefTrack window;
2. comes from the top-level frame rather than a subframe; and
3. originates from `reftrack://app` in production or the configured electron-vite origin in development.

The BrowserWindow is assigned through an `onCreated` callback before renderer loading begins, ensuring that the first bootstrap request can be validated safely.

### Structured errors

Handlers return discriminated results:

```text
{ ok: true, data }
```

or:

```text
{
  ok: false,
  error: {
    code,
    message,
    field,
    recoverable
  }
}
```

Expected validation, daily-limit, not-found, clipboard, folder, notification, URL and import failures no longer cross the bridge as arbitrary thrown values or booleans.

## Command surface

The implemented command groups are:

- application bootstrap;
- site upsert and deletion;
- activity clearing;
- link-copy recording;
- success recording and exact undo;
- image-cleaner enablement and main-owned folder selection;
- temporary legacy cleaner execution without a renderer-supplied path;
- task-category upsert and deletion;
- single and batched task-completion updates;
- external URL opening;
- action notifications; and
- temporary legacy partner-page extraction.

## Behavioural corrections included

The following approved findings were naturally resolved while establishing the command boundary:

- Rapid copy commands are serialised and the daily limit is enforced inside the main-owned mutation queue.
- Undo targets the exact success activity ID rather than deleting the first activity item.
- Site deletion removes that site's historical daily metrics before adding one deletion activity entry.
- Task category edits preserve completion only for stable task-site IDs.
- External links are restricted to credential-free HTTPS URLs.
- A Daily Task link is marked complete only after Windows accepts the open request.
- Folder selection is committed in the main process; the renderer no longer supplies an arbitrary deletion path.

## Deliberate temporary compatibility

### Renderer snapshot

The current renderer still expects fields such as `dailyState`, `bonus`, `lifetimeEarnings` and `tasks.categories`. Main-process commands therefore return a complete read-only transitional snapshot after successful state mutations.

This is not a generic write contract: the renderer cannot send that snapshot back. The view model will be removed as each Preact screen adopts canonical typed selectors.

### Folder Cleaner

The cleaner remains the old synchronous, recursive implementation behind a no-argument command. Its path is now main-owned, but its deletion behaviour is still unsafe. It must remain disabled until Chunk 6 replaces it with the approved non-recursive image-only Recycle Bin service.

### Partner importer

The importer now has validated IPC input and structured output, but its BrowserWindow/fetch implementation remains legacy. Chunk 7 will add the utility-process extractor, HTTPS-first policy, resource limits, cancellation and isolated Chromium fallback.

## Performance trade-off

Successful state commands currently return the complete transitional renderer snapshot. This is larger than a minimal delta response, but it avoids duplicating mutation logic in the legacy renderer and removes the much more dangerous complete-state write path.

Given the current small local dataset, the short-term IPC cost is minor. The Preact renderer chunks will replace whole-snapshot updates with targeted read models and fine-grained signal updates.

## Files added

```text
src/main/ipc/register-handlers.ts
src/main/ipc/url-policy.ts
src/main/ipc/validate-sender.ts
src/main/services/application-command-service.ts
src/main/services/application-error.ts
src/shared/ipc/channels.ts
src/shared/ipc/contract.ts
src/shared/ipc/result.ts
src/shared/ipc/schemas.ts
src/shared/view-model/renderer-snapshot.ts
tests/main/application-command-service.test.ts
tests/main/ipc-contract.test.ts
```

## Files removed

```text
src/shared/ipc/legacy-api.ts
```

## Files substantially changed

```text
src/main/index.ts
src/main/application/create-main-window.ts
src/main/legacy/legacy-ipc.js
src/main/legacy/legacy-ipc.d.ts
src/main/legacy/legacy-state-adapter.ts
src/preload/index.ts
src/renderer/app.js
src/renderer/global.d.ts
tests/helpers/load-renderer.cjs
tests/characterization/project-baseline.test.js
tests/characterization/approved-fixes.test.js
README.md
```
