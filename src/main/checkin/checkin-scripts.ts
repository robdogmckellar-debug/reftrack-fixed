import type { CredentialSecrets } from './credential-store';

const json = (value: unknown): string => JSON.stringify(value);

// Returns the first element matching any selector, tried in priority order, so a
// user-configured selector wins over the built-in fallbacks.
const PICK_FIRST = `((selectors) => {
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) return element;
    } catch (error) {
      /* ignore invalid selectors */
    }
  }
  return null;
})`;

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

export interface LoginSelectorGroups {
  usernameSelectors: string[];
  passwordSelectors: string[];
  submitSelectors: string[];
}

/**
 * Builds an in-page script that fills the username/password inputs, fires the
 * `input`/`change` events that reactive login forms rely on, and clicks the
 * submit control (an anchor on the targeted sites, not a form-submit button).
 */
export function buildFillLoginScript(
  selectors: LoginSelectorGroups,
  credentials: CredentialSecrets,
): string {
  return `(() => {
    const pick = ${PICK_FIRST};
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
    const username = pick(${json(selectors.usernameSelectors)});
    const password = pick(${json(selectors.passwordSelectors)});
    const filledUsername = setValue(username, ${json(credentials.username)});
    const filledPassword = setValue(password, ${json(credentials.password)});
    const submit = pick(${json(selectors.submitSelectors)});
    let clickedSubmit = false;
    if (submit && typeof submit.click === 'function') {
      submit.click();
      clickedSubmit = true;
    }
    return { filledUsername, filledPassword, clickedSubmit };
  })()`;
}

/** Builds an in-page script that clicks the first matching element. */
export function buildClickScript(selectors: string[]): string {
  return `(() => {
    const pick = ${PICK_FIRST};
    const element = pick(${json(selectors)});
    if (!element || typeof element.click !== 'function') return { found: false, clicked: false };
    element.click();
    return { found: true, clicked: true };
  })()`;
}

/** Builds an in-page script reporting whether any selector matches an element. */
export function buildExistsScript(selectors: string[]): string {
  return `(() => {
    const pick = ${PICK_FIRST};
    return { found: !!pick(${json(selectors)}) };
  })()`;
}
