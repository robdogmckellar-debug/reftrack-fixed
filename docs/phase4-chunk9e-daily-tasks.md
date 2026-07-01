# Phase 4, Chunk 9E — Daily Tasks replacement

## Scope

This chunk replaces the final transitional renderer screen with strict TypeScript and Preact. All five primary screens now mount directly from `App.tsx`, and the JavaScript compatibility renderer, legacy screen host, legacy dialog manager, and legacy stylesheet have been removed.

## New renderer modules

- `src/renderer/screens/daily-tasks/DailyTasksScreen.tsx`
- `src/renderer/screens/daily-tasks/daily-tasks-model.ts`
- `src/renderer/screens/daily-tasks/components/TaskCategoryCard.tsx`
- `src/renderer/screens/daily-tasks/components/TaskCategoryDialog.tsx`
- `src/renderer/screens/daily-tasks/components/PartnerImportDialog.tsx`
- `src/renderer/styles/daily-tasks.css`

The renderer TypeScript configuration no longer permits JavaScript source files.

## Daily workflow

The replacement provides:

- an overall daily completion summary;
- optional automatic category ordering by progress;
- accessible category disclosures;
- direct checkbox completion;
- per-site Visit and Open again actions;
- one-category-at-a-time Open remaining processing;
- real pending, success, informational, and failure feedback; and
- automatic local-date rollover at midnight or when the application becomes visible again.

A site is marked complete only after Windows accepts the external HTTPS open request. Open remaining processes links sequentially with a short 260 ms interval and commits only accepted opens in one batched task command. A failed open remains incomplete and is named in the resulting feedback.

## Stable category editing

The category editor uses controlled typed fields and preserves existing task-site IDs during edits. New IDs are generated only for newly added rows. Removing or reordering rows therefore cannot transfer historical completion to another site.

Validation covers:

- required category and site names;
- maximum field lengths;
- optional credential-free HTTPS URLs; and
- removal of completely blank rows before saving.

Creation, editing, and deletion use the existing typed IPC commands and managed dialogs. Category deletion explicitly removes its associated Daily Task progress.

## Partner importer review

The restricted importer from Chunk 7 now has a native Preact review interface.

The dialog:

- validates the public HTTPS source URL before starting;
- displays genuine worker and isolated-browser stages;
- supports cancellation;
- shows extraction method, confidence, warnings, source, and final URL;
- lets the user select, rename, and correct every proposed site;
- validates every selected site before saving; and
- writes nothing until the reviewed category is confirmed.

Only one importer job remains active at a time, and event subscriptions are removed when the component unmounts.

## Accessibility and responsive layout

The replacement uses semantic articles, lists, buttons, checkboxes, progress bars, labelled tab panels, and managed dialogs. Status is communicated with text in addition to colour.

Keyboard and accessibility support includes:

- complete tab navigation;
- visible shared focus indicators;
- semantic disclosure state;
- descriptive icon-button labels;
- live feedback regions;
- reduced-motion support;
- Windows forced-colour support; and
- responsive one-, two-, and three-column category layouts.

## Transitional renderer removal

Removed:

- `src/renderer/legacy/`
- `src/renderer/components/LegacyScreenHost.tsx`
- `src/renderer/accessibility/legacy-dialog-manager.ts`
- `src/renderer/styles/legacy.css`
- `tests/helpers/load-renderer.cjs`
- the legacy-dialog-manager test

Characterisation coverage now inspects the typed domain and screen modules directly.

## Tests added

The new model and component tests cover:

- progress and category ordering;
- local task-date calculation;
- credential-free HTTPS validation;
- semantic controls and screen structure;
- manual completion;
- open-before-complete ordering;
- sequential Open remaining behaviour;
- one batched completion commit;
- stable IDs during category editing; and
- reviewed importer selection and editing.
