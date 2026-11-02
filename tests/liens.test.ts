import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { canoniser, decoderLien, identifierLien, texteHtml } from '../src/core/liens.ts';
import { dateFr, lireRemuneration, sansMarkdown, trouverRemuneration } from '../src/core/texte.ts';

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('canoniser', () => {
  it('LinkedIn (lien /comm/ et paramètres de suivi)', () => {
    expect(canoniser('https://www.linkedin.com/comm/jobs/view/4100000001/?trackingId=abc')).toEqual({
      source: 'linkedin',
      idSite: '4100000001',
      url: 'https://www.linkedin.com/jobs/view/4100000001/',
    });
  });
  it('Indeed : jk en minuscules, URL viewjob', () => {
    expect(canoniser('https://fr.indeed.com/rc/clk?jk=0A1B2C3D4E5F6789&from=ja')).toEqual({
      source: 'indeed',
      idSite: '0a1b2c3d4e5f6789',
      url: 'https://fr.indeed.com/viewjob?jk=0a1b2c3d4e5f6789',
    });
  });
  it('Glassdoor : jobListingId ou jl', () => {
    expect(canoniser('https://www.glassdoor.fr/partner/jobListing.htm?pos=1&jobListingId=1009&ao=1')?.idSite).toBe('1009');
    expect(canoniser('https://www.glassdoor.fr/job-listing/?jl=1010273297796')?.url).toBe(
      'https://www.glassdoor.fr/job-listing/?jl=1010273297796',
    );
  });
  it('Hellowork et Free-Work', () => {
    expect(canoniser('https://www.hellowork.com/fr-fr/emplois/84908442.html?utm=x')?.url).toBe(
      'https://www.hellowork.com/fr-fr/emplois/84908442.html',
    );
    const fw = canoniser('https://www.free-work.com/fr/tech-it/job-mission/developpeur-php/lead-dev-paris-3?utm=1');
    expect(fw).toEqual({
      source: 'free-work',
      idSite: 'lead-dev-paris-3',
      url: 'https://www.free-work.com/fr/tech-it/job-mission/developpeur-php/lead-dev-paris-3',
    });
  });
  it('liens qui ne sont pas des offres', () => {
    expect(canoniser('https://www.linkedin.com/comm/jobs/search/?keywords=php')).toBeNull();
    expect(canoniser('https://www.welcometothejungle.com/fr/jobs/x')).toBeNull();
  });
});

describe('decoderLien', () => {
  it('segment base64 url-safe (Mailjet / Hellowork)', () => {
    const seg = b64url('https://www.hellowork.com/fr-fr/emplois/70000001.html?utm_source=alerte');
    expect(decoderLien(`https://r.mailjet.test/lnk/AbCd/${seg}/1/xyz`)).toBe(
      'https://www.hellowork.com/fr-fr/emplois/70000001.html?utm_source=alerte',
    );
  });
  it('charge utile gzip (Indeed)', () => {
    const seg = b64url(gzipSync(JSON.stringify({ u: 'https://fr.indeed.com/rc/clk?jk=abcdef0123456789&from=ja' })));
    const href = `https://cts.indeed.com/v3/${seg}/suivi`;
    expect(identifierLien(href)?.url).toBe('https://fr.indeed.com/viewjob?jk=abcdef0123456789');
  });
  it('destination en paramètre encodé', () => {
    const href = `https://suivi.test/c?url=${encodeURIComponent('https://www.linkedin.com/jobs/view/4100000009/')}`;
    expect(identifierLien(href)?.idSite).toBe('4100000009');
  });
  it('lien direct laissé tel quel', () => {
    expect(decoderLien('https://exemple.test/a/b')).toBe('https://exemple.test/a/b');
  });
});

describe('texte', () => {
  it('texteHtml décode les entités et retire les balises', () => {
    expect(texteHtml('<b>D&eacute;veloppeur</b>&nbsp;PHP &amp; API')).toBe('Développeur PHP & API');
  });
  it('lireRemuneration', () => {
    expect(lireRemuneration('40-48 K€')).toEqual({ min: 40000, max: 48000, unite: 'an' });
    expect(lireRemuneration('400 €/j')).toEqual({ min: 400, max: 400, unite: 'jour' });
    expect(lireRemuneration('45000-55000 YEAR')).toEqual({ min: 45000, max: 55000, unite: 'an' });
    expect(lireRemuneration('3 000 € brut / mois')).toEqual({ min: 3000, max: 3000, unite: 'mois' });
    expect(lireRemuneration('26,6-54,6 K€')).toEqual({ min: 26600, max: 54600, unite: 'an' });
    expect(lireRemuneration('NC')).toEqual({ min: null, max: null, unite: null });
  });
  it('trouverRemuneration ignore les pourcentages et les arrondissements', () => {
    expect(trouverRemuneration('100 % télétravail, Paris 5e, 50-60 K€')).toBe('50-60 K€');
    expect(trouverRemuneration('Freelance full télétravail, 200-300 €/j')).toBe('200-300 €/j');
    expect(trouverRemuneration('CDI Paris')).toBeNull();
  });
  it('dateFr et sansMarkdown', () => {
    expect(dateFr('Envoyée le 2/11/2026')).toBe('2026-11-02');
    expect(dateFr('07/2026')).toBe('2026-07');
    expect(dateFr('—')).toBeNull();
    expect(sansMarkdown('**ACME** ([dossier](x.md)) *ok*')).toBe('ACME (dossier) ok');
  });
});
