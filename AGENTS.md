# RefTrack

RefTrack is a local, offline-first **Electron + Preact + Vite (electron-vite)** desktop app (a referral link manager and earnings tracker). It is packaged for Windows 11 in production, but the dev environment (`electron-vite dev`) runs fine on Linux via X11.

## Cursor Cloud specific instructions

- Standard commands live in `package.json` scripts — use them rather than re-deriving: `npm run lint` (ESLint), `npm run typecheck` (`tsc -b`), `npm test` (Vitest, jsdom), `npm run format:check` (Prettier), `npm run build:app` (electron-vite build), and `npm start` (electron-vite dev). `npm run verify` chains typecheck + lint + format + test + build.
- **Electron binary gotcha:** the pinned `electron@43.0.0` package has **no `postinstall` script**, so `npm ci`/`npm install` does _not_ download the Electron runtime. The startup update script runs `node node_modules/electron/install.js` after install to fetch it; if `npm start` ever fails with a missing-binary/`ELECTRON_RUN_AS_NODE`-style error, run that command manually. `npm ci` wipes `node_modules`, so the binary must be re-fetched after every clean install.
- **Running the GUI:** a display is available on `DISPLAY=:1`. Just run `npm start` (or `npm run dev` for `--watch`). Do not add `--no-sandbox`; the Chrome sandbox works as the non-root `ubuntu` user.
- **Benign runtime noise:** in the container Electron logs `dbus`/`atom_cache` errors and `libnotify` "Failed to connect to proxy" / "unsupported transport 'disabled'" warnings. These are just OS-level desktop-notification/DBus integrations being unavailable and do **not** indicate a crash — the app renders and functions normally.
- App state persists to `~/.config/reftrack/reftrack-state-v1.json` (Electron `userData`). On a fresh VM it starts with seeded sample sites and shows a "Started with fresh data" banner; delete that file to reset state.
- The `test:*:packaged`, `perf:packaged`, and `release:*` scripts target a built **Windows** package (electron-builder `--win`) and are not runnable on the Linux dev VM; they are for the Windows release pipeline only.
