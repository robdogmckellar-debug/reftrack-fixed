import { ApplicationError } from '../services/application-error';
import { runStaticImport } from './static-import';
import {
  errorWorkerMessage,
  progressWorkerMessage,
  resultWorkerMessage,
  WorkerStartMessageSchema,
} from './worker-protocol';

const importerPort = process.parentPort;
if (!importerPort) {
  throw new Error('RefTrack importer worker requires an Electron utility-process parent port.');
}

let started = false;
const abortController = new AbortController();

importerPort.on('message', (event) => {
  if (started) return;
  const parsed = WorkerStartMessageSchema.safeParse(event.data);
  if (!parsed.success) return;
  started = true;
  void execute(parsed.data.jobId, parsed.data.url);
});

async function execute(jobId: string, url: string): Promise<void> {
  try {
    const result = await runStaticImport(url, {
      signal: abortController.signal,
      reportProgress: (progress) => {
        importerPort.postMessage(
          progressWorkerMessage(jobId, progress.stage, progress.message, progress.percent),
        );
      },
    });
    importerPort.postMessage(resultWorkerMessage(jobId, result));
    process.exitCode = 0;
  } catch (error: unknown) {
    const applicationError = normaliseError(error);
    importerPort.postMessage(
      errorWorkerMessage(jobId, {
        code: applicationError.code,
        message: applicationError.message,
        recoverable: applicationError.options.recoverable ?? false,
      }),
    );
    process.exitCode = applicationError.code === 'IMPORT_CANCELLED' ? 0 : 1;
  }
}

function normaliseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError('IMPORT_FAILED', 'The partner page could not be analysed.', {
    recoverable: true,
    cause: error,
  });
}
