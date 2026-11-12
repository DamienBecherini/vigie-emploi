import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../src/core/config.ts';
import { ouvrirBase } from '../src/db/base.ts';
import { grilleObligatoire } from '../src/core/grille-stockage.ts';
import { initialiserEspace, MODELE } from '../src/init/init.ts';
import { cvEnHtml } from '../src/cv/cv.ts';

const racine = mkdtempSync(join(tmpdir(), 'postuler-juste-init-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));

/** Tous les fichiers d'un dossier, en chemins relatifs. */
function fichiers(dossier: string, prefixe = ''): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const c = join(dossier, n);
    return statSync(c).isDirectory() ? fichiers(c, `${prefixe}${n}/`) : [`${prefixe}${n}`];
  });
}

describe('init : création d’un espace de travail', () => {
  const espace = join(racine, 'mon-espace');
  const r = initialiserEspace({ dossier: espace, port: 4411, nomMcp: 'postuler-juste-test', env: { POSTULER_JUSTE_NAVIGATEUR: '/nulle/part' } });

  it('copie le modèle, le gabarit de CV et la grille d’exemple', () => {
    const copies = fichiers(espace);
    for (const f of fichiers(MODELE)) expect(copies).toContain(f);
    expect(copies).toContain('cv/gabarit/gabarit.css');
    expect(copies).toContain('cv/gabarit/fonts/OFL.txt');
    expect(copies).toContain('profil/grille.json');
    expect(existsSync(join(espace, 'data'))).toBe(true);
  });

  it('remplace les marqueurs par les chemins réels', () => {
    for (const f of fichiers(espace).filter((x) => x.endsWith('.md'))) {
      expect(readFileSync(join(espace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    const agents = readFileSync(join(espace, 'AGENTS.md'), 'utf8');
    expect(agents).toContain(r.dossier);
    expect(agents).toContain(r.commande);
  });

  it('écrit une configuration que l’application retrouve depuis l’espace', () => {
    const c = chargerConfig({ cwd: espace, env: {} });
    expect(c.dossierDonnees).toBe(espace);
    expect(c.port).toBe(4411);
    const db = ouvrirBase(c.base);
    expect(grilleObligatoire(db, c.dossierDonnees).version).toBe(1);
    db.close();
  });

  it('déclare le serveur MCP avec le dossier de données', () => {
    const mcp = JSON.parse(readFileSync(join(espace, '.mcp.json'), 'utf8'));
    const s = mcp.mcpServers['postuler-juste-test'];
    expect(s.args[1]).toBe('mcp');
    expect(s.env.POSTULER_JUSTE_DATA).toBe(espace);
  });

  it('signale l’absence de navigateur et donne le prompt de démarrage', () => {
    expect(r.navigateur).toBeNull();
    expect(r.avertissements.join(' ')).toMatch(/navigateur|Chrome/);
    expect(r.invite).toContain(`${r.dossier}/DEMARRAGE.md`);
  });

  it('refuse un dossier qui n’est pas vide', () => {
    const plein = join(racine, 'plein');
    mkdirSync(plein);
    writeFileSync(join(plein, 'x.txt'), 'x');
    expect(() => initialiserEspace({ dossier: plein })).toThrow(/pas vide/);
  });
});

describe('cv : Markdown -> HTML', () => {
  const md = readFileSync(join(MODELE, 'cv', '_exemple-structure.md'), 'utf8');
  const html = cvEnHtml(md, { css: 'gabarit.css', portrait: null });

  it('construit l’en-tête : nom, titre, contacts en trois rangées', () => {
    expect(html).toContain('<h1>Camille MARTIN</h1>');
    expect(html).toContain('<div class="headline">DÉVELOPPEUSE BACK-END PYTHON');
    expect(html).toMatch(/<ul class="contacts">[\s\S]*camille\.martin@example\.com/);
    expect(html).toMatch(/<ul class="contacts contacts-address">[\s\S]*Lyon \(69\)/);
    expect(html).toMatch(/<ul class="contacts contacts-profiles">[\s\S]*LinkedIn[\s\S]*GitHub/);
    expect(html).not.toContain('class="portrait"');
  });

  it('sort le saut de page manuel du poste qui le précède', () => {
    const avec = md.replace('## Formations & Certifications', '<!-- saut-de-page -->\n\n## Formations & Certifications');
    const h = cvEnHtml(avec, { css: 'gabarit.css', portrait: null });
    expect(h).toMatch(/<\/section>\n<div class="saut-de-page" style="break-after: page"><\/div>\n<section class="two-col"><h2>Formations/);
  });

  it('met les compétences et les langues sur deux colonnes, et l’intitulé du poste en tête', () => {
    expect(html).toContain('<section class="two-col"><h2>Compétences Techniques</h2>');
    expect(html).toContain('<section class="two-col"><h2>Langues</h2>');
    expect(html).toContain('<section class=""><h2>Résumé</h2>');
    expect(html).toContain('<p class="job-role"><strong>Développeuse back-end — Entreprise Exemple');
  });
});

describe('anciens noms (cap-emploi) encore reconnus', () => {
  it('lit cap-emploi.config.json, CAP_EMPLOI_DATA et data/cap-emploi.sqlite', () => {
    const ancien = join(racine, 'ancien');
    mkdirSync(join(ancien, 'data'), { recursive: true });
    writeFileSync(join(ancien, 'cap-emploi.config.json'), JSON.stringify({ dossierDonnees: '.', port: 4500 }));
    writeFileSync(join(ancien, 'data', 'cap-emploi.sqlite'), '');
    const parConfig = chargerConfig({ cwd: ancien, env: {} });
    expect(parConfig.port).toBe(4500);
    expect(parConfig.base).toBe(join(ancien, 'data', 'cap-emploi.sqlite'));
    const parVariable = chargerConfig({ cwd: racine, env: { CAP_EMPLOI_DATA: ancien } });
    expect(parVariable.dossierDonnees).toBe(ancien);
  });

  it('préfère la nouvelle base quand elle existe', () => {
    const neuf = join(racine, 'neuf');
    mkdirSync(join(neuf, 'data'), { recursive: true });
    writeFileSync(join(neuf, 'data', 'cap-emploi.sqlite'), '');
    writeFileSync(join(neuf, 'data', 'postuler-juste.sqlite'), '');
    expect(chargerConfig({ cwd: racine, env: { POSTULER_JUSTE_DATA: neuf } }).base).toBe(join(neuf, 'data', 'postuler-juste.sqlite'));
  });
});
