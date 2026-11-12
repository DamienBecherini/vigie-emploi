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
  const r = initialiserEspace({ dossier: espace, port: 4411, nomMcp: 'cap-emploi-test', env: { CAP_EMPLOI_NAVIGATEUR: '/nulle/part' } });

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
    const s = mcp.mcpServers['cap-emploi-test'];
    expect(s.args[1]).toBe('mcp');
    expect(s.env.CAP_EMPLOI_DATA).toBe(espace);
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

  it('met les compétences et les langues sur deux colonnes, et l’intitulé du poste en tête', () => {
    expect(html).toContain('<section class="two-col"><h2>Compétences Techniques</h2>');
    expect(html).toContain('<section class="two-col"><h2>Langues</h2>');
    expect(html).toContain('<section class=""><h2>Résumé</h2>');
    expect(html).toContain('<p class="job-role"><strong>Développeuse back-end — Entreprise Exemple');
  });
});
