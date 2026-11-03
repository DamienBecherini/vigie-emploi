import { describe, expect, it } from 'vitest';
import { lireEmail } from '../src/ingest/eml.ts';
import { extraireJsonLd } from '../src/ingest/jsonld.ts';
import { canoniser } from '../src/core/liens.ts';

// Données fictives au format des e-mails et des pages Collective (collective.work).
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

const donnees = {
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
const PAGE = `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(donnees)}</script></body></html>`;

describe('Collective', () => {
  it('canonise les liens d’offres, pas ceux de l’application', () => {
    expect(canoniser('https://www.collective.work/jobs/fr/developpeur-php-and-api-hf-x1y2')).toEqual({
      source: 'collective',
      idSite: 'developpeur-php-and-api-hf-x1y2',
      url: 'https://www.collective.work/jobs/fr/developpeur-php-and-api-hf-x1y2',
    });
    expect(canoniser('https://www.collective.work/company/collective/jobs')).toBeNull();
  });

  it('lit l’offre et son intitulé dans l’e-mail', async () => {
    const e = await lireEmail(EMAIL);
    expect(e.offres).toHaveLength(1);
    expect(e.offres[0]).toMatchObject({
      source: 'collective',
      idSite: 'developpeur-php-and-api-hf-x1y2',
      titre: 'Développeur PHP & API (H/F)',
      recueLe: '2026-11-03',
    });
  });

  it('extrait l’offre des données de page', () => {
    expect(extraireJsonLd(PAGE)).toEqual({
      titre: 'Développeur PHP & API (H/F)',
      entreprise: 'Anonyme',
      lieu: 'Paris, France',
      contrat: 'Freelance',
      remuneration: '450 - 500€/j',
      teletravail: 'hybride',
      publiee_le: '2026-11-03',
      description: 'TJM maximum : 500 € HT/jour.\nDévelopper des API REST.\n\nProfil recherché\n5 ans de PHP.',
    });
  });
});
