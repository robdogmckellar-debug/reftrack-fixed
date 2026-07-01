# Windows packaged Playwright launch

## Why direct launch failed

Playwright's Electron automation uses Electron's main-process Node inspector. RefTrack 2.0 deliberately ships with the `EnableNodeCliInspectArguments` fuse disabled. Playwright documents that Electron launch can time out or fail when this fuse is false.

Changing the system Node.js version or reinstalling Playwright does not alter a fuse embedded in `RefTrack.exe`.

## Implemented release-safe approach

The final release executable remains hardened. Before a packaged smoke or accessibility run, RefTrack now:

1. verifies that the release executable has the inspector fuse disabled;
2. copies `dist\\win-unpacked` to a unique temporary directory;
3. enables only the inspector fuse in the copied executable;
4. gives the QA run a temporary `--user-data-dir` so normal RefTrack data is untouched;
5. launches that copied executable with Playwright;
6. captures `pw:browser*` launch diagnostics; and
7. removes the entire temporary runtime after the test.

The NSIS installer, portable executable, and `dist\\win-unpacked\\RefTrack.exe` are never modified by automation.

## Commands

```powershell
npm run verify:package
npm run test:smoke:packaged
npm run test:a11y:packaged
```

If launch fails, inspect the newest JSON file in:

```text
artifacts\\smoke
artifacts\\accessibility
```

The automation target is the unpacked application directory. Do not point Playwright at `RefTrack-Portable-2.0.0-x64.exe`; that file is a portable wrapper, not the stable unpacked runtime used by the test harness.

## Smoke-test title and DevTools checks

RefTrack intentionally changes the document title with the active screen, for
example `Dashboard · RefTrack` and `Settings · RefTrack`. The packaged smoke
test validates the title for every screen instead of requiring a static
`RefTrack` title.

Electron's `webContents.getLastWebPreferences()` result does not reliably
include the `devTools` constructor option. The smoke test therefore validates
the documented behaviour directly: it requests DevTools on the disposable QA
copy and confirms that no DevTools view opens. This does not weaken the shipped
executable or change its `devTools: false` production configuration.
