# Phase 4, Chunk 9B — Site Editor replacement

## Scope

This chunk replaces the visible Site Editor with strict TypeScript and Preact. It does not redesign Statistics, Settings, or Daily Tasks.

## Delivered architecture

The active Site Editor now lives under:

```text
src/renderer/screens/site-editor/
├── SiteEditorScreen.tsx
├── site-editor-model.ts
└── components/
    ├── SiteForm.tsx
    └── SiteList.tsx
```

Its styling is isolated in `src/renderer/styles/site-editor.css` and uses the shared semantic design tokens introduced in Chunk 8.

The old Site Editor markup, renderer functions, event bindings, and screen-specific legacy CSS were removed. The JavaScript compatibility module now contains only the remaining Statistics, Settings, and Daily Tasks implementations, plus the retired Dashboard structures that are still needed temporarily by shared legacy callbacks.

## Master-detail behaviour

- The first configured site is selected automatically.
- Site rows are semantic listbox options.
- Arrow Up, Arrow Down, Home, and End move between configured sites.
- The selected site is visually and programmatically identified.
- New-site mode is shown separately from existing-site selection.
- After deletion, the next logical site is selected. If none remain, the editor presents a useful first-site state.

## Typed form model

`site-editor-model.ts` owns:

- the supported date/time formats;
- conversion from the renderer site view model to stable text input values;
- exact draft comparison for unsaved-change detection;
- referral-message preview generation; and
- validation and normalisation into `SiteUpsertRequest`.

The form validates:

- required site name;
- 100-character site-name limit;
- optional credential-free HTTPS referral URL;
- 500-character prefix and suffix limits;
- supported date/time format;
- non-negative bonus with no more than two decimal places; and
- a whole-number daily limit from 0 to 1,000, where 0 means unlimited.

The main-process IPC schema now also rejects insecure or credentialed site URLs. The UI check is therefore not the only enforcement boundary.

## Unsaved-change protection

A renderer navigation guard now prevents silent data loss when the active Site Editor has unsaved changes.

The confirmation is shown before:

- selecting another site;
- starting a new site; or
- navigating to another primary screen.

The safe action receives initial keyboard focus. Focus is restored or moved to the confirmed destination after the decision.

Cancel behaves as follows:

- existing site: restore the last committed values;
- new site: return to the previously selected site, or the first available site.

## Save and delete flow

Save uses one typed `sites.upsert` command. The form does not optimistically mutate canonical data. It refreshes from the committed snapshot returned by the main process.

Delete uses the existing typed `sites.delete` command and a shared accessible dialog with:

- descriptive title and consequence text;
- initial focus on Cancel;
- Escape handling;
- focus containment;
- backdrop protection while deletion is pending; and
- explicit pending state on the destructive action.

The confirmation states that copy history, successes, earnings, and activity entries are removed, matching the main-process command behaviour.

## UI and accessibility changes

- Clear two-pane desktop layout with responsive widths.
- Larger readable typography and higher-contrast secondary text.
- Grouped Identity/Limits and Referral Message sections.
- Persistent save-state indicator: saved, unsaved, saving, information, or error.
- Inline field errors associated through `aria-describedby`.
- `aria-invalid` on invalid controls.
- Real form and field labels.
- Live referral-message preview.
- Keyboard-operable site list.
- Visible focus indicators inherited from the design system.
- No emoji-based editor controls.
- Sticky Save, Cancel, and separated Delete actions.

## Behaviour retained

- Site names are normalised to uppercase when saved.
- Blank referral URLs are allowed, but Dashboard copy remains unavailable until a URL is configured.
- Existing prefix, suffix, date-format, bonus, and daily-limit behaviour is retained.
- Deleting a site removes its statistics as approved in Chunk 5.
- All changes persist through the main-owned atomic state service.

## Performance characteristics

- The screen uses controlled Preact components rather than `innerHTML` reconstruction.
- No manual event rebinding occurs after a save or selection.
- Draft changes stay local and produce no IPC calls until Save.
- The site list and form update without reconstructing unrelated legacy screens.
- The removed legacy editor reduces the transitional JavaScript bundle despite adding the typed replacement.
