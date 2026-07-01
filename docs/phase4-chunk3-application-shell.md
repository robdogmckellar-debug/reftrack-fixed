# Phase 4, Chunk 3 — Typed Windows application shell

## Scope

This chunk replaces the Electron lifecycle and primary-window bootstrap with a typed, Windows-only application shell. It deliberately leaves the legacy data model, renderer, Folder Cleaner, and partner importer behaviour in a temporary compatibility module so that safety-critical concerns can be replaced in later isolated chunks.

## Implemented

### Typed main entry

`src/main/index.ts` is now the production main-process entry. It owns:

- the application lifecycle;
- single-instance enforcement;
- Windows AppUserModelID registration;
- the isolated primary renderer session;
- application-protocol registration;
- primary-window creation; and
- orderly Windows shutdown.

The old monolithic `src/main/index.js` no longer exists.

### Single-instance enforcement

`app.requestSingleInstanceLock()` prevents two RefTrack processes from editing the same local data file concurrently. A second launch restores, shows, and focuses the existing window.

### Secure primary BrowserWindow

The main window now explicitly sets:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- `allowRunningInsecureContent: false`;
- `navigateOnDragDrop: false`;
- `safeDialogs: true`;
- development-only DevTools; and
- an isolated in-memory Electron session.

The window keeps native Windows caption buttons through `titleBarOverlay`. The default application menu is removed.

### Restricted renderer session

The primary renderer session:

- denies every browser permission request and permission check;
- blocks downloads;
- blocks HTTP, HTTPS, WebSocket, and `file://` requests in production; and
- is separate from the temporary legacy importer session.

Top-level navigation is restricted to the RefTrack application origin in production or the exact electron-vite origin during development. New windows and webviews are denied.

### Custom application protocol

The packaged renderer now loads from:

```text
reftrack://app/index.html
```

It no longer loads the primary UI through `file://`. The protocol handler:

- is registered for the isolated primary session;
- accepts GET and HEAD only;
- serves files only from the compiled renderer directory;
- rejects another scheme or host;
- rejects malformed paths and directory traversal;
- emits explicit MIME types and `nosniff`; and
- applies long-lived caching only to compiled assets, not `index.html`.

### Windows-only cleanup

Removed:

- the macOS close-to-hide path;
- the macOS `activate` lifecycle path;
- macOS and Linux electron-builder targets;
- unused `Tray` and `nativeImage` imports/state; and
- the unused `get-platform` IPC method.

The Windows target is now explicitly NSIS x64 with the Windows icon.

### CSP improvement

The current renderer CSP no longer permits inline scripts. Inline styles remain temporarily because the legacy HTML and renderer templates still contain style attributes; those are removed during the renderer redesign.

## Temporary compatibility boundary

`src/main/legacy/legacy-ipc.js` contains the existing persistence, clipboard, notification, URL-opening, Folder Cleaner, and partner-importer handlers. Its behaviour is intentionally retained for this chunk except for removal of the unused platform channel.

This compatibility module is replaced incrementally by:

- Chunk 4: domain model and atomic storage;
- Chunk 5: typed and validated IPC;
- Chunk 6: copy, success, and image-cleaner services; and
- Chunk 7: restricted partner importer.

The legacy Folder Cleaner is still unsafe and must remain disabled.

## Trade-off

Moving the primary renderer to an isolated custom session and protocol adds a small amount of startup code. It removes broad `file://` privileges and creates a sharply defined origin without adding renderer dependencies or runtime UI overhead. This is the correct trade against the approved performance-first priority because the protocol serves local files directly and the security boundary does not add interaction-time work.
