import type { JSX } from 'preact';

import type { RendererSite } from '../../../../shared/view-model/renderer-snapshot';
import { ExternalLinkIcon, TrashIcon } from '../../../components/icons';
import { Button } from '../../../design-system/Button';
import { ToggleSwitch } from '../../../design-system/ToggleSwitch';
import {
  DATE_FORMAT_OPTIONS,
  buildSiteDraftPreview,
  type SiteEditorDraft,
  type SiteEditorField,
} from '../site-editor-model';

interface EditorFeedback {
  tone: 'success' | 'danger' | 'info';
  message: string;
}

interface SiteFormProps {
  draft: SiteEditorDraft;
  errors: Partial<Record<SiteEditorField, string>>;
  selectedSite: RendererSite | null;
  creating: boolean;
  dirty: boolean;
  saving: boolean;
  lifecyclePending: boolean;
  appClaimPending: string | null;
  feedback: EditorFeedback | null;
  onChange(field: SiteEditorField, value: string | boolean): void;
  onFieldBlur(field: SiteEditorField): void;
  onSubmit(event: JSX.TargetedSubmitEvent<HTMLFormElement>): void;
  onCancel(): void;
  onDelete(): void;
  onArchive(): void;
  onRestore(): void;
  onOpenLink(): void;
  onSelectApk(): void;
  onInstallApk(): void;
  onLaunchAndroidPackage(): void;
  onOpenAppClaimLink(kind: 'download' | 'deep-link'): void;
}

function fieldDescriptionId(field: SiteEditorField): string {
  return `site-editor-${field}-description`;
}

function fieldErrorId(field: SiteEditorField): string {
  return `site-editor-${field}-error`;
}

function describedBy(field: SiteEditorField, error: string | undefined): string {
  return error ? `${fieldDescriptionId(field)} ${fieldErrorId(field)}` : fieldDescriptionId(field);
}

function FieldError({
  field,
  message,
}: {
  field: SiteEditorField;
  message: string | undefined;
}): JSX.Element {
  return message ? (
    <span id={fieldErrorId(field)} class="site-editor-field-error">
      {message}
    </span>
  ) : (
    <></>
  );
}

function isOpenableHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function SiteForm({
  draft,
  errors,
  selectedSite,
  creating,
  dirty,
  saving,
  lifecyclePending,
  appClaimPending,
  feedback,
  onChange,
  onFieldBlur,
  onSubmit,
  onCancel,
  onDelete,
  onArchive,
  onRestore,
  onOpenLink,
  onSelectApk,
  onInstallApk,
  onLaunchAndroidPackage,
  onOpenAppClaimLink,
}: SiteFormProps): JSX.Element {
  const preview = buildSiteDraftPreview(draft);
  const hasValidOpenableUrl = (() => {
    try {
      const url = new URL(draft.url.trim());
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  })();
  const hasValidDownloadUrl = isOpenableHttpsUrl(draft.appClaimDownloadUrl);
  const canInstallApk = draft.appClaimApkPath.trim().toLowerCase().endsWith('.apk');
  const canLaunchPackage = draft.appClaimPackageName.trim().length > 0;
  const canOpenDeepLink = draft.appClaimDeepLinkUrl.trim().length > 0;

  const status = saving
    ? { tone: 'info' as const, message: 'Saving changes…' }
    : dirty
      ? { tone: 'warning' as const, message: 'Changes not saved' }
      : feedback
        ? feedback
        : { tone: 'success' as const, message: 'All changes saved' };

  return (
    <section class="site-editor-form-panel" aria-label={creating ? 'New site' : 'Edit site'}>
      <form
        class="site-editor-form"
        aria-label={creating ? 'New site form' : 'Edit site form'}
        noValidate
        onSubmit={onSubmit}
      >
        <header class="site-editor-form__header">
          <div>
            <span class="site-editor-eyebrow">
              {creating ? 'New configuration' : 'Site details'}
            </span>
            <h2>{creating ? 'Add a referral site' : selectedSite?.name}</h2>
            <p>
              {creating
                ? 'Create a reusable link template for the Dashboard.'
                : 'Update the referral message, bonus, and daily copy behaviour.'}
            </p>
          </div>
          <div
            class={`site-editor-save-state site-editor-save-state--${status.tone}`}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {status.message}
          </div>
        </header>

        {feedback?.tone === 'danger' ? (
          <div class="site-editor-command-error" role="alert">
            <strong>Site could not be saved.</strong>
            <span>{feedback.message}</span>
          </div>
        ) : null}

        <div class="site-editor-form__scroll-region">
          <fieldset class="site-editor-form-section">
            <legend>
              <span>Identity and limits</span>
              <small>How this site appears and how successes are valued.</small>
            </legend>

            <div class="site-editor-form-grid site-editor-form-grid--three">
              <label class="site-editor-field" for="site-editor-name">
                <span class="site-editor-field__label">
                  Site name <span aria-hidden="true">*</span>
                </span>
                <input
                  id="site-editor-name"
                  name="name"
                  type="text"
                  value={draft.name}
                  maxLength={100}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={describedBy('name', errors.name)}
                  onInput={(event) => onChange('name', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('name')}
                />
                <span id={fieldDescriptionId('name')} class="site-editor-field-help">
                  Saved in uppercase so cards remain consistent.
                </span>
                <FieldError field="name" message={errors.name} />
              </label>

              <label class="site-editor-field" for="site-editor-bonus">
                <span class="site-editor-field__label">
                  Success bonus <span aria-hidden="true">*</span>
                </span>
                <span class="site-editor-money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    id="site-editor-bonus"
                    name="bonus"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.bonus}
                    aria-invalid={Boolean(errors.bonus)}
                    aria-describedby={describedBy('bonus', errors.bonus)}
                    onInput={(event) => onChange('bonus', event.currentTarget.value)}
                    onBlur={() => onFieldBlur('bonus')}
                  />
                </span>
                <span id={fieldDescriptionId('bonus')} class="site-editor-field-help">
                  Earnings recorded for each Success action.
                </span>
                <FieldError field="bonus" message={errors.bonus} />
              </label>

              <label class="site-editor-field" for="site-editor-maxCopiesPerDay">
                <span class="site-editor-field__label">Daily copy limit</span>
                <input
                  id="site-editor-maxCopiesPerDay"
                  name="maxCopiesPerDay"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000"
                  step="1"
                  value={draft.maxCopiesPerDay}
                  aria-invalid={Boolean(errors.maxCopiesPerDay)}
                  aria-describedby={describedBy('maxCopiesPerDay', errors.maxCopiesPerDay)}
                  onInput={(event) => onChange('maxCopiesPerDay', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('maxCopiesPerDay')}
                />
                <span id={fieldDescriptionId('maxCopiesPerDay')} class="site-editor-field-help">
                  Use 0 for unlimited copies.
                </span>
                <FieldError field="maxCopiesPerDay" message={errors.maxCopiesPerDay} />
              </label>

              <label class="site-editor-field" for="site-editor-payoutThreshold">
                <span class="site-editor-field__label">Payout threshold</span>
                <span class="site-editor-money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    id="site-editor-payoutThreshold"
                    name="payoutThreshold"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.payoutThreshold}
                    aria-invalid={Boolean(errors.payoutThreshold)}
                    aria-describedby={describedBy('payoutThreshold', errors.payoutThreshold)}
                    onInput={(event) => onChange('payoutThreshold', event.currentTarget.value)}
                    onBlur={() => onFieldBlur('payoutThreshold')}
                  />
                </span>
                <span id={fieldDescriptionId('payoutThreshold')} class="site-editor-field-help">
                  Use 0 when the program has no known minimum.
                </span>
                <FieldError field="payoutThreshold" message={errors.payoutThreshold} />
              </label>
            </div>
          </fieldset>

          <fieldset class="site-editor-form-section site-editor-form-section--app-claim">
            <legend>
              <span>App claim</span>
              <small>Track APK/emulator claims for sites that require their Android app.</small>
            </legend>

            <div class="site-editor-app-claim-toggle">
              <ToggleSwitch
                id="site-editor-appClaimEnabled"
                label="Requires app claim"
                description="Use this when a bonus has to be claimed from the Android app or emulator."
                checked={draft.appClaimEnabled}
                onChange={(checked) => onChange('appClaimEnabled', checked)}
              />
            </div>

            <div class="site-editor-field site-editor-field--full">
              <label class="site-editor-field__label" for="site-editor-appClaimDownloadUrl">
                APK or app download page
              </label>
              <div class="site-editor-url-row">
                <input
                  id="site-editor-appClaimDownloadUrl"
                  name="appClaimDownloadUrl"
                  type="url"
                  inputMode="url"
                  value={draft.appClaimDownloadUrl}
                  maxLength={2048}
                  placeholder="https://example.com/download"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.appClaimDownloadUrl)}
                  aria-describedby={describedBy('appClaimDownloadUrl', errors.appClaimDownloadUrl)}
                  onInput={(event) => onChange('appClaimDownloadUrl', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('appClaimDownloadUrl')}
                />
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={<ExternalLinkIcon size={15} />}
                  disabled={!hasValidDownloadUrl || saving || appClaimPending !== null}
                  pending={appClaimPending === 'open-download'}
                  onClick={() => onOpenAppClaimLink('download')}
                >
                  Open
                </Button>
              </div>
              <span id={fieldDescriptionId('appClaimDownloadUrl')} class="site-editor-field-help">
                Store the official page you use to download the APK or open the app claim.
              </span>
              <FieldError field="appClaimDownloadUrl" message={errors.appClaimDownloadUrl} />
            </div>

            <div class="site-editor-field site-editor-field--full">
              <label class="site-editor-field__label" for="site-editor-appClaimApkPath">
                APK file
              </label>
              <div class="site-editor-url-row">
                <input
                  id="site-editor-appClaimApkPath"
                  name="appClaimApkPath"
                  type="text"
                  value={draft.appClaimApkPath}
                  maxLength={32767}
                  placeholder="C:\Downloads\site-app.apk"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.appClaimApkPath)}
                  aria-describedby={describedBy('appClaimApkPath', errors.appClaimApkPath)}
                  onInput={(event) => onChange('appClaimApkPath', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('appClaimApkPath')}
                />
                <Button
                  variant="secondary"
                  size="small"
                  disabled={saving || appClaimPending !== null}
                  pending={appClaimPending === 'select-apk'}
                  onClick={onSelectApk}
                >
                  Choose APK
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!canInstallApk || saving || appClaimPending !== null}
                  pending={appClaimPending === 'install-apk'}
                  onClick={onInstallApk}
                >
                  Install
                </Button>
              </div>
              <span id={fieldDescriptionId('appClaimApkPath')} class="site-editor-field-help">
                Installs to a connected emulator, or starts the saved AVD first.
              </span>
              <FieldError field="appClaimApkPath" message={errors.appClaimApkPath} />
            </div>

            <div class="site-editor-form-grid">
              <label class="site-editor-field" for="site-editor-appClaimAvdName">
                <span class="site-editor-field__label">Emulator AVD name</span>
                <input
                  id="site-editor-appClaimAvdName"
                  name="appClaimAvdName"
                  type="text"
                  value={draft.appClaimAvdName}
                  maxLength={160}
                  placeholder="Pixel_8_API_35"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.appClaimAvdName)}
                  aria-describedby={describedBy('appClaimAvdName', errors.appClaimAvdName)}
                  onInput={(event) => onChange('appClaimAvdName', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('appClaimAvdName')}
                />
                <span id={fieldDescriptionId('appClaimAvdName')} class="site-editor-field-help">
                  Used to auto-start Android when no emulator is connected.
                </span>
                <FieldError field="appClaimAvdName" message={errors.appClaimAvdName} />
              </label>

              <label class="site-editor-field" for="site-editor-appClaimPackageName">
                <span class="site-editor-field__label">Android package name</span>
                <input
                  id="site-editor-appClaimPackageName"
                  name="appClaimPackageName"
                  type="text"
                  value={draft.appClaimPackageName}
                  maxLength={255}
                  placeholder="com.example.app"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.appClaimPackageName)}
                  aria-describedby={describedBy('appClaimPackageName', errors.appClaimPackageName)}
                  onInput={(event) => onChange('appClaimPackageName', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('appClaimPackageName')}
                />
                <span id={fieldDescriptionId('appClaimPackageName')} class="site-editor-field-help">
                  Used to launch the installed app in the emulator.
                </span>
                <FieldError field="appClaimPackageName" message={errors.appClaimPackageName} />
              </label>

              <label class="site-editor-field" for="site-editor-appClaimDeepLinkUrl">
                <span class="site-editor-field__label">App or claim link</span>
                <input
                  id="site-editor-appClaimDeepLinkUrl"
                  name="appClaimDeepLinkUrl"
                  type="text"
                  value={draft.appClaimDeepLinkUrl}
                  maxLength={2048}
                  placeholder="https://example.com/claim"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.appClaimDeepLinkUrl)}
                  aria-describedby={describedBy('appClaimDeepLinkUrl', errors.appClaimDeepLinkUrl)}
                  onInput={(event) => onChange('appClaimDeepLinkUrl', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('appClaimDeepLinkUrl')}
                />
                <span id={fieldDescriptionId('appClaimDeepLinkUrl')} class="site-editor-field-help">
                  Sent to the connected emulator as an Android VIEW intent.
                </span>
                <FieldError field="appClaimDeepLinkUrl" message={errors.appClaimDeepLinkUrl} />
              </label>
            </div>

            <div class="site-editor-form__action-group">
              <Button
                variant="secondary"
                size="small"
                disabled={!canLaunchPackage || saving || appClaimPending !== null}
                pending={appClaimPending === 'launch-package'}
                onClick={onLaunchAndroidPackage}
              >
                Launch app
              </Button>
              <Button
                variant="secondary"
                size="small"
                disabled={!canOpenDeepLink || saving || appClaimPending !== null}
                pending={appClaimPending === 'open-deep-link'}
                onClick={() => onOpenAppClaimLink('deep-link')}
              >
                Open claim link
              </Button>
            </div>
          </fieldset>

          <fieldset class="site-editor-form-section">
            <legend>
              <span>Referral message</span>
              <small>Build the exact text copied from the Dashboard.</small>
            </legend>

            <div class="site-editor-field site-editor-field--full">
              <label class="site-editor-field__label" for="site-editor-url">
                Referral URL
              </label>
              <div class="site-editor-url-row">
                <input
                  id="site-editor-url"
                  name="url"
                  type="url"
                  inputMode="url"
                  value={draft.url}
                  maxLength={2048}
                  placeholder="https://example.com/REFCODE"
                  spellcheck={false}
                  aria-invalid={Boolean(errors.url)}
                  aria-describedby={describedBy('url', errors.url)}
                  onInput={(event) => onChange('url', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('url')}
                />
                <Button
                  variant="secondary"
                  size="small"
                  leadingIcon={<ExternalLinkIcon size={15} />}
                  disabled={!hasValidOpenableUrl || saving}
                  onClick={onOpenLink}
                >
                  Test link
                </Button>
              </div>
              <span id={fieldDescriptionId('url')} class="site-editor-field-help">
                Optional, but Copy Link remains unavailable until a credential-free HTTPS URL is
                set.
              </span>
              <FieldError field="url" message={errors.url} />
            </div>

            <div class="site-editor-form-grid">
              <label class="site-editor-field" for="site-editor-prefix">
                <span class="site-editor-field__label">Prefix</span>
                <input
                  id="site-editor-prefix"
                  name="prefix"
                  type="text"
                  value={draft.prefix}
                  maxLength={500}
                  placeholder="e.g. Join now"
                  aria-invalid={Boolean(errors.prefix)}
                  aria-describedby={describedBy('prefix', errors.prefix)}
                  onInput={(event) => onChange('prefix', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('prefix')}
                />
                <span id={fieldDescriptionId('prefix')} class="site-editor-field-help">
                  Added before the URL.
                </span>
                <FieldError field="prefix" message={errors.prefix} />
              </label>

              <label class="site-editor-field" for="site-editor-suffix">
                <span class="site-editor-field__label">Suffix</span>
                <input
                  id="site-editor-suffix"
                  name="suffix"
                  type="text"
                  value={draft.suffix}
                  maxLength={500}
                  placeholder="e.g. Limited offer"
                  aria-invalid={Boolean(errors.suffix)}
                  aria-describedby={describedBy('suffix', errors.suffix)}
                  onInput={(event) => onChange('suffix', event.currentTarget.value)}
                  onBlur={() => onFieldBlur('suffix')}
                />
                <span id={fieldDescriptionId('suffix')} class="site-editor-field-help">
                  Added after the date and time.
                </span>
                <FieldError field="suffix" message={errors.suffix} />
              </label>
            </div>

            <label class="site-editor-field" for="site-editor-dateFormat">
              <span class="site-editor-field__label">Date and time format</span>
              <select
                id="site-editor-dateFormat"
                name="dateFormat"
                value={draft.dateFormat}
                aria-invalid={Boolean(errors.dateFormat)}
                aria-describedby={describedBy('dateFormat', errors.dateFormat)}
                onChange={(event) => onChange('dateFormat', event.currentTarget.value)}
                onBlur={() => onFieldBlur('dateFormat')}
              >
                {DATE_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span id={fieldDescriptionId('dateFormat')} class="site-editor-field-help">
                Generated at the moment Copy Link is pressed.
              </span>
              <FieldError field="dateFormat" message={errors.dateFormat} />
            </label>
          </fieldset>

          <fieldset class="site-editor-form-section">
            <legend>
              <span>Private notes</span>
              <small>Keep program terms, contacts, reminders, or other local context.</small>
            </legend>
            <label class="site-editor-field site-editor-field--full" for="site-editor-notes">
              <span class="site-editor-field__label">Notes</span>
              <textarea
                id="site-editor-notes"
                name="notes"
                rows={5}
                value={draft.notes}
                maxLength={4000}
                placeholder="Commission terms, payout threshold, contact details, renewal dates..."
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describedBy('notes', errors.notes)}
                onInput={(event) => onChange('notes', event.currentTarget.value)}
                onBlur={() => onFieldBlur('notes')}
              />
              <span id={fieldDescriptionId('notes')} class="site-editor-field-help">
                Stored locally with this site. {draft.notes.length.toLocaleString()} / 4,000
              </span>
              <FieldError field="notes" message={errors.notes} />
            </label>
          </fieldset>

          <section class="site-editor-preview" aria-labelledby="site-editor-preview-title">
            <div class="site-editor-preview__header">
              <div>
                <span class="site-editor-eyebrow">Clipboard output</span>
                <h3 id="site-editor-preview-title">Live link preview</h3>
              </div>
              <span>{preview.length} characters</span>
            </div>
            <output class="site-editor-preview__content" aria-live="polite">
              {preview || 'Complete the message fields to preview the copied text.'}
            </output>
          </section>
        </div>

        <footer class="site-editor-form__actions">
          <div>
            {!creating && selectedSite ? (
              <div class="site-editor-form__action-group">
                {(selectedSite.lifecycle ?? 'active') === 'active' ? (
                  <Button
                    variant="secondary"
                    disabled={saving || lifecyclePending || dirty}
                    onClick={onArchive}
                  >
                    Archive
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={saving || lifecyclePending || dirty}
                    onClick={onRestore}
                  >
                    Restore
                  </Button>
                )}
                {(selectedSite.lifecycle ?? 'active') !== 'trashed' ? (
                  <Button
                    variant="danger"
                    leadingIcon={<TrashIcon size={16} />}
                    disabled={saving || lifecyclePending || dirty}
                    onClick={onDelete}
                  >
                    Move to recycle bin
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    leadingIcon={<TrashIcon size={16} />}
                    disabled={saving || lifecyclePending || dirty}
                    onClick={onDelete}
                  >
                    Delete forever
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <div class="site-editor-form__action-group">
            <Button
              variant="secondary"
              disabled={saving || (!creating && !dirty)}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button variant="primary" pending={saving} disabled={!creating && !dirty} type="submit">
              {creating ? 'Add site' : 'Save changes'}
            </Button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export type { EditorFeedback };
