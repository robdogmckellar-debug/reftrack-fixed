import { describe, expect, it } from 'vitest';

import { parsePartnerText } from '../../src/renderer/screens/site-editor/text-file-import';

describe('partner text-file import', () => {
  it('extracts named HTTPS links from common text formats', () => {
    const result = parsePartnerText(
      'gold-group.txt',
      [
        'ButtonBg, https://rr4winau.org/RFGOLD3GROUP',
        'Lucky Nine | https://pg9aus.org/RFGOLD1GROUP',
        'https://h4winaus.org/RFGOLD2GROUP',
      ].join('\n'),
    );

    expect(result.brandName).toBe('gold group');
    expect(result.sites).toEqual(
      expect.arrayContaining([
        { name: 'ButtonBg', url: 'https://rr4winau.org/RFGOLD3GROUP' },
        { name: 'Lucky Nine', url: 'https://pg9aus.org/RFGOLD1GROUP' },
        { name: 'H4winaus', url: 'https://h4winaus.org/RFGOLD2GROUP' },
      ]),
    );
  });

  it('deduplicates partner hosts and rejects unsafe or irrelevant links', () => {
    const result = parsePartnerText(
      'partners.txt',
      [
        'Alpha https://alpha.example/RF1',
        'Alpha duplicate https://www.alpha.example/RF2',
        'Insecure http://beta.example/RF3',
        'Support https://support.example/help',
      ].join('\n'),
    );

    expect(result.sites).toEqual([{ name: 'Alpha', url: 'https://alpha.example/RF1' }]);
  });

  it('fails clearly when the file contains no usable partner links', () => {
    expect(() => parsePartnerText('empty.txt', 'No links in this document.')).toThrow(
      /No credential-free HTTPS partner links/i,
    );
  });
});
