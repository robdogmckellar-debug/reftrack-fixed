import type { AppStateV1 } from '../../domain/app-state';
import { createDefaultAppState } from '../../domain/defaults';
import type { StorageStatus } from '../../shared/ipc/contract';
import { AtomicJsonStore, type StateLoadSource } from '../persistence/atomic-json-store';
import { migrateToCurrent } from '../persistence/migrations';
import { parseAppState } from '../persistence/state-schema';

export interface StateServiceInitialisation {
  source: StateLoadSource;
  recovered: boolean;
  revision: number;
  archivedPath: string | null;
}

export interface StateServiceOptions {
  filePath: string;
}

export class StateService {
  private state: AppStateV1;
  private queueTail: Promise<void> = Promise.resolve();
  private readonly storageStatus: StorageStatus;

  private constructor(
    private readonly store: AtomicJsonStore<AppStateV1>,
    initialState: AppStateV1,
    initialisation: StateServiceInitialisation,
  ) {
    this.state = parseAppState(initialState);
    this.storageStatus = {
      source: initialisation.source,
      recovered: initialisation.recovered,
      archivedPath: initialisation.archivedPath,
    };
  }

  static async create(
    options: StateServiceOptions,
  ): Promise<{ service: StateService; initialisation: StateServiceInitialisation }> {
    const store = new AtomicJsonStore<AppStateV1>({
      filePath: options.filePath,
      parse: parseAppState,
      createDefault: createDefaultAppState,
      migrate: migrateToCurrent,
    });
    const loaded = await store.load();
    const initialisation: StateServiceInitialisation = {
      source: loaded.source,
      recovered: loaded.recovered,
      revision: loaded.state.revision,
      archivedPath: loaded.archivedPath,
    };

    return {
      service: new StateService(store, loaded.state, initialisation),
      initialisation,
    };
  }

  getStorageStatus(): StorageStatus {
    return { ...this.storageStatus };
  }

  getSnapshot(): AppStateV1 {
    return structuredClone(this.state);
  }

  replace(candidate: AppStateV1): Promise<AppStateV1> {
    return this.enqueue(async () => {
      const parsedCandidate = parseAppState(candidate);
      const nextState = parseAppState({
        ...parsedCandidate,
        schemaVersion: this.state.schemaVersion,
        revision: this.state.revision + 1,
      });

      await this.store.save(nextState, this.state);
      this.state = nextState;
      return this.getSnapshot();
    });
  }

  update(mutator: (draft: AppStateV1) => void | AppStateV1): Promise<AppStateV1> {
    return this.enqueue(async () => {
      const draft = this.getSnapshot();
      const result = mutator(draft);
      const candidate = result ?? draft;
      const nextState = parseAppState({
        ...candidate,
        schemaVersion: this.state.schemaVersion,
        revision: this.state.revision + 1,
      });

      await this.store.save(nextState, this.state);
      this.state = nextState;
      return this.getSnapshot();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.queueTail.then(operation, operation);
    this.queueTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }
}
