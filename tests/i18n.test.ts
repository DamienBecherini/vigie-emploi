// Multilingue (phase A) : dictionnaires français / anglais, choix de la langue (config, init --langue),
// CLI, API, suivi généré et CV aux titres anglais.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { DICTIONARIES } from '../src/i18n/index.ts';
import { translate, type MessageText } from '../src/i18n/tool.ts';
import { labelStatus, messageFlag } from '../src/i18n/labels.ts';
import { STATUSES } from '../src/core/statuses.ts';
import { DICTIONARIES_UI } from '../ui/src/i18n/index.ts';
import { loadConfig } from '../src/core/config.ts';
import { initializeWorkspace, SCAFFOLD, scaffoldOfLanguage } from '../src/init/init.ts';
import { openDatabase } from '../src/db/database.ts';
import { importHistory } from '../src/import/history.ts';
import { addStatus } from '../src/core/offers.ts';
import { generateTracker, MARKER_TRACKER_GENERATED } from '../src/export/tracker.ts';
import { cvToHtml, languageOfCv } from '../src/cv/cv.ts';
import { createApp } from '../src/api/server.ts';
import { main } from '../src/cli/main.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-i18n-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Paramètres {nom} d'un texte (toutes formes du pluriel confondues). */
function parameters(x: MessageText): string[] {
  const texts = typeof x === 'string' ? [x] : [x.one, x.other];
  return [...new Set(texts.flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
}

function compare(fr: Record<string, MessageText>, en: Record<string, MessageText>) {
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const key of Object.keys(fr)) expect(parameters(en[key]), key).toEqual(parameters(fr[key]));
  for (const [key, v] of Object.entries(en)) {
    const texts = typeof v === 'string' ? [v] : [v.one, v.other];
    for (const s of texts) expect(s.trim(), key).not.toBe('');
  }
}

describe('dictionaries', () => {
  it('CLI, API, suivi : mêmes clés et mêmes paramètres en français et en anglais', () => {
    compare(DICTIONARIES.fr, DICTIONARIES.en);
  });

  it('interface : mêmes clés et mêmes paramètres en français et en anglais', () => {
    compare(DICTIONARIES_UI.fr, DICTIONARIES_UI.en);
  });

  it('paramètres et pluriels selon la langue (0 et 1 au singulier en français)', () => {
    const offers = DICTIONARIES.fr['common.offers'];
    expect(translate(offers, 'fr', { n: 0 })).toBe('0 offre');
    expect(translate(offers, 'fr', { n: 2 })).toBe('2 offres');
    expect(translate(DICTIONARIES.en['common.offers'], 'en', { n: 0 })).toBe('0 offers');
    expect(translate(DICTIONARIES.en['common.offers'], 'en', { n: 1 })).toBe('1 offer');
    expect(translate('Bonjour {name}', 'fr', {})).toBe('Bonjour {name}');
  });

  it('libellés des statuts traduits, identifiants inchangés', () => {
    for (const s of STATUSES) expect(labelStatus(s, 'en')).toMatch(/^[A-Z]/);
    expect(labelStatus('dismissed', 'fr')).toBe('Écartée');
    expect(labelStatus('dismissed', 'en')).toBe('Discarded');
    expect(messageFlag({ code: 'sub_floor', message: 'Rémunération sous le plancher (40 K€) : à signaler' }, 'en')).toBe(
      'Pay below the floor (40 K€): to point out',
    );
  });
});

describe('configuration : clé « langue »', () => {
  const folder = join(root, 'config');
  mkdirSync(folder, { recursive: true });
  const write = (c: object) => writeFileSync(join(folder, 'vigie-emploi.config.json'), JSON.stringify(c));

  it('français par défaut, anglais par le fichier, variable VIGIE_EMPLOI_LANGUAGE prioritaire', () => {
    write({ dataDir: '.' });
    expect(loadConfig({ cwd: folder, env: {} }).language).toBe('fr');
    write({ dataDir: '.', language: 'en' });
    expect(loadConfig({ cwd: folder, env: {} }).language).toBe('en');
    expect(loadConfig({ cwd: folder, env: { VIGIE_EMPLOI_LANGUAGE: 'fr' } }).language).toBe('fr');
  });

  it('refuse une langue inconnue', () => {
    write({ dataDir: '.', language: 'de' });
    expect(() => loadConfig({ cwd: folder, env: {} })).toThrow(/Langue inconnue : de/);
  });
});

describe('init --langue en', () => {
  const workspace = join(root, 'workspace-en');
  const r = initializeWorkspace({ folder: workspace, language: 'en', env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });

  it('écrit la langue dans la configuration', () => {
    expect(r.language).toBe('en');
    expect(JSON.parse(readFileSync(join(workspace, 'vigie-emploi.config.json'), 'utf8')).language).toBe('en');
    expect(loadConfig({ cwd: workspace, env: {} }).language).toBe('en');
  });

  it('prompt de démarrage et avertissements en anglais ; modèle anglais (modele-en/)', () => {
    expect(r.prompt).toMatch(/^You are going to help me with my job search/);
    expect(r.prompt).toContain(`${r.folder}/DEMARRAGE.md`);
    expect(r.warnings.join('\n')).toMatch(/No Chrome, Edge or Chromium found/);
    expect(r.warnings.join('\n')).not.toMatch(/in French for now/);
    expect(readFileSync(join(workspace, 'DEMARRAGE.md'), 'utf8')).toMatch(/^# Onboarding/);
  });

  it('sans --langue : « fr » écrit dans la configuration', () => {
    const fr = initializeWorkspace({ folder: join(root, 'workspace-fr'), env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });
    expect(fr.language).toBe('fr');
    expect(fr.prompt).toMatch(/^Tu vas m'aider/);
    expect(fr.warnings.join('\n')).not.toMatch(/in French for now/);
  });

  it('copie modele-<langue>/ quand il existe', () => {
    const app = join(root, 'app');
    mkdirSync(join(app, 'scaffold'), { recursive: true });
    expect(scaffoldOfLanguage('en', app)).toBe(join(app, 'scaffold'));
    mkdirSync(join(app, 'scaffold-en'));
    expect(scaffoldOfLanguage('en', app)).toBe(join(app, 'scaffold-en'));
    expect(scaffoldOfLanguage('fr', app)).toBe(join(app, 'scaffold'));
    expect(scaffoldOfLanguage('en')).toBe(join(SCAFFOLD, '..', 'scaffold-en'));
  });
});

describe('CLI en anglais', () => {
  const output: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    output.length = 0;
  });
  const capture = () => {
    vi.spyOn(process.stdout, 'write').mockImplementation((x) => (output.push(String(x)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((x) => (output.push(String(x)), true));
    vi.spyOn(console, 'log').mockImplementation((...x) => void output.push(`${x.join(' ')}\n`));
  };

  it('aide anglaise : noms des commandes et options en français, signalés', async () => {
    vi.stubEnv('VIGIE_EMPLOI_LANGUAGE', 'en');
    capture();
    expect(await main(['--help'])).toBe(0);
    const help = output.join('');
    expect(help).toContain('Command and option names, statuses and event types stay in French');
    expect(help).toContain('list [filters]');
    expect(help).toContain('--langue fr|en');
  });

  it('erreurs et messages dans la langue de la configuration', async () => {
    vi.stubEnv('VIGIE_EMPLOI_LANGUAGE', 'en');
    capture();
    expect(await main(['unknown'])).toBe(2);
    expect(output.join('')).toMatch(/^Unknown command: unknown/);
  });

  it('init --langue en : sortie en anglais même sans configuration', async () => {
    capture();
    const folder = join(root, 'cli-en');
    expect(await main(['init', folder, '--language', 'en'])).toBe(0);
    const text = output.join('');
    expect(text).toContain('Workspace created:');
    expect(text).toContain('language en');
    expect(text).toContain('Paste this prompt:');
  });

  it('init --langue refuse une langue inconnue', async () => {
    capture();
    expect(await main(['init', join(root, 'cli-de'), '--language', 'de'])).toBe(1);
    expect(output.join('')).toMatch(/--language/);
  });
});

describe('API : langue de la configuration', () => {
  it('/api/sante renvoie la langue ; erreurs en anglais', async () => {
    const db = openDatabase(':memory:');
    const app = createApp(db, { dataDir: root, language: 'en' });
    expect(((await (await app.request('/api/health')).json()) as { language: string }).language).toBe('en');
    const r = await app.request('/api/offers/999');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe('Offer not found');
    expect(((await (await app.request('/api/nothing')).json()) as { error: string }).error).toBe('Unknown route');
    const fr = createApp(db, { dataDir: root });
    expect(((await (await fr.request('/api/health')).json()) as { language: string }).language).toBe('fr');
    expect(((await (await fr.request('/api/offers/999')).json()) as { error: string }).error).toBe('Offre introuvable');
  });
});

describe('suivi généré en anglais', () => {
  const DATA = join(import.meta.dirname, 'fixtures', 'data');
  const db = openDatabase(':memory:');
  importHistory(db, DATA);
  const md = generateTracker(db, DATA, new Date('2026-11-02T09:30:00Z'), 'en').markdown;

  it('titres, en-têtes et mention « fichier généré » en anglais', () => {
    expect(md).toMatch(/^# Application tracking/);
    expect(md).toContain('File generated by vigie-emploi on 02/11/2026 at 10:30: do not edit by hand.');
    expect(md).toMatch(/## In progress[\s\S]*## Sent without reply[\s\S]*## Closed/);
    expect(md).toContain('| Offer | Type | Channel | Sent | Status | Next action | Folder |');
    expect(md).toContain('| Offer | Outcome |');
    expect(md).toContain('Dates marked “≈” are estimates');
    expect(md).toContain('([folder](_archives/nu-fullstack/))');
    expect(md).not.toMatch(/En cours|Prochaine action/);
  });

  it('libellés de statut traduits ; un suivi anglais n’est pas relu par import-historique', () => {
    const mu = db.prepare("SELECT id FROM offers WHERE company = 'Mu'").get() as { id: number };
    addStatus(db, mu.id, 'interview', { comment: null, origin: 'interface' });
    const after = generateTracker(db, DATA, new Date('2026-11-02T09:30:00Z'), 'en').markdown;
    expect(after.split('\n').find((l) => l.includes('**Mu**'))).toContain('| Interview |');
    expect(MARKER_TRACKER_GENERATED.test(md.slice(0, 600))).toBe(true);
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
  const html = cvToHtml(md, { css: 'gabarit.css', portrait: null });

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
    expect(languageOfCv(md)).toBe('en');
    expect(html).toContain('<html lang="en">');
    const fr = readFileSync(join(SCAFFOLD, 'cv', '_exemple-structure.md'), 'utf8');
    expect(languageOfCv(fr)).toBe('fr');
    expect(cvToHtml(fr, { css: 'g.css' })).toContain('<html lang="fr">');
  });
});
