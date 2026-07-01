'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronExecutable = require('electron');
const outputDirectory = path.join(projectRoot, 'artifacts', 'performance');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(outputDirectory, `baseline-${timestamp}.json`);

fs.mkdirSync(outputDirectory, { recursive: true });

const child = spawn(electronExecutable, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    REFTRACK_PERF: '1',
    REFTRACK_PERF_AUTO_EXIT: '1',
    REFTRACK_PERF_OUTPUT: outputPath,
  },
});

child.on('error', (error) => {
  console.error('Could not start Electron for performance measurement:', error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Electron ended after receiving ${signal}.`);
    process.exitCode = 1;
    return;
  }

  if (code !== 0) {
    console.error(`Electron exited with code ${code}.`);
    process.exitCode = code || 1;
    return;
  }

  if (!fs.existsSync(outputPath)) {
    console.error('Electron exited without producing a performance report.');
    process.exitCode = 1;
    return;
  }

  console.log(`Performance baseline: ${outputPath}`);
});
