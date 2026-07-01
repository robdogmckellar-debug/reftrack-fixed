export interface ImageCleanerSettings {
  enabled: boolean;
  folderPath: string | null;
}

export interface AppSettings {
  darkMode: boolean;
  imageCleaner: ImageCleanerSettings;
}
