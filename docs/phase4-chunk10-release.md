# Phase 4, Chunk 10 — Windows release engineering and final QA

Chunk 10 converts the completed RefTrack redesign into a deterministic Windows 11 x64 release pipeline.

## Release outputs

`npm run package:win` creates:

- `RefTrack-Setup-2.0.0-x64.exe` — assisted per-user NSIS installer;
- `RefTrack-Portable-2.0.0-x64.exe` — portable executable; and
- `win-unpacked/` — unpacked application used by automated verification.

The installer never requires elevation, preserves `%APPDATA%\\reftrack` during uninstall, and creates Start Menu and optional Desktop shortcuts. The portable executable uses the same normal RefTrack data location; it is application-portable, not data-portable.

## Package contents

Only the compiled `out` tree, runtime icon, production package metadata, and production dependencies are admitted to `app.asar`. Source, tests, documentation, build configuration, source maps, and development dependencies are rejected by `npm run verify:package`.

## Electron hardening

The release configuration enables ASAR integrity and requires code to load from `app.asar`. It disables Electron-as-Node, Node option environment variables, CLI inspector arguments, and the extra privileges historically granted to `file://`. Cookie encryption remains enabled. RefTrack continues to use its private `reftrack://` application protocol.

### Playwright automation without weakening the release

Playwright's Electron driver requires Electron's main-process CLI inspector. The shipped RefTrack executable deliberately keeps that fuse disabled. The packaged smoke and accessibility scripts therefore copy `dist\win-unpacked` to a temporary QA directory, enable only `EnableNodeCliInspectArguments` in that disposable copy, use a temporary user-data directory, run automation, and delete the copy afterward. `npm run verify:package` continues to require the inspector fuse to be disabled in the actual release executable.

The Playwright scripts use `dist\win-unpacked\RefTrack.exe`, not the portable self-extracting wrapper. They also enable `DEBUG=pw:browser*` during launch and write a diagnostic JSON report if Playwright cannot attach.

## Automated Windows release pipeline

Run on Windows 11 x64:

```powershell
npm ci
npm run release:win
```

The pipeline performs:

1. strict TypeScript, lint, formatting, unit/component tests, and production compilation;
2. NSIS, portable, and unpacked Windows packaging;
3. ASAR content, integrity metadata, locale, and fuse verification;
4. a packaged Electron smoke test across all five screens and the single-instance rule;
5. axe-core WCAG 2.2 AA automated checks for all screens and major dialogs;
6. three packaged startup/memory samples; and
7. SHA-256 release manifest generation.

## Performance comparison

Run the original baseline command on the pre-redesign build and retain its JSON report. After `npm run perf:packaged`, compare reports with:

```powershell
npm run perf:compare -- --before C:\path\to\baseline.json --after C:\path\to\packaged-summary.json
```

The comparator flags startup regressions above 10% and working-set increases above 15 MiB for review. It does not hide missing measurements or claim a pass without comparable data.

## Manual release acceptance

Automated checks do not replace:

- Windows Narrator review;
- keyboard-only completion of every workflow;
- 125%, 150%, and 200% display-scaling checks;
- Windows forced-colour and reduced-motion checks;
- real Recycle Bin operation with disposable images;
- real browser-opening and partner-import checks; and
- installer install, upgrade, uninstall, and portable-launch checks.

The application is intentionally unsigned and has no auto-update channel because this release is for local personal use. Windows may show a reputation warning for the unsigned executables.
