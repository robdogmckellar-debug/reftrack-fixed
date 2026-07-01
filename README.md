# RefTrack packaged smoke report fix

Replace the included files in the project while preserving their relative paths.

This correction fixes two false failures in the packaged smoke test:

- screen-aware document titles such as `Dashboard · RefTrack` are now expected;
- production DevTools are verified by attempting to open them and confirming the
  view remains closed, rather than relying on an omitted `getLastWebPreferences()`
  field.

No production application source, security configuration, data model, or UI
behaviour was changed.
