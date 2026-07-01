import { describe, expect, it } from 'vitest';

import { extractPartnerData } from '../../src/main/importer/static-extractor';

describe('static partner-page extraction', () => {
  it('extracts, normalises, filters, and deduplicates partner links structurally', () => {
    const html = `<!doctype html>
      <html>
        <head>
          <title>Example Network | Partner Brands</title>
          <script type="application/ld+json">
            {"itemListElement":[{"name":"Third Brand","url":"https://third.example.net/RF333"}]}
          </script>
        </head>
        <body>
          <h1>Example Network — Our Sites</h1>
          <nav>
            <a href="/privacy">Privacy</a>
            <a href="https://facebook.com/example">Facebook</a>
          </nav>
          <section class="partner-grid">
            <a class="partner-card" href="https://alpha.example.org/"><img alt="Alpha" /></a>
            <a class="partner-card" href="https://alpha.example.org/RFAA123">Alpha Casino</a>
            <a class="casino-tile" href="https://beta.example.com/RF222">Beta Casino</a>
            <a href="http://insecure.example.com/RF999">Insecure</a>
            <a href="https://partners.example.com/other">Same host</a>
          </section>
        </body>
      </html>`;

    const result = extractPartnerData(html, 'https://partners.example.com/brands');

    expect(result.brandName).toBe('Example Network');
    expect(result.sites).toEqual(
      expect.arrayContaining([
        { name: 'Alpha Casino', url: 'https://alpha.example.org/RFAA123' },
        { name: 'Beta Casino', url: 'https://beta.example.com/RF222' },
        { name: 'Third Brand', url: 'https://third.example.net/RF333' },
      ]),
    );
    expect(result.sites.filter((site) => site.url.includes('alpha.example.org'))).toHaveLength(1);
    expect(result.sites.some((site) => site.url.startsWith('http:'))).toBe(false);
    expect(result.sites.some((site) => site.url.includes('facebook.com'))).toBe(false);
    expect(result.sites.some((site) => site.url.includes('partners.example.com'))).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it('reports low confidence for a script-heavy page without usable links', () => {
    const result = extractPartnerData(
      '<html><head><title>Dynamic Partners</title></head><body><script></script><script></script><script></script><script></script></body></html>',
      'https://partners.example.com/',
    );

    expect(result.sites).toEqual([]);
    expect(result.confidence).toBeLessThan(0.55);
    expect(result.warnings.join(' ')).toMatch(/scripts but no usable partner links/i);
  });
});
