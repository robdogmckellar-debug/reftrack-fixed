export interface ImageCleanerSettings {
  enabled: boolean;
  folderPath: string | null;
}

export interface HotkeyBindingSetting {
  siteId: string;
  key: string;
}

export interface HotkeySettings {
  enabled: boolean;
  bindings: HotkeyBindingSetting[];
}

export interface AppSettings {
  darkMode: boolean;
  imageCleaner: ImageCleanerSettings;
  hotkeys: HotkeySettings;
}
