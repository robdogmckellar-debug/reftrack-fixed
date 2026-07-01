# Phase 4, Chunk 6 — Safe image cleanup and Copy orchestration

## Scope

This chunk removes the legacy recursive folder deletion implementation and replaces it with a Windows-only image cleanup workflow that is safe to run after a successful Copy Link action.

The current renderer layout is retained. The partner-page importer remains the only legacy main-process feature and is scheduled for Chunk 7.

## Safety invariants

The Image Cleaner now enforces all of the following in the main process:

- only files directly inside the selected folder are considered;
- directories are never entered or removed;
- symbolic links and junction-like directory selections are rejected;
- network, UNC and Windows device paths are rejected;
- drive roots and broad system or personal-library roots are rejected;
- hidden and system files are detected through Windows file attributes and skipped;
- dot-files are skipped independently of Windows attributes;
- only approved image extensions are considered;
- the file signature must match the extension family;
- the file identity is checked again immediately before it is moved;
- eligible files are sent through Electron's Windows Recycle Bin API;
- there is no permanent unlink or recursive removal path;
- only one cleanup job can run at a time.

Supported extension families:

- PNG
- JPG, JPEG and JFIF
- WebP
- GIF
- BMP
- TIF and TIFF

## Copy action flow

Copy Link is now one main-owned application operation:

1. Acquire a per-site in-flight lock.
2. Recheck the site's daily copy limit.
3. Update the Windows clipboard.
4. Commit the copy transaction through the atomic state service.
5. Start image cleanup in the background when enabled and configured.
6. Return the committed renderer snapshot immediately.
7. Send an `image-cleaner:completed` event when the background job finishes.

The renderer no longer invokes a separate destructive cleanup command. It displays a pending Copy state immediately, then reports the real cleanup result: scanned, eligible, moved, skipped and failed counts.

## Folder validation

Folder selection is validated before it is persisted and again before every cleanup. The following broad locations are rejected when selected directly:

- a drive root;
- the user profile root;
- Desktop, Documents, Downloads, Pictures, Music and Videos roots;
- equivalent OneDrive library roots;
- Windows, Program Files, ProgramData, AppData and LocalAppData roots;
- network and device paths.

A dedicated subfolder such as `Pictures\RefTrack Screenshots` is permitted.

## New modules

### `src/main/services/image-cleaner-service.ts`

Owns folder validation, Windows hidden/system-attribute discovery, signature verification, file identity rechecking, Recycle Bin moves, operation counts and the single-job coordinator.

### `src/main/services/copy-action-service.ts`

Owns per-site action locking, daily-limit preflight, clipboard handling, copy transaction ordering and cleanup-job startup.

### `tests/main/image-cleaner-service.test.ts`

Covers top-level-only processing, extension/signature matching, subfolder preservation, protected files, unsafe folder rejection, partial Recycle Bin failures and global cleanup locking.

### `tests/main/copy-action-service.test.ts`

Covers clipboard/commit ordering, configured and disabled cleanup states, duplicate in-flight actions and daily-limit preflight.

## Contract changes

Removed:

- `image-cleaner:clear-legacy`
- `window.reftrack.imageCleaner.clearLegacy()`
- the legacy cleaner result contract
- recursive synchronous deletion code

Added:

- `image-cleaner:completed`
- typed Copy Link cleanup-start status
- typed background cleanup completion events
- `ACTION_IN_PROGRESS`, `UNSAFE_PATH` and `IMAGE_CLEANUP_FAILED` error codes

## UI changes in this chunk

The existing Settings screen now describes the real behaviour:

- eligible images go to the Windows Recycle Bin;
- subfolders and non-image files remain untouched;
- the last cleanup result is shown for the current session.

Copy buttons show an immediate pending state. Cleanup progress and completion use real main-process events rather than simulated timers.

## Performance decisions

- Cleanup runs asynchronously after clipboard and state commit work.
- The renderer receives the Copy response without waiting for the Recycle Bin operation to finish.
- Files are inspected using asynchronous filesystem APIs.
- Windows hidden/system attributes are queried in one background PowerShell process per cleanup rather than one process per file.
- Recycle Bin operations are intentionally sequential to avoid flooding the Windows shell.
- No renderer framework or additional runtime dependency was introduced.

## Deliberately unchanged

- Screen structure and broad visual design.
- Canonical state schema and compatibility snapshot names.
- Partner-page importer implementation.
- Windows packaging hardening beyond the previous chunks.
