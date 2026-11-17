import { describe, expect, it } from 'vitest';
import { readEmail } from '../src/ingest/eml.ts';
import { extractJsonLd } from '../src/ingest/jsonld.ts';
import { canonicalize } from '../src/core/links.ts';

// Fictitious data in the format of the Collective e-mails and pages (collective.work).
const EMAIL = [
  'From: Collective <ops@exemple.test>',
  'To: moi@exemple.test',
  'Subject: [Moi x Cabinet] Nouvelle opportunite',
  'Date: Mon, 3 Nov 2026 09:30:00 +0100',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Une nouvelle offre est disponible</p><p>Offre : Développeur PHP &amp; API (H/F)</p>',
  '<a href="https://app.collective.work/talent/projects-activity/opportunities/abc">Postuler</a>',
  '<a href="https://www.collective.work/jobs/fr/developpeur-php-and-api-hf-x1y2">Voir l\'offre</a>',
  '<a href="https://www.collective.work/company/collective/jobs">On recrute</a></body></html>',
].join('\r\n');

const data = {
  props: {
    pageProps: {
      project: {
        name: 'Développeur PHP & API (H/F)',
        description: '<p><strong>TJM maximum :</strong> 500 € HT/jour.</p><p>Développer des API REST.</p>',
        profileWanted: '<p>5 ans de PHP.</p>',
        budgetBrief: '450 - 500€ ',
        workPreferences: ['HYBRID'],
        contractTypes: ['FREELANCE'],
        minSalary: null,
        maxSalary: null,
        location: { fullNameFrench: 'Paris, France' },
        publishedAt: '2026-11-03T08:13:13.531Z',
        company: { name: 'Anonyme' },
      },
    },
  },
};
const PAGE = `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;

describe('Collective', () => {
  it('canonicalizes offer links, not those of the application', () => {
    expect(canonicalize('https://www.collective.work/jobs/fr/developpeur-php-and-api-hf-x1y2')).toEqual({
      source: 'collective',
      siteId: 'developpeur-php-and-api-hf-x1y2',
      url: 'https://www.collective.work/jobs/fr/developpeur-php-and-api-hf-x1y2',
    });
    expect(canonicalize('https://www.collective.work/company/collective/jobs')).toBeNull();
  });

  it('reads the offer and its job title in the e-mail', async () => {
    const e = await readEmail(EMAIL);
    expect(e.offers).toHaveLength(1);
    expect(e.offers[0]).toMatchObject({
      source: 'collective',
      siteId: 'developpeur-php-and-api-hf-x1y2',
      title: 'Développeur PHP & API (H/F)',
      receivedAt: '2026-11-03',
    });
  });

  it('extracts the offer from the page data', () => {
    expect(extractJsonLd(PAGE)).toEqual({
      title: 'Développeur PHP & API (H/F)',
      company: 'Anonyme',
      location: 'Paris, France',
      contract: 'Freelance',
      compensation: '450 - 500€/j',
      remote: 'hybride',
      published_at: '2026-11-03',
      description: 'TJM maximum : 500 € HT/jour.\nDévelopper des API REST.\n\nProfil recherché\n5 ans de PHP.',
    });
  });
});
