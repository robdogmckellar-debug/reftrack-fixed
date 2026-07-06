import { describe, expect, it } from 'vitest';

import { parsePartnerText } from '../../src/renderer/screens/daily-tasks/text-file-import';

describe('Daily Tasks partner text-file import', () => {
  it('uses the text filename as the category name and accepts varied public TLDs', () => {
    const result = parsePartnerText(
      'Gold-Group-Partnership.txt',
      [
        'ButtonBg, https://rr4winau.icu/RFGOLD3GROUP',
        'Lucky Nine | https://pg9aus.vip/RFGOLD1GROUP',
        'https://h4winaus.bet/RFGOLD2GROUP',
      ].join('\n'),
    );

    expect(result.categoryName).toBe('Gold Group Partnership');
    expect(result.sites).toEqual(
      expect.arrayContaining([
        { name: 'ButtonBg', url: 'https://rr4winau.icu/RFGOLD3GROUP' },
        { name: 'Lucky Nine', url: 'https://pg9aus.vip/RFGOLD1GROUP' },
        { name: 'H4winaus', url: 'https://h4winaus.bet/RFGOLD2GROUP' },
      ]),
    );
  });

  it('keeps distinct referral codes on a shared host and deduplicates ordinary pages', () => {
    const result = parsePartnerText(
      'partners.txt',
      [
        'Alpha https://shared.win/RFALPHA123',
        'Bravo https://shared.win/RFBRAVO456',
        'Generic https://plain.online/lobby',
        'Generic duplicate https://www.plain.online/games',
        'Insecure http://beta.example/RF3',
        'Support https://support.example/help',
      ].join('\n'),
    );

    expect(result.sites).toEqual([
      { name: 'Alpha', url: 'https://shared.win/RFALPHA123' },
      { name: 'Bravo', url: 'https://shared.win/RFBRAVO456' },
      { name: 'Generic', url: 'https://plain.online/lobby' },
    ]);
  });

  it('fails clearly when the file contains no usable partner links', () => {
    expect(() => parsePartnerText('empty.txt', 'No links in this document.')).toThrow(
      /No credential-free HTTPS partner links/i,
    );
  });
});
