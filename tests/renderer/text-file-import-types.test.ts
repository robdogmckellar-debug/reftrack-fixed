import { describe, expect, it } from 'vitest';

import { parsePartnerText } from '../../src/renderer/screens/daily-tasks/text-file-import';

describe('Daily Tasks HTML text import', () => {
  it('accepts saved HTML without a base element', () => {
    const result = parsePartnerText(
      'partners.txt',
      '<html><body><a href="https://example.com/REFCODE">Example</a></body></html>',
    );

    expect(result.sites).toEqual([{ name: 'Example', url: 'https://example.com/REFCODE' }]);
  });
});
