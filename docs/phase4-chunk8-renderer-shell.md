# Phase 4, Chunk 8 — Preact renderer shell and design-system foundation

## Scope

Chunk 8 replaces the static document shell with the approved lightweight renderer foundation while deliberately leaving the five feature screens on their existing implementation until Chunk 9.

Implemented in this chunk:

- Preact application entry and component shell;
- Preact Signals renderer state;
- one main-process bootstrap snapshot shared with the transitional renderer;
- semantic, keyboard-operable primary navigation;
- native Windows caption controls with a redesigned draggable title bar;
- semantic design tokens for colour, typography, spacing, radius, motion and focus;
- shared Button, Dialog, Spinner, StatusMessage and VisuallyHidden primitives;
- managed focus for the existing confirmation, Daily Tasks editor and importer dialogs;
- focus restoration, Tab containment and Escape-to-close behaviour;
- accessible live regions for toast and undo feedback;
- reduced-motion and Windows forced-colour support;
- a typed startup/loading/failure experience; and
- component, Signals-store and dialog-focus tests.

The Dashboard, Site Editor, Statistics, Settings and Daily Tasks screen internals remain the transitional JavaScript implementation. Their behaviour and identifiers are preserved so that each screen can be replaced independently in Chunk 9.

## Renderer architecture

The renderer now starts at:

```text
src/renderer/main.tsx
```

The startup flow is:

```text
main.tsx
  -> App.tsx
     -> Signals bootstrap store
     -> TitleBar + PrimaryNavigation
     -> LegacyScreenHost
        -> project-owned static screen markup
        -> legacy-app.js compatibility runtime
```

`LegacyScreenHost` is intentionally narrow. It injects only a project-owned static HTML fragment, mounts it once, and loads the existing renderer module after the DOM is present. No user or remote HTML enters this bridge.

The legacy renderer no longer performs a second bootstrap request. It receives the already validated snapshot from the Signals store and publishes later command snapshots back to that store. This establishes one renderer state boundary before screen-by-screen conversion.

## Navigation

Primary navigation is now a Preact component using the ARIA tab pattern:

- one selected tab;
- `aria-controls` and labelled tab panels;
- roving `tabIndex`;
- Left/Right arrow navigation;
- Home/End navigation;
- responsive labels at narrower window widths; and
- a Signals-backed active-screen value.

Existing screen-specific render hooks continue to run during the transition. Programmatic navigation after an import now uses the shared navigation store instead of manually changing DOM classes.

## Windows title bar

The application continues to use Electron's native Windows caption controls. The title-bar overlay is now 48 px high and the renderer reserves the operating system's caption-control area through the Window Controls Overlay environment variables, with a Windows fallback width.

The draggable area is limited to the title-bar surface. Brand, navigation and clock controls are explicitly non-draggable.

No HTML minimise, maximise or close buttons were introduced.

## Design system

New styles are separated into:

```text
src/renderer/styles/
├── tokens.css
├── global.css
├── design-system.css
├── shell.css
├── accessibility.css
└── legacy.css
```

The old stylesheet is retained as `legacy.css` only for screens that have not yet been replaced. Its colour and layout variables now resolve through semantic tokens, improving contrast and consistency without changing screen behaviour.

`style-src 'unsafe-inline'` remains temporarily enabled because the transitional screen markup still contains inline styles and the legacy runtime still updates `element.style`. Inline scripts remain prohibited. The inline-style allowance will be removed after the final legacy screen is replaced.

## Shared controls

The first shared primitives are:

- `Button`
- `Dialog`
- `Spinner`
- `StatusMessage`
- `VisuallyHidden`

They define consistent pending, disabled, focus and semantic behaviour. Feature screens will adopt them incrementally rather than duplicating controls.

## Dialog accessibility bridge

The temporary legacy dialog manager adds the missing desktop-dialog behaviour to the current overlays:

- `role="dialog"`;
- `aria-modal="true"`;
- title association;
- initial focus;
- Tab and Shift+Tab containment;
- Escape close;
- background inertness; and
- restoration to the invoking control.

This manager is removed as each legacy overlay is replaced by the shared Preact `Dialog` component.

## Dependency changes

Runtime:

- `preact@10.29.3`
- `@preact/signals@2.9.2`

Development and testing:

- `@preact/preset-vite@2.10.5`
- `@testing-library/preact@3.2.4`
- `@testing-library/user-event@14.6.1`
- `jsdom@29.1.1`

All versions are exact and represented identically in `package-lock.json`.

## Performance considerations

The Preact shell is loaded eagerly because it controls startup, navigation and error handling. The 68 kB legacy renderer is now a separate dynamic chunk and is requested only after bootstrap and shell mount.

The new clock owns one cleaned interval. The previous legacy clock interval has been removed.

Signals provide a fine-grained state boundary for subsequent screen replacements. Chunk 8 does not yet remove the legacy screen-level `innerHTML` updates; those are removed one screen at a time in Chunk 9.

## Deliberately deferred

- Dashboard component conversion;
- Site Editor component conversion;
- Settings component conversion;
- Daily Tasks component conversion;
- Statistics component conversion;
- removal of the legacy HTML fragment;
- removal of `legacy-app.js`;
- removal of `legacy.css`; and
- removal of the temporary inline-style CSP allowance.
