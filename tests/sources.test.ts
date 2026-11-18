import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { offersToRead } from '../src/core/actions.ts';
import { saveOffer } from '../src/core/offers.ts';
import { onsiteDaysFromText } from '../src/core/rubric.ts';
import { openDatabase } from '../src/db/database.ts';
import { defineLanguage } from '../src/i18n/index.ts';
import { readEmail } from '../src/ingest/eml.ts';
import { collective } from '../src/sources/collective.ts';
import { freeWork } from '../src/sources/free-work.ts';
import { glassdoor } from '../src/sources/glassdoor.ts';
import { hellowork } from '../src/sources/hellowork.ts';
import { ADAPTERS, adapterOf, identifyOffer } from '../src/sources/index.ts';
import { indeed } from '../src/sources/indeed.ts';
import { readJobPosting } from '../src/sources/job-posting.ts';
import { linkedin } from '../src/sources/linkedin.ts';

const jsonLd = (d: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(d)}</script></head><body></body></html>`;

afterEach(() => defineLanguage('fr'));

describe('registry of the job sites', () => {
  it('each site has one adapter, found by its identifier', () => {
    const ids = ADAPTERS.map((a) => a.id);
    expect(ids).toEqual(['linkedin', 'indeed', 'glassdoor', 'hellowork', 'free-work', 'collective']);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ADAPTERS) expect(adapterOf(a.id)).toBe(a);
    expect(adapterOf('manual')).toBeUndefined();
  });
  it('a link is tried against each adapter; the source is the identifier of the one that knows it', () => {
    expect(identifyOffer('https://www.hellowork.com/fr-fr/emplois/1234.html')).toEqual({
      source: 'hellowork',
      siteId: '1234',
      url: 'https://www.hellowork.com/fr-fr/emplois/1234.html',
    });
    expect(identifyOffer('https://www.example.test/jobs/1234')).toBeNull();
  });
  it('the application downloads the pages of Hellowork, Free-Work and Collective only', () => {
    expect(ADAPTERS.filter((a) => a.extract).map((a) => a.id)).toEqual(['hellowork', 'free-work', 'collective']);
  });
});

describe('LinkedIn', () => {
  it('job ad links, with or without the title before the number', () => {
    expect(linkedin.identify('https://www.linkedin.com/jobs/view/4100000001')).toEqual({
      siteId: '4100000001',
      url: 'https://www.linkedin.com/jobs/view/4100000001/',
    });
    expect(linkedin.identify('https://fr.linkedin.com/comm/jobs/view/developpeur-php-at-acme-4100000002?refId=x')?.siteId).toBe('4100000002');
  });
  it('other links are not job ads', () => {
    expect(linkedin.identify('https://www.linkedin.com/company/acme/jobs/')).toBeNull();
    expect(linkedin.identify('https://www.linkedin.com/in/someone-4100000001/')).toBeNull();
  });
  it('read by the AI in the browser, never downloaded', () => {
    expect(linkedin.browserReading).toBe('agent');
    expect(linkedin.extract).toBeUndefined();
  });
});

describe('Indeed', () => {
  it('keeps the country site of the link', () => {
    expect(indeed.identify('https://uk.indeed.com/rc/clk?jk=0A1B2C3D4E5F6789&from=ja')).toEqual({
      siteId: '0a1b2c3d4e5f6789',
      url: 'https://uk.indeed.com/viewjob?jk=0a1b2c3d4e5f6789',
    });
    expect(indeed.identify('https://www.indeed.com/viewjob?jk=abcdef0123456789')?.url).toBe('https://www.indeed.com/viewjob?jk=abcdef0123456789');
    expect(indeed.identify('https://emplois.ca.indeed.com/viewjob?from=x&jk=abcdef0123456789')?.url).toBe(
      'https://emplois.ca.indeed.com/viewjob?jk=abcdef0123456789',
    );
  });
  it('a link that names no country site gets the French one', () => {
    expect(indeed.identify('https://cts.indeed.com/v3/abc?jk=abcdef0123456789')?.url).toBe('https://fr.indeed.com/viewjob?jk=abcdef0123456789');
    expect(indeed.identify('https://indeed.example.test/viewjob?jk=abcdef0123456789')?.url).toBe('https://fr.indeed.com/viewjob?jk=abcdef0123456789');
  });
  it('the same job ad seen on two country sites has the same identifier', () => {
    const a = indeed.identify('https://fr.indeed.com/viewjob?jk=abcdef0123456789');
    const b = indeed.identify('https://be.indeed.com/viewjob?jk=ABCDEF0123456789');
    expect(a?.siteId).toBe(b?.siteId);
  });
  it('a link without a job ad, or of another site, is not one', () => {
    expect(indeed.identify('https://fr.indeed.com/jobs?q=php')).toBeNull();
    expect(indeed.identify('https://www.example.test/viewjob?jk=abcdef0123456789')).toBeNull();
  });
});

describe('Glassdoor', () => {
  it('keeps the country site of the link', () => {
    expect(glassdoor.identify('https://www.glassdoor.co.uk/partner/jobListing.htm?pos=1&jobListingId=1009&ao=1')).toEqual({
      siteId: '1009',
      url: 'https://www.glassdoor.co.uk/job-listing/?jl=1009',
    });
    expect(glassdoor.identify('https://www.glassdoor.com/job-listing/x?jl=1010')?.url).toBe('https://www.glassdoor.com/job-listing/?jl=1010');
    expect(glassdoor.identify('https://fr.glassdoor.be/job-listing/x?jl=1011')?.url).toBe('https://fr.glassdoor.be/job-listing/?jl=1011');
    expect(glassdoor.identify('https://www.glassdoor.com.au/job-listing/x?jl=1012')?.url).toBe('https://www.glassdoor.com.au/job-listing/?jl=1012');
  });
  it('a link that names no country site gets the French one', () => {
    expect(glassdoor.identify('https://click.glassdoor.com/track?jobListingId=1013')?.url).toBe('https://www.glassdoor.fr/job-listing/?jl=1013');
    expect(glassdoor.identify('https://www.glassdoor.example.test/job-listing/?jl=1014')?.url).toBe('https://www.glassdoor.fr/job-listing/?jl=1014');
  });
  it('read by the user: the site blocks a browser driven by a program', () => {
    expect(glassdoor.browserReading).toBe('human');
    expect(glassdoor.extract).toBeUndefined();
    const db = openDatabase(':memory:');
    saveOffer(db, 'glassdoor', '1', { canonical_url: 'https://www.glassdoor.fr/job-listing/?jl=1', title: 'A' }, 'email');
    saveOffer(db, 'indeed', '2', { canonical_url: 'https://fr.indeed.com/viewjob?jk=2', title: 'B' }, 'email');
    saveOffer(db, 'manual', '3', { title: 'C' }, 'email');
    saveOffer(db, 'hellowork', '4', { title: 'D', description: 'Texte' }, 'email');
    expect(offersToRead(db).offers.map((o) => [o.source, o.reading])).toEqual([
      ['glassdoor', 'human'],
      ['indeed', 'browser'],
      ['manual', 'browser'],
      ['hellowork', 'description'],
    ]);
    db.close();
  });
  it('splits the text of an e-mail link into company, job title, location and pay', async () => {
    const email = [
      'From: Glassdoor <alertes@exemple.test>',
      'Subject: Offres',
      'Date: Mon, 3 Nov 2026 09:30:00 +0100',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<a href="https://www.glassdoor.fr/partner/jobListing.htm?jobListingId=1015">CGI 3.7 ★ Expert(e) Kubernetes F/H Paris Candidature facile</a>',
    ].join('\r\n');
    expect((await readEmail(email)).offers[0]).toMatchObject({
      source: 'glassdoor',
      siteId: '1015',
      company: 'CGI',
      title: 'Expert(e) Kubernetes F/H',
      location: 'Paris',
    });
  });
});

describe('Hellowork', () => {
  it('job ad links only', () => {
    expect(hellowork.identify('https://www.hellowork.com/fr-fr/emplois/84908442.html?utm=x')).toEqual({
      siteId: '84908442',
      url: 'https://www.hellowork.com/fr-fr/emplois/84908442.html',
    });
    expect(hellowork.identify('https://www.hellowork.com/fr-fr/entreprises/acme-1.html')).toBeNull();
  });
  it('reads its page and cuts the presentation of the company at the end of the description', () => {
    const d = hellowork.extract?.(readFileSync(join(import.meta.dirname, 'fixtures', 'pages', 'hellowork-70000001.html'), 'utf8'));
    expect(d?.title).toBe('Développeur WordPress H/F');
    expect(d?.description).not.toContain('Bienvenue chez');
  });
});

describe('Free-Work', () => {
  it('both forms of a job ad link, without the tracking parameters', () => {
    expect(freeWork.identify('https://www.free-work.com/fr/tech-it/developpeur-php/job-mission/lead-dev-paris-3/?utm=1')).toEqual({
      siteId: 'lead-dev-paris-3',
      url: 'https://www.free-work.com/fr/tech-it/developpeur-php/job-mission/lead-dev-paris-3',
    });
    expect(freeWork.identify('https://www.free-work.com/fr/tech-it/job-mission/developpeur-php/lead-dev-paris-3')?.siteId).toBe('lead-dev-paris-3');
    expect(freeWork.identify('https://www.free-work.com/fr/tech-it/blog/actualites/x')).toBeNull();
  });
  it('reads its page, and keeps a description that greets the reader', () => {
    const d = freeWork.extract?.(jsonLd({ '@type': 'JobPosting', title: 'Lead dev', description: '<p>Mission.</p><p>Bienvenue chez nous.</p>' }));
    expect(d).toMatchObject({ title: 'Lead dev', description: 'Mission.\nBienvenue chez nous.' });
  });
});

describe('Collective', () => {
  it('job ad links, in any language of the site', () => {
    expect(collective.identify('https://www.collective.work/jobs/en/Developpeur-PHP-x1y2?utm=1')).toEqual({
      siteId: 'developpeur-php-x1y2',
      url: 'https://www.collective.work/jobs/fr/developpeur-php-x1y2',
    });
    expect(collective.identify('https://app.collective.work/talent/projects-activity/opportunities/abc')).toBeNull();
  });
  it('finds the job title in the text of the e-mail', () => {
    expect(collective.titleInEmail?.('Une nouvelle offre est disponible Offre : Développeur PHP (H/F) Postuler Voir')).toBe('Développeur PHP (H/F)');
    expect(collective.titleInEmail?.('Rien ici')).toBeNull();
  });
  it('names the contract and the work pattern in the language of the workspace', () => {
    const data = { props: { pageProps: { project: { name: 'Dev', contractTypes: ['FIXED_TERM', 'PERMANENT'], workPreferences: ['ON_SITE'] } } } };
    const page = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
    expect(collective.extract?.(page)).toMatchObject({ contract: 'CDD, CDI', remote: 'sur site' });
    defineLanguage('en');
    expect(collective.extract?.(page)).toMatchObject({ contract: 'Fixed term, Permanent', remote: 'on site' });
    expect(onsiteDaysFromText('on site')).toBe(5);
  });
});

describe('JobPosting (JSON-LD) shared by the adapters', () => {
  it('reads a job ad inside @graph, the first location, the salary range', () => {
    const d = readJobPosting(
      jsonLd({
        '@graph': [
          { '@type': 'Organization', name: 'Site' },
          {
            '@type': ['JobPosting'],
            title: 'Backend engineer',
            hiringOrganization: { name: 'Acme' },
            jobLocation: [{ address: { addressLocality: 'Lyon' } }, { address: { addressLocality: 'Paris' } }],
            baseSalary: { value: { minValue: 50000, maxValue: 60000, unitText: 'YEAR' } },
            employmentType: ['FULL_TIME', 'OTHER'],
            jobLocationType: 'TELECOMMUTE',
            datePosted: '2026-11-02T10:00:00Z',
          },
        ],
      }),
    );
    expect(d).toEqual({
      title: 'Backend engineer',
      company: 'Acme',
      location: 'Lyon',
      contract: 'Temps plein, OTHER',
      compensation: '50000-60000 YEAR',
      remote: 'oui',
      published_at: '2026-11-02',
      description: null,
    });
  });
  it('remote work in the language of the workspace', () => {
    defineLanguage('en');
    expect(readJobPosting(jsonLd({ '@type': 'JobPosting', title: 'X', jobLocationType: 'TELECOMMUTE' }))?.remote).toBe('yes');
  });
  it('a page without a job ad, or with unreadable JSON, gives nothing', () => {
    expect(readJobPosting('<html><script type="application/ld+json">{oops</script></html>')).toBeNull();
    expect(readJobPosting(jsonLd({ '@type': 'WebSite' }))).toBeNull();
  });
});

describe('work pattern written in English', () => {
  it('days on site and days from home', () => {
    expect(onsiteDaysFromText('3 days on site')).toBe(3);
    expect(onsiteDaysFromText('2 days per week in the office')).toBe(2);
    expect(onsiteDaysFromText('hybrid, 2 days from home')).toBe(3);
    expect(onsiteDaysFromText('1 day of remote per week')).toBe(4);
    expect(onsiteDaysFromText('fully remote')).toBe(0);
    expect(onsiteDaysFromText('hybrid')).toBeNull();
  });
});
