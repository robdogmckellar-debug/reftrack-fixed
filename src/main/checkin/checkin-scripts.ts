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

export interface CheckinPageState {
  day: number | null;
  tokens: number | null;
  tokenReward: number | null;
  tokenAmounts: number[];
  completed: boolean;
}

export interface CheckinVerificationResult {
  confirmed: boolean;
  reason: 'day-advanced' | 'tokens-increased' | null;
  dayBefore: number | null;
  dayAfter: number | null;
  tokenDelta: number | null;
  tokensToday: number | null;
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

const CHECKIN_STATE_HELPERS = `
  const toNumber = (value) => {
    const numeric = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  };
  const visibleText = () => (document.body && document.body.innerText ? document.body.innerText : '');
  const readDay = (text) => {
    const patterns = [
      /(?:check[-\\s]?in\\s*)?day(?:\\s*of\\s*check[-\\s]?in)?[^0-9]{0,24}(\\d{1,4})/i,
      /(?:continuous|consecutive|streak)[^0-9]{0,24}(\\d{1,4})\\s*(?:days?|check[-\\s]?ins?)/i,
      /(\\d{1,4})\\s*(?:st|nd|rd|th)?\\s*(?:day|check[-\\s]?in\\s*day)\\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match && match[1] ? toNumber(match[1]) : null;
      if (value !== null) return value;
    }
    return null;
  };
  const readTokenAmounts = (text) => {
    const amounts = [];
    const patterns = [
      /([+-]?\\d{1,9}(?:,\\d{3})*)\\s*(?:tokens?|coins?|credits?|points?)\\b/gi,
      /\\b(?:tokens?|coins?|credits?|points?)[^0-9+-]{0,16}([+-]?\\d{1,9}(?:,\\d{3})*)/gi,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const value = match[1] ? toNumber(match[1]) : null;
        if (value !== null) amounts.push(value);
      }
    }
    return [...new Set(amounts)];
  };
  const readTokenBalance = (text) => {
    const patterns = [
      /(?:token|coin|credit|point)s?\\s*(?:balance|wallet|total)?[^0-9+-]{0,20}([+-]?\\d{1,9}(?:,\\d{3})*)/i,
      /(?:balance|wallet|total)[^0-9+-]{0,20}([+-]?\\d{1,9}(?:,\\d{3})*)\\s*(?:tokens?|coins?|credits?|points?)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match && match[1] ? toNumber(match[1]) : null;
      if (value !== null) return value;
    }
    return null;
  };
  const readTokenReward = (text) => {
    const patterns = [
      /(?:received|reward|claim(?:ed)?|earned|bonus)[^0-9+-]{0,24}([+-]?\\d{1,9}(?:,\\d{3})*)\\s*(?:tokens?|coins?|credits?|points?)/i,
      /([+-]?\\d{1,9}(?:,\\d{3})*)\\s*(?:tokens?|coins?|credits?|points?).{0,24}(?:received|reward|claimed|earned|bonus)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match && match[1] ? toNumber(match[1]) : null;
      if (value !== null) return value;
    }
    return null;
  };
  const readCompleted = (text) =>
    /(?:check[-\\s]?in|daily|reward|token|coin|credit|point).{0,48}(?:success|successful|complete|completed|received|claimed)/i.test(text) ||
    /(?:success|successful|complete|completed|received|claimed).{0,48}(?:check[-\\s]?in|daily|reward|token|coin|credit|point)/i.test(text);
  const readState = () => {
    const text = visibleText();
    return {
      day: readDay(text),
      tokens: readTokenBalance(text),
      tokenReward: readTokenReward(text),
      tokenAmounts: readTokenAmounts(text),
      completed: readCompleted(text),
    };
  };
`;

export function buildReadCheckinStateScript(): string {
  return `(() => {
    ${CHECKIN_STATE_HELPERS}
    return readState();
  })()`;
}

export function buildVerifyCheckinStateScript(before: CheckinPageState | null): string {
  return `(() => {
    ${CHECKIN_STATE_HELPERS}
    const before = ${json(
      before ?? { day: null, tokens: null, tokenReward: null, tokenAmounts: [], completed: false },
    )};
    const after = readState();
    const tokenDelta =
      typeof before.tokens === 'number' && typeof after.tokens === 'number'
        ? after.tokens - before.tokens
        : null;
    const tokensToday =
      tokenDelta !== null && tokenDelta > 0
        ? tokenDelta
        : typeof after.tokenReward === 'number'
          ? after.tokenReward
          : null;
    const tokenRewardAppeared =
      typeof after.tokenReward === 'number' &&
      after.tokenReward > 0 &&
      after.tokenReward !== before.tokenReward;
    if (typeof before.day === 'number' && typeof after.day === 'number' && after.day > before.day) {
      return {
        confirmed: true,
        reason: 'day-advanced',
        dayBefore: before.day,
        dayAfter: after.day,
        tokenDelta: tokenDelta !== null && tokenDelta > 0 ? tokenDelta : null,
        tokensToday,
      };
    }
    if ((tokenDelta !== null && tokenDelta > 0) || tokenRewardAppeared) {
      return {
        confirmed: true,
        reason: 'tokens-increased',
        dayBefore: before.day,
        dayAfter: after.day,
        tokenDelta: tokenDelta !== null && tokenDelta > 0 ? tokenDelta : null,
        tokensToday,
      };
    }
    return {
      confirmed: false,
      reason: null,
      dayBefore: before.day,
      dayAfter: after.day,
      tokenDelta: tokenDelta !== null && tokenDelta > 0 ? tokenDelta : null,
      tokensToday: tokenRewardAppeared ? tokensToday : null,
    };
  })()`;
}
