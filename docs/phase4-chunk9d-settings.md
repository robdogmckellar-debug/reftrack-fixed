# Phase 4, Chunk 9D — Settings replacement

## Scope

This chunk replaces the visible legacy Settings screen with strict TypeScript and Preact components. Dashboard, Site Editor, and Statistics remain unchanged. Daily Tasks is now the only screen remaining in the temporary compatibility renderer.

## New renderer modules

- `src/renderer/screens/settings/SettingsScreen.tsx`
- `src/renderer/styles/settings.css`
- `src/renderer/design-system/ToggleSwitch.tsx`

The screen is mounted directly by `App.tsx`. `LegacyScreenHost` treats Settings as a native Preact screen, and all legacy Settings markup, event wiring, cleanup-result listener code, and Settings-specific CSS were removed.

## Image Cleaner configuration

The replacement presents the Image Cleaner as a bounded Windows feature rather than a generic folder deletion option.

It exposes:

- a semantic on/off switch;
- an explicit Ready, Needs folder, or Off state;
- main-process folder selection and validation;
- the configured folder path;
- the verified image-format allowlist;
- non-recursive and Recycle Bin safety rules; and
- pending, success, cancellation, and error feedback.

The renderer still cannot submit an arbitrary deletion path. Folder ownership and validation remain in the main process.

## Current-session cleanup result

`SettingsScreen` subscribes to the typed `image-cleaner:completed` event while mounted, including while another screen is active. Returning to Settings therefore shows the latest cleanup from the current application session.

The result includes:

- start/completion status;
- scan, eligibility, recycled, skipped, and failed counts;
- the validated folder path;
- an error message when the job fails; and
- a bounded list of per-file failures.

The result is deliberately described as current-session information and is not added to the persistent application state.

## Application information

A new read-only `app:get-info` IPC command returns:

- application name and packaged version;
- Electron, Chromium, Node.js, and V8 versions;
- architecture; and
- the actual local user-data path.

The handler is protected by the existing top-frame sender validation and empty-request schema. The Settings screen no longer hard-codes its version or incorrectly claims that no feature uses the internet.

## Responsive layout and accessibility

The new Settings screen uses a two-column desktop layout that collapses to one column at constrained widths.

Accessibility work includes:

- a labelled tab panel and labelled settings regions;
- a native checkbox-backed toggle;
- associated label and descriptive text;
- visible pending and error states;
- live status feedback;
- semantic definition lists for runtime and cleanup metrics;
- selectable path text;
- shared focus indicators;
- reduced-motion support; and
- Windows forced-colour compatibility.

## Tests added

- accessible cleaner controls and safety information;
- typed runtime information loading;
- committed cleaner toggle state;
- validated folder-selection state; and
- retention and presentation of the latest current-session cleanup result.
