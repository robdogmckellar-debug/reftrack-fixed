RefTrack source-map packaging fix

Replace electron-builder.yml and tests/characterization/project-baseline.test.js
in the existing project, then rebuild the Windows package before running
npm run verify:package.

Recommended command:
  npm run package:dir
  npm run verify:package

The previous win-unpacked directory still contains source maps and cannot pass
verification until it is rebuilt.
