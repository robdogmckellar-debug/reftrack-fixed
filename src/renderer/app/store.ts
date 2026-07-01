import { batch, computed, signal } from '@preact/signals';

import type { RendererSnapshot } from '../../shared/view-model/renderer-snapshot';
import { resetDashboardStore, synchroniseDashboard } from '../screens/dashboard/dashboard-store';

export const SCREEN_IDS = ['dashboard', 'editor', 'statistics', 'settings', 'tasks'] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];
export type BootStatus = 'idle' | 'loading' | 'ready' | 'failed';

export type NavigationGuard = (target: ScreenId) => boolean;

export interface RendererFailure {
  code: string;
  message: string;
  recoverable: boolean;
}

export const activeScreen = signal<ScreenId>('dashboard');
export const rendererSnapshot = signal<RendererSnapshot | null>(null);
export const bootStatus = signal<BootStatus>('idle');
export const bootFailure = signal<RendererFailure | null>(null);

export const activeScreenTitle = computed(() => {
  switch (activeScreen.value) {
    case 'dashboard':
      return 'Dashboard';
    case 'editor':
      return 'Site Editor';
    case 'statistics':
      return 'Statistics';
    case 'settings':
      return 'Settings';
    case 'tasks':
      return 'Daily Tasks';
  }
});

let bootstrapPromise: Promise<void> | null = null;
let navigationGuard: NavigationGuard | null = null;

function normaliseFailure(error: unknown): RendererFailure {
  if (error instanceof Error) {
    return {
      code: 'RENDERER_ERROR',
      message: error.message || 'RefTrack could not start.',
      recoverable: true,
    };
  }

  return {
    code: 'RENDERER_ERROR',
    message: 'RefTrack could not start.',
    recoverable: true,
  };
}

export function publishSnapshot(snapshot: RendererSnapshot): void {
  rendererSnapshot.value = snapshot;
  synchroniseDashboard(snapshot);
}

export function getCurrentSnapshot(): RendererSnapshot | null {
  return rendererSnapshot.peek();
}

export function navigateTo(screen: ScreenId): boolean {
  if (screen === activeScreen.peek()) return true;
  if (navigationGuard && !navigationGuard(screen)) return false;
  activeScreen.value = screen;
  return true;
}

export function completeGuardedNavigation(screen: ScreenId): void {
  activeScreen.value = screen;
}

export function registerNavigationGuard(guard: NavigationGuard): () => void {
  navigationGuard = guard;
  return () => {
    if (navigationGuard === guard) navigationGuard = null;
  };
}

export function resetRendererForRetry(): void {
  bootstrapPromise = null;
  navigationGuard = null;
  batch(() => {
    rendererSnapshot.value = null;
    resetDashboardStore();
    bootStatus.value = 'idle';
    bootFailure.value = null;
  });
}

export function bootstrapRenderer(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    batch(() => {
      bootStatus.value = 'loading';
      bootFailure.value = null;
    });

    try {
      const result = await window.reftrack.bootstrap();
      if (!result.ok) {
        batch(() => {
          bootStatus.value = 'failed';
          bootFailure.value = {
            code: result.error.code,
            message: result.error.message,
            recoverable: result.error.recoverable,
          };
        });
        return;
      }

      batch(() => {
        publishSnapshot(result.data.snapshot);
        bootStatus.value = 'ready';
        bootFailure.value = null;
      });
    } catch (error) {
      batch(() => {
        bootStatus.value = 'failed';
        bootFailure.value = normaliseFailure(error);
      });
    }
  })();

  return bootstrapPromise;
}
