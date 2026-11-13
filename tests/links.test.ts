import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canonicalize, decodeLink, identifierLink, textHtml } from '../src/core/links.ts';
import { dateFr, readCompensation, withoutMarkdown, findCompensation } from '../src/core/text.ts';

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('canonicalize', () => {
  it('LinkedIn (/comm/ link and tracking parameters)', () => {
    expect(canonicalize('https://www.linkedin.com/comm/jobs/view/4100000001/?trackingId=abc')).toEqual({
      source: 'linkedin',
      siteId: '4100000001',
      url: 'https://www.linkedin.com/jobs/view/4100000001/',
    });
  });
  it('Indeed : jk en minuscules, URL viewjob', () => {
    expect(canonicalize('https://fr.indeed.com/rc/clk?jk=0A1B2C3D4E5F6789&from=ja')).toEqual({
      source: 'indeed',
      siteId: '0a1b2c3d4e5f6789',
      url: 'https://fr.indeed.com/viewjob?jk=0a1b2c3d4e5f6789',
    });
  });
  it('Glassdoor: jobListingId or jl', () => {
    expect(canonicalize('https://www.glassdoor.fr/partner/jobListing.htm?pos=1&jobListingId=1009&ao=1')?.siteId).toBe('1009');
    expect(canonicalize('https://www.glassdoor.fr/job-listing/?jl=1010273297796')?.url).toBe(
      'https://www.glassdoor.fr/job-listing/?jl=1010273297796',
    );
  });
  it('Hellowork and Free-Work', () => {
    expect(canonicalize('https://www.hellowork.com/fr-fr/emplois/84908442.html?utm=x')?.url).toBe(
      'https://www.hellowork.com/fr-fr/emplois/84908442.html',
    );
    const fw = canonicalize('https://www.free-work.com/fr/tech-it/job-mission/developpeur-php/lead-dev-paris-3?utm=1');
    expect(fw).toEqual({
      source: 'free-work',
      siteId: 'lead-dev-paris-3',
      url: 'https://www.free-work.com/fr/tech-it/job-mission/developpeur-php/lead-dev-paris-3',
    });
  });
  it('links that are not offers', () => {
    expect(canonicalize('https://www.linkedin.com/comm/jobs/search/?keywords=php')).toBeNull();
    expect(canonicalize('https://www.welcometothejungle.com/fr/jobs/x')).toBeNull();
  });
});

describe('decodeLink', () => {
  it('segment base64 url-safe (Mailjet / Hellowork)', () => {
    const seg = b64url('https://www.hellowork.com/fr-fr/emplois/70000001.html?utm_source=alerte');
    expect(decodeLink(`https://r.mailjet.test/lnk/AbCd/${seg}/1/xyz`)).toBe(
      'https://www.hellowork.com/fr-fr/emplois/70000001.html?utm_source=alerte',
    );
  });
  it('charge utile gzip (Indeed)', () => {
    const seg = b64url(gzipSync(JSON.stringify({ u: 'https://fr.indeed.com/rc/clk?jk=abcdef0123456789&from=ja' })));
    const href = `https://cts.indeed.com/v3/${seg}/tracker`;
    expect(identifierLink(href)?.url).toBe('https://fr.indeed.com/viewjob?jk=abcdef0123456789');
  });
  it('destination in an encoded parameter', () => {
    const href = `https://tracker.test/c?url=${encodeURIComponent('https://www.linkedin.com/jobs/view/4100000009/')}`;
    expect(identifierLink(href)?.siteId).toBe('4100000009');
  });
  it('direct link left as it is', () => {
    expect(decodeLink('https://example.test/a/b')).toBe('https://example.test/a/b');
  });
});

describe('text', () => {
  it('textHtml decodes the entities and removes the tags', () => {
    expect(textHtml('<b>D&eacute;veloppeur</b>&nbsp;PHP &amp; API')).toBe('Développeur PHP & API');
  });
  it('readCompensation', () => {
    expect(readCompensation('40-48 K€')).toEqual({ min: 40000, max: 48000, unit: 'year' });
    expect(readCompensation('400 €/j')).toEqual({ min: 400, max: 400, unit: 'day' });
    expect(readCompensation('45000-55000 YEAR')).toEqual({ min: 45000, max: 55000, unit: 'year' });
    expect(readCompensation('3 000 € brut / mois')).toEqual({ min: 3000, max: 3000, unit: 'month' });
    expect(readCompensation('26,6-54,6 K€')).toEqual({ min: 26600, max: 54600, unit: 'year' });
    expect(readCompensation('NC')).toEqual({ min: null, max: null, unit: null });
  });
  it('findCompensation ignores percentages and districts', () => {
    expect(findCompensation('100 % télétravail, Paris 5e, 50-60 K€')).toBe('50-60 K€');
    expect(findCompensation('Freelance full télétravail, 200-300 €/j')).toBe('200-300 €/j');
    expect(findCompensation('CDI Paris')).toBeNull();
  });
  it('dateFr and withoutMarkdown', () => {
    expect(dateFr('Envoyée le 2/11/2026')).toBe('2026-11-02');
    expect(dateFr('07/2026')).toBe('2026-07');
    expect(dateFr('—')).toBeNull();
    expect(withoutMarkdown('**ACME** ([dossier](x.md)) *ok*')).toBe('ACME (dossier) ok');
  });
});
