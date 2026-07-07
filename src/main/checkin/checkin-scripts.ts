import type { CredentialSecrets } from './credential-store';
import type { CheckinSelectors } from './types';

const json = (value: string): string => JSON.stringify(value);

export interface FillLoginResult {
  filledUsername: boolean;
  filledPassword: boolean;
  clickedSubmit: boolean;
}

export interface ClickResult {
  found: boolean;
  clicked: boolean;
}

export interface ExistsResult {
  found: boolean;
}

/**
 * Builds an in-page script that fills the username/password inputs, fires the
 * `input`/`change` events that reactive login forms rely on, and clicks the
 * submit control (an anchor on the targeted sites, not a form-submit button).
 */
export function buildFillLoginScript(
  selectors: Pick<CheckinSelectors, 'usernameSelector' | 'passwordSelector' | 'submitSelector'>,
  credentials: CredentialSecrets,
): string {
  return `(() => {
    const setValue = (element, value) => {
      if (!element) return false;
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) descriptor.set.call(element, value);
      else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const username = document.querySelector(${json(selectors.usernameSelector)});
    const password = document.querySelector(${json(selectors.passwordSelector)});
    const filledUsername = setValue(username, ${json(credentials.username)});
    const filledPassword = setValue(password, ${json(credentials.password)});
    const submit = document.querySelector(${json(selectors.submitSelector)});
    let clickedSubmit = false;
    if (submit && typeof submit.click === 'function') {
      submit.click();
      clickedSubmit = true;
    }
    return { filledUsername, filledPassword, clickedSubmit };
  })()`;
}

/** Builds an in-page script that clicks the first element matching `selector`. */
export function buildClickScript(selector: string): string {
  return `(() => {
    const element = document.querySelector(${json(selector)});
    if (!element || typeof element.click !== 'function') return { found: false, clicked: false };
    element.click();
    return { found: true, clicked: true };
  })()`;
}

/** Builds an in-page script reporting whether `selector` matches any element. */
export function buildExistsScript(selector: string): string {
  return `(() => ({ found: !!document.querySelector(${json(selector)}) }))()`;
}
