# Phase 4, Chunk 9A — Verification record

## Automated verification

Executed from a clean `npm ci` installation:

| Check                            | Result                      |
| -------------------------------- | --------------------------- |
| Strict TypeScript project build  | Passed                      |
| ESLint                           | Passed                      |
| Prettier verification            | Passed                      |
| Test files                       | 23 passed, 1 TODO-only file |
| Executed tests                   | 102 passed                  |
| Approved future-fix placeholders | 1 TODO                      |
| Main-process production build    | Passed                      |
| Importer-worker production build | Passed                      |
| Preload production build         | Passed                      |
| Renderer production build        | Passed                      |
| npm high-severity audit          | 0 known vulnerabilities     |

## Renderer output

| Asset                                          |  Raw size | Approximate gzip size |
| ---------------------------------------------- | --------: | --------------------: |
| Preact renderer shell and Dashboard JavaScript | 123.28 kB |               29.5 kB |
| Transitional legacy screen JavaScript          |  68.35 kB |               15.5 kB |
| Combined renderer CSS                          | 104.50 kB |               15.2 kB |
| Renderer HTML                                  |   0.73 kB |                     — |

The shell JavaScript increase is the complete typed Dashboard implementation. No package dependency was added. The transitional bundle remains separately loaded and will shrink as the remaining screens are migrated.

## Behaviour covered by tests

- Referral date and link formatting.
- Summary derivation.
- All, Ready, and Complete filtering.
- Per-site signal reconciliation.
- Copy command text and returned-snapshot update.
- Success recording.
- Exact activity-ID undo.
- Semantic Dashboard regions and site cards.
- Existing date, statistics, Daily Task, storage, IPC, importer, and Image Cleaner regressions.

## Runtime limitation

The graphical Electron executable was unavailable in the Linux build environment. A Chromium screenshot attempt also could not complete because the container's Chromium process did not enter a functional headless state. Therefore visual layout, Windows caption-control integration, display scaling, and packaged interaction still require Windows 11 confirmation.

## Windows 11 acceptance checklist

1. Start RefTrack at its normal window size and confirm the Dashboard is fully visible below the title bar.
2. Confirm the normal layout displays three site-card columns and the Activity panel without horizontal scrolling.
3. Resize narrower and confirm the site grid changes to two columns without overlapping actions.
4. Verify All, Ready, and Complete filters.
5. Click Copy Link and confirm only that card enters a pending state.
6. Confirm the returned daily progress, summary, Activity entry, and toast update without visible page flashing.
7. Rapidly click Copy Link and confirm one transaction is recorded.
8. Record a success and use Undo; confirm the exact success is removed.
9. Open a site name and confirm the validated HTTPS link opens in the default browser.
10. Clear Activity and confirm historical Statistics remain unchanged.
11. Navigate to Statistics after Dashboard actions and confirm the new data is immediately present.
12. Leave RefTrack open across midnight or resume it the following day and confirm daily card progress resets.
13. Verify keyboard tab order, filter activation, site actions, toast dismissal, and Undo.
14. Verify 125%, 150%, and 200% Windows display scaling.
15. Verify Windows high-contrast and reduced-motion modes.
