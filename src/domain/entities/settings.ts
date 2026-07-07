export interface ImageCleanerSettings {
  enabled: boolean;
  folderPath: string | null;
  /** Electron accelerator for the global "run cleanup now" shortcut, or null. */
  hotkey: string | null;
}

export interface AppSettings {
  darkMode: boolean;
  imageCleaner: ImageCleanerSettings;
}
