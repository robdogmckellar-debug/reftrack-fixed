import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  FuseVersion,
  FuseV1Options,
  FuseWireState,
  flipFuses,
  getCurrentFuseWire,
} from './electron-fuses.mjs';
import { resolvePackagedExecutable, resolveUnpackedDirectory } from './packaged-app.mjs';

const MAX_CAPTURED_STDERR_CHARS = 2_000_000;

export function mergeDebugNamespaces(current, required = 'pw:browser*') {
  const values = new Set(
    `${current ?? ''},${required}`
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return [...values].join(',');
}

function serialiseError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return {
    name: 'NonErrorThrown',
    message: String(error),
    stack: null,
  };
}

function beginStderrCapture() {
  const originalWrite = process.stderr.write.bind(process.stderr);
  let captured = '';

  process.stderr.write = function patchedWrite(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (captured.length < MAX_CAPTURED_STDERR_CHARS) {
      captured += text.slice(0, MAX_CAPTURED_STDERR_CHARS - captured.length);
    }
    return originalWrite(chunk, encoding, callback);
  };

  return () => {
    process.stderr.write = originalWrite;
    return captured;
  };
}

async function removeWithRetries(directory) {
  await fsPromises.rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 500,
  });
}

/**
 * Playwright's Electron driver attaches to the main process through Electron's
 * Node inspector. The production RefTrack executable deliberately disables
 * that capability. To keep the shipped binary hardened, this function copies
 * win-unpacked to a temporary QA directory and enables only the inspector fuse
 * in that disposable copy.
 */
export async function preparePlaywrightRuntime(sourceDirectory = resolveUnpackedDirectory()) {
  const sourceExecutablePath = resolvePackagedExecutable(sourceDirectory);
  const sourceFuseWire = await getCurrentFuseWire(sourceExecutablePath);
  const sourceInspectorState = sourceFuseWire[FuseV1Options.EnableNodeCliInspectArguments];

  if (sourceInspectorState !== FuseWireState.DISABLE) {
    throw new Error(
      'The release executable must keep EnableNodeCliInspectArguments disabled. ' +
        'Run `npm run verify:package` before packaged automation.',
    );
  }

  const temporaryRoot = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'reftrack-playwright-runtime-'),
  );
  const runtimeDirectory = path.join(temporaryRoot, 'win-unpacked');

  try {
    await fsPromises.cp(sourceDirectory, runtimeDirectory, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });

    const executablePath = resolvePackagedExecutable(runtimeDirectory);
    const userDataDirectory = path.join(temporaryRoot, 'user-data');
    await fsPromises.mkdir(userDataDirectory, { recursive: true });
    await flipFuses(executablePath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableNodeCliInspectArguments]: true,
    });

    const automationFuseWire = await getCurrentFuseWire(executablePath);
    const automationInspectorState =
      automationFuseWire[FuseV1Options.EnableNodeCliInspectArguments];
    if (automationInspectorState !== FuseWireState.ENABLE) {
      throw new Error('Failed to enable the Node CLI inspector in the temporary QA executable.');
    }

    return {
      sourceDirectory,
      sourceExecutablePath,
      runtimeDirectory,
      executablePath,
      userDataDirectory,
      sourceInspectorEnabled: false,
      automationInspectorEnabled: true,
      async cleanup() {
        await removeWithRetries(temporaryRoot);
      },
    };
  } catch (error) {
    await removeWithRetries(temporaryRoot).catch(() => undefined);
    throw error;
  }
}

export async function launchPackagedAppForPlaywright({ timeout = 60_000 } = {}) {
  const runtime = await preparePlaywrightRuntime();
  const previousDebug = process.env.DEBUG;
  const debugNamespaces = mergeDebugNamespaces(previousDebug);
  process.env.DEBUG = debugNamespaces;
  const stopCapturingStderr = beginStderrCapture();

  try {
    // Import after DEBUG is configured so Playwright's debug logger is active.
    const { _electron: electron } = await import('@playwright/test');
    const electronApp = await electron.launch({
      executablePath: runtime.executablePath,
      args: [`--user-data-dir=${runtime.userDataDirectory}`],
      cwd: runtime.runtimeDirectory,
      timeout,
      env: {
        ...process.env,
        DEBUG: debugNamespaces,
      },
    });
    const launchStderr = stopCapturingStderr();

    if (previousDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = previousDebug;

    return {
      electronApp,
      runtime,
      launchStderr,
    };
  } catch (error) {
    const launchStderr = stopCapturingStderr();
    if (previousDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = previousDebug;

    const diagnostics = {
      sourceExecutablePath: runtime.sourceExecutablePath,
      automationExecutablePath: runtime.executablePath,
      userDataDirectory: runtime.userDataDirectory,
      sourceInspectorEnabled: runtime.sourceInspectorEnabled,
      automationInspectorEnabled: runtime.automationInspectorEnabled,
      debugNamespaces,
      launchStderr,
      error: serialiseError(error),
    };

    await runtime.cleanup().catch(() => undefined);
    const wrapped = new Error(
      'Playwright could not launch the disposable QA copy of RefTrack. ' +
        'The production executable was not modified.',
      { cause: error },
    );
    wrapped.diagnostics = diagnostics;
    throw wrapped;
  }
}

export function getPlaywrightLaunchDiagnostics(error) {
  return error && typeof error === 'object' && 'diagnostics' in error
    ? error.diagnostics
    : { error: serialiseError(error) };
}
