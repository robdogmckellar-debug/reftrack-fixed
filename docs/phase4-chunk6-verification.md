# Phase 4, Chunk 6 — Verification record

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
Test files:                    14 passed, 1 TODO-only file
Executed tests:                70 passed
Approved future-fix tests:     2 TODO
Main production build:         Passed
Preload production build:      Passed
Renderer production build:     Passed
npm audit:                     0 known vulnerabilities reported
```

Production bundle sizes:

```text
Main entry:             75.34 kB
Performance probe:       4.44 kB
Preload:                  3.00 kB
Renderer JavaScript:     64.51 kB
Renderer CSS:            72.03 kB
Renderer HTML:           28.63 kB
```

The main-process increase is the safe image scanner, protected-folder validation, Windows attribute check, Copy orchestration and cleanup event contract. No new package dependency was added.

## Automated safety coverage

Tests verify that:

- only verified top-level images are passed to the Recycle Bin adapter;
- a subfolder containing an image is never scanned;
- text files and fake image extensions are skipped;
- hidden/system and dot-files are skipped;
- filesystem roots, broad personal roots and linked folders are rejected;
- no file is moved if Windows attributes cannot be checked safely;
- one failed Recycle Bin move does not stop other eligible files;
- only one cleanup job runs at a time;
- rapid duplicate Copy actions are rejected before a second clipboard write;
- daily-limit failure does not touch the clipboard;
- the old recursive cleaner channel and code no longer exist.

## Windows 11 verification procedure

Use a dedicated disposable folder containing no valued files.

1. Extract the full Chunk 6 project into a new directory.
2. Run:

```powershell
npm ci
npm run verify
npm start
```

3. Create a folder such as:

```text
C:\Users\YourName\Pictures\RefTrack Cleaner Test
```

4. Add these fixtures:

- a real PNG;
- a real JPG;
- a text file;
- a text file renamed to `fake.png`;
- a subfolder containing another real PNG.

5. In Settings, enable Image Cleaner and select the test folder.
6. Click Copy Link on an available site.
7. Confirm immediately that the link is in the clipboard.
8. Confirm the completion message reports real moved/skipped/failed counts.
9. Confirm only the real top-level PNG and JPG moved to the Windows Recycle Bin.
10. Confirm the text file, `fake.png`, subfolder and nested PNG remain untouched.
11. Restore the two images from the Recycle Bin to verify recoverability.
12. Mark a valid image hidden with `attrib +h`, run another Copy, and confirm it remains.
13. Attempt to select `C:\`, the profile root, Desktop, Documents, Downloads or Pictures directly and confirm RefTrack rejects the choice.
14. Trigger Copy rapidly twice for a one-copy site and confirm only one transaction is recorded.
15. Close and reopen RefTrack and confirm the selected dedicated folder and enabled state persist.

## Runtime limitation in this environment

The Electron package binary was not present after installation in this Linux container, so the compiled graphical application could not be launched here. Type checking, static verification, unit/integration testing and all three production builds completed successfully. Windows shell and Recycle Bin behaviour must be confirmed with the procedure above on Windows 11.

## Remaining approved Phase 2 items

- restricted, resource-bounded partner importer;
- complete keyboard operation and managed dialog focus.
