import type {
  CopyLinkRequest,
  CopyLinkResponse,
  ImageCleanupStart,
  SnapshotResponse,
} from '../../shared/ipc/contract';
import { ApplicationError } from './application-error';

export interface CopyCommandPort {
  assertCopyAllowed(siteId: string, occurredAt: string): void;
  recordCopy(siteId: string, occurredAt: string): Promise<SnapshotResponse>;
}

export interface ImageCleanupCoordinatorPort {
  start(folderPath: string): ImageCleanupStart;
}

export interface CopyActionServiceOptions {
  commands: CopyCommandPort;
  cleanupCoordinator: ImageCleanupCoordinatorPort;
  writeClipboard(text: string, imagePath?: string | null): void;
}

export class CopyActionService {
  private readonly activeSiteIds = new Set<string>();

  constructor(private readonly options: CopyActionServiceOptions) {}

  async copy(request: CopyLinkRequest): Promise<CopyLinkResponse> {
    if (this.activeSiteIds.has(request.siteId)) {
      throw new ApplicationError('ACTION_IN_PROGRESS', 'That link is already being copied.', {
        field: 'siteId',
        recoverable: true,
      });
    }

    this.activeSiteIds.add(request.siteId);
    try {
      this.options.commands.assertCopyAllowed(request.siteId, request.occurredAt);
      try {
        if (request.imagePath) this.options.writeClipboard(request.text, request.imagePath);
        else this.options.writeClipboard(request.text);
      } catch (error: unknown) {
        throw new ApplicationError('CLIPBOARD_FAILED', 'Windows could not update the clipboard.', {
          recoverable: true,
          cause: error,
        });
      }

      const response = await this.options.commands.recordCopy(request.siteId, request.occurredAt);
      return {
        ...response,
        cleanup: this.startCleanup(response.snapshot.settings),
      };
    } finally {
      this.activeSiteIds.delete(request.siteId);
    }
  }

  private startCleanup(settings: {
    folderClearEnabled: boolean;
    folderClearPath: string | null;
  }): ImageCleanupStart {
    if (!settings.folderClearEnabled) return { status: 'disabled', jobId: null };
    if (!settings.folderClearPath) return { status: 'not-configured', jobId: null };
    return this.options.cleanupCoordinator.start(settings.folderClearPath);
  }
}
