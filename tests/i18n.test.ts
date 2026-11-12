// Multilingue (phase A) : dictionnaires français / anglais, choix de la langue (config, init --langue),
// CLI, API, suivi généré et CV aux titres anglais.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DICTIONNAIRES } from '../src/i18n/index.ts';
import { traduire, type Texte } from '../src/i18n/outil.ts';
import { libelleStatut, messageDrapeau } from '../src/i18n/libelles.ts';
import { STATUTS } from '../src/core/statuts.ts';
import { DICTIONNAIRES_UI } from '../ui/src/i18n/index.ts';
import { chargerConfig } from '../src/core/config.ts';
import { initialiserEspace, MODELE, modeleDeLangue } from '../src/init/init.ts';
import { ouvrirBase } from '../src/db/base.ts';
import { importerHistorique } from '../src/import/historique.ts';
import { ajouterStatut } from '../src/core/offres.ts';
import { genererSuivi, MARQUE_SUIVI_GENERE } from '../src/export/suivi.ts';
import { cvEnHtml, langueDuCv } from '../src/cv/cv.ts';
import { creerApp } from '../src/api/serveur.ts';
import { main } from '../src/cli/main.ts';

const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-i18n-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));

/** Paramètres {nom} d'un texte (toutes formes du pluriel confondues). */
function parametres(x: Texte): string[] {
  const textes = typeof x === 'string' ? [x] : [x.one, x.other];
  return [...new Set(textes.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

function comparer(fr: Record<string, Texte>, en: Record<string, Texte>) {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const cle of Object.keys(fr)) expect(parametres(en[cle]), cle).toEqual(parametres(fr[cle]));
  for (const [cle, v] of Object.entries(en)) {
    const textes = typeof v === 'string' ? [v] : [v.one, v.other];
    for (const s of textes) expect(s.trim(), cle).not.toBe('');
  }
}

describe('dictionnaires', () => {
  it('CLI, API, suivi : mêmes clés et mêmes paramètres en français et en anglais', () => {
    comparer(DICTIONNAIRES.fr, DICTIONNAIRES.en);
  });

  it('interface : mêmes clés et mêmes paramètres en français et en anglais', () => {
    comparer(DICTIONNAIRES_UI.fr, DICTIONNAIRES_UI.en);
  });

  it('paramètres et pluriels selon la langue (0 et 1 au singulier en français)', () => {
    const offres = DICTIONNAIRES.fr['commun.offres'];
    expect(traduire(offres, 'fr', { n: 0 })).toBe('0 offre');
    expect(traduire(offres, 'fr', { n: 2 })).toBe('2 offres');
    expect(traduire(DICTIONNAIRES.en['commun.offres'], 'en', { n: 0 })).toBe('0 offers');
    expect(traduire(DICTIONNAIRES.en['commun.offres'], 'en', { n: 1 })).toBe('1 offer');
    expect(traduire('Bonjour {nom}', 'fr', {})).toBe('Bonjour {nom}');
  });

  it('libellés des statuts traduits, identifiants inchangés', () => {
    for (const s of STATUTS) expect(libelleStatut(s, 'en')).toMatch(/^[A-Z]/);
    expect(libelleStatut('ecartee', 'fr')).toBe('Écartée');
    expect(libelleStatut('ecartee', 'en')).toBe('Discarded');
    expect(messageDrapeau({ code: 'sous_plancher', message: 'Rémunération sous le plancher (40 K€) : à signaler' }, 'en')).toBe(
      'Pay below the floor (40 K€): to point out',
    );
  });
});

describe('configuration : clé « langue »', () => {
  const dossier = join(racine, 'config');
  mkdirSync(dossier, { recursive: true });
  const ecrire = (c: object) => writeFileSync(join(dossier, 'postuler-juste.config.json'), JSON.stringify(c));

  it('français par défaut, anglais par le fichier, variable POSTULER_JUSTE_LANGUE prioritaire', () => {
    ecrire({ dossierDonnees: '.' });
    expect(chargerConfig({ cwd: dossier, env: {} }).langue).toBe('fr');
    ecrire({ dossierDonnees: '.', langue: 'en' });
    expect(chargerConfig({ cwd: dossier, env: {} }).langue).toBe('en');
    expect(chargerConfig({ cwd: dossier, env: { POSTULER_JUSTE_LANGUE: 'fr' } }).langue).toBe('fr');
  });

  it('refuse une langue inconnue', () => {
    ecrire({ dossierDonnees: '.', langue: 'de' });
    expect(() => chargerConfig({ cwd: dossier, env: {} })).toThrow(/Langue inconnue : de/);
  });
});

describe('init --langue en', () => {
  const espace = join(racine, 'espace-en');
  const r = initialiserEspace({ dossier: espace, langue: 'en', env: { POSTULER_JUSTE_NAVIGATEUR: '/nulle/part' } });

  it('écrit la langue dans la configuration', () => {
    expect(r.langue).toBe('en');
    expect(JSON.parse(readFileSync(join(espace, 'postuler-juste.config.json'), 'utf8')).langue).toBe('en');
    expect(chargerConfig({ cwd: espace, env: {} }).langue).toBe('en');
  });

  it('prompt de démarrage et avertissements en anglais ; modèle anglais (modele-en/)', () => {
    expect(r.invite).toMatch(/^You are going to help me with my job search/);
    expect(r.invite).toContain(`${r.dossier}/DEMARRAGE.md`);
    expect(r.avertissements.join('\n')).toMatch(/No Chrome, Edge or Chromium found/);
    expect(r.avertissements.join('\n')).not.toMatch(/in French for now/);
    expect(readFileSync(join(espace, 'DEMARRAGE.md'), 'utf8')).toMatch(/^# Onboarding/);
  });

  it('sans --langue : « fr » écrit dans la configuration', () => {
    const fr = initialiserEspace({ dossier: join(racine, 'espace-fr'), env: { POSTULER_JUSTE_NAVIGATEUR: '/nulle/part' } });
    expect(fr.langue).toBe('fr');
    expect(fr.invite).toMatch(/^Tu vas m'aider/);
    expect(fr.avertissements.join('\n')).not.toMatch(/in French for now/);
  });

  it('copie modele-<langue>/ quand il existe', () => {
    const app = join(racine, 'app');
    mkdirSync(join(app, 'modele'), { recursive: true });
    expect(modeleDeLangue('en', app)).toBe(join(app, 'modele'));
    mkdirSync(join(app, 'modele-en'));
    expect(modeleDeLangue('en', app)).toBe(join(app, 'modele-en'));
    expect(modeleDeLangue('fr', app)).toBe(join(app, 'modele'));
    expect(modeleDeLangue('en')).toBe(join(MODELE, '..', 'modele-en'));
  });
});

describe('CLI en anglais', () => {
  const sortie: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sortie.length = 0;
  });
  const capturer = () => {
    vi.spyOn(process.stdout, 'write').mockImplementation((x) => (sortie.push(String(x)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((x) => (sortie.push(String(x)), true));
    vi.spyOn(console, 'log').mockImplementation((...x) => void sortie.push(`${x.join(' ')}\n`));
  };

  it('aide anglaise : noms des commandes et options en français, signalés', async () => {
    vi.stubEnv('POSTULER_JUSTE_LANGUE', 'en');
    capturer();
    expect(await main(['--help'])).toBe(0);
    const aide = sortie.join('');
    expect(aide).toContain('Command and option names, statuses and event types stay in French');
    expect(aide).toContain('list [filters]');
    expect(aide).toContain('--langue fr|en');
  });

  it('erreurs et messages dans la langue de la configuration', async () => {
    vi.stubEnv('POSTULER_JUSTE_LANGUE', 'en');
    capturer();
    expect(await main(['inconnue'])).toBe(2);
    expect(sortie.join('')).toMatch(/^Unknown command: inconnue/);
  });

  it('init --langue en : sortie en anglais même sans configuration', async () => {
    capturer();
    const dossier = join(racine, 'cli-en');
    expect(await main(['init', dossier, '--langue', 'en'])).toBe(0);
    const texte = sortie.join('');
    expect(texte).toContain('Workspace created:');
    expect(texte).toContain('language en');
    expect(texte).toContain('Paste this prompt:');
  });

  it('init --langue refuse une langue inconnue', async () => {
    capturer();
    expect(await main(['init', join(racine, 'cli-de'), '--langue', 'de'])).toBe(1);
    expect(sortie.join('')).toMatch(/--langue/);
  });
});

describe('API : langue de la configuration', () => {
  it('/api/sante renvoie la langue ; erreurs en anglais', async () => {
    const db = ouvrirBase(':memory:');
    const app = creerApp(db, { dossierDonnees: racine, langue: 'en' });
    expect(((await (await app.request('/api/sante')).json()) as { langue: string }).langue).toBe('en');
    const r = await app.request('/api/offres/999');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { erreur: string }).erreur).toBe('Offer not found');
    expect(((await (await app.request('/api/rien')).json()) as { erreur: string }).erreur).toBe('Unknown route');
    const fr = creerApp(db, { dossierDonnees: racine });
    expect(((await (await fr.request('/api/sante')).json()) as { langue: string }).langue).toBe('fr');
    expect(((await (await fr.request('/api/offres/999')).json()) as { erreur: string }).erreur).toBe('Offre introuvable');
  });
});

describe('suivi généré en anglais', () => {
  const DONNEES = join(import.meta.dirname, 'fixtures', 'donnees');
  const db = ouvrirBase(':memory:');
  importerHistorique(db, DONNEES);
  const md = genererSuivi(db, DONNEES, new Date('2026-11-02T09:30:00Z'), 'en').markdown;

  it('titres, en-têtes et mention « fichier généré » en anglais', () => {
    expect(md).toMatch(/^# Application tracking/);
    expect(md).toContain('File generated by postuler-juste on 02/11/2026 at 10:30: do not edit by hand.');
    expect(md).toMatch(/## In progress[\s\S]*## Sent without reply[\s\S]*## Closed/);
    expect(md).toContain('| Offer | Type | Channel | Sent | Status | Next action | Folder |');
    expect(md).toContain('| Offer | Outcome |');
    expect(md).toContain('Dates marked “≈” are estimates');
    expect(md).toContain('([folder](_archives/nu-fullstack/))');
    expect(md).not.toMatch(/En cours|Prochaine action/);
  });

  it('libellés de statut traduits ; un suivi anglais n’est pas relu par import-historique', () => {
    const mu = db.prepare("SELECT id FROM offres WHERE entreprise = 'Mu'").get() as { id: number };
    ajouterStatut(db, mu.id, 'entretien', { commentaire: null, origine: 'interface' });
    const apres = genererSuivi(db, DONNEES, new Date('2026-11-02T09:30:00Z'), 'en').markdown;
    expect(apres.split('\n').find((l) => l.includes('**Mu**'))).toContain('| Interview |');
    expect(MARQUE_SUIVI_GENERE.test(md.slice(0, 600))).toBe(true);
  });
});

describe('CV aux titres anglais', () => {
  const md = `# Jane DOE
**BACKEND DEVELOPER**
jane@example.com · London

## Summary
Backend developer.

## Experience
### 2020 – today · London
**Developer**
- APIs

<!-- page-break -->

## Technical Skills
- PHP
- Python

## Education & Certifications
- MSc

## Languages
- English
`;
  const html = cvEnHtml(md, { css: 'gabarit.css', portrait: null });

  it('deux colonnes pour Skills, Education & Certifications, Languages ; une pour Summary et Experience', () => {
    expect(html).toContain('<section class="two-col"><h2>Technical Skills</h2>');
    expect(html).toContain('<section class="two-col"><h2>Education &amp; Certifications</h2>');
    expect(html).toContain('<section class="two-col"><h2>Languages</h2>');
    expect(html).toContain('<section class=""><h2>Summary</h2>');
    expect(html).toContain('<section class=""><h2>Experience</h2>');
    expect(html).toContain('<p class="job-role"><strong>Developer</strong>');
  });

  it('<!-- page-break --> est un saut de page, comme <!-- saut-de-page -->', () => {
    expect(html).toMatch(/<\/section>\n<div class="saut-de-page" style="break-after: page"><\/div>\n<section class="two-col"><h2>Technical Skills/);
  });

  it('langue du document déduite des titres (en / fr), sans dépendre de la configuration', () => {
    expect(langueDuCv(md)).toBe('en');
    expect(html).toContain('<html lang="en">');
    const fr = readFileSync(join(MODELE, 'cv', '_exemple-structure.md'), 'utf8');
    expect(langueDuCv(fr)).toBe('fr');
    expect(cvEnHtml(fr, { css: 'g.css' })).toContain('<html lang="fr">');
  });
});
