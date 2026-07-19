export interface ImageCleanerSettings {
  enabled: boolean;
  folderPath: string | null;
  /** Electron accelerator for the global "run cleanup now" shortcut, or null. */
  hotkey: string | null;
}

export interface ImageCompressorSettings {
  enabled: boolean;
  folderPath: string | null;
  quality: number;
}

export interface FacebookGroupShare {
  id: string;
  label: string;
  groupUrl: string;
  currentPostUrl: string | null;
  useMostRecentPost: boolean;
}

export interface FacebookGroupShareSettings {
  groups: FacebookGroupShare[];
}

/**
 * Shared configuration for the automated site check-in flow. Every targeted
 * site uses the same login/check-in system, so these paths and selectors are
 * global defaults rather than per-site settings. They can be tuned once if a
 * site's markup ever differs.
 */
export interface CheckinSettings {
  scheduleEnabled: boolean;
  scheduleTime: string;
  lastScheduledRunDate: string | null;
  loginPath: string;
  checkinPath: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  checkinButtonSelector: string;
  dismissSelector: string;
  successSelector: string;
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
  imageCompressor: ImageCompressorSettings;
  facebookGroupShares: FacebookGroupShareSettings;
  checkin: CheckinSettings;
  hotkeys: HotkeySettings;
}

export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = {
  scheduleEnabled: false,
  scheduleTime: '09:00',
  lastScheduledRunDate: null,
  loginPath: '/login',
  checkinPath: '/daily-checkin',
  usernameSelector:
    'form input[type="text"], form input[type="email"], form input[name="username"]',
  passwordSelector: 'form input[type="password"]',
  submitSelector: 'form a.btn.login, form .btn.login, form .login',
  checkinButtonSelector:
    '.checkin-page-button-container button.checkin-page-button, button.checkin-page-button',
  dismissSelector: 'button.btn-secondary-flex',
  successSelector: '',
};
