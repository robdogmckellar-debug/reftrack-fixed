import { describe, expect, it } from 'vitest';

import { parsePartnerText } from '../../src/renderer/screens/daily-tasks/text-file-import';

describe('Daily Tasks partner text-file import', () => {
  it('uses the text filename as the category name and extracts named HTTPS links', () => {
    const result = parsePartnerText(
      'Gold-Group-Partnership.txt',
      [
        'ButtonBg, https://rr4winau.org/RFGOLD3GROUP',
        'Lucky Nine | https://pg9aus.org/RFGOLD1GROUP',
        'https://h4winaus.org/RFGOLD2GROUP',
      ].join('\n'),
    );

    expect(result.categoryName).toBe('Gold Group Partnership');
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
