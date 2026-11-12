import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chargerConfig } from '../src/core/config.ts';
import { ouvrirBase } from '../src/db/base.ts';
import { grilleObligatoire } from '../src/core/grille-stockage.ts';
import { COPIE_CONSIGNES, initialiserEspace, lancement, MODELE } from '../src/init/init.ts';
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
    for (const f of fichiers(MODELE)) expect(copies).toContain(f === 'gitignore' ? '.gitignore' : f);
    expect(copies).not.toContain('gitignore');
    expect(copies).toContain('.claude/skills/cv-cible/SKILL.md');
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

  it('lit les consignes de l’application sur place hors npx', () => {
    expect(readFileSync(join(espace, 'AGENTS.md'), 'utf8')).toMatch(/ses consignes : `[^`]+\/AGENTS\.md`/);
    expect(existsSync(join(espace, COPIE_CONSIGNES))).toBe(false);
  });

  it('commande de lancement depuis le dépôt ou une installation durable : node + chemin absolu du binaire', () => {
    const l = lancement('/opt/npm/lib/node_modules/postuler-juste', '1.2.3', 'linux', '/usr/bin/node');
    expect(l.mode).toBe('chemin');
    expect(l.commande).toBe('node "/opt/npm/lib/node_modules/postuler-juste/bin/postuler-juste.js"');
    expect(l.mcp.command).toBe('/usr/bin/node');
    expect(l.mcp.args[1]).toBe('mcp');
  });

  it('commande de lancement depuis le cache de npx : npx avec la version figée (cmd /c sous Windows)', () => {
    const cache = 'C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\postuler-juste';
    const w = lancement(cache, '1.2.3', 'win32', 'node.exe');
    expect(w.mode).toBe('npx');
    expect(w.commande).toBe('npx -y postuler-juste@1.2.3');
    expect(w.mcp).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'postuler-juste@1.2.3', 'mcp'] });
    const l = lancement('/home/x/.npm/_npx/abc123/node_modules/postuler-juste', '1.2.3', 'linux');
    expect(l.mcp).toEqual({ command: 'npx', args: ['-y', 'postuler-juste@1.2.3', 'mcp'] });
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
    expect(html).toContain('<h1>Julie MARCHAND</h1>');
    expect(html).toContain('<div class="headline">RESPONSABLE LOGISTIQUE &amp; AMÉLIORATION CONTINUE');
    expect(html).toMatch(/<ul class="contacts">[\s\S]*julie.marchand@example\.com/);
    expect(html).toMatch(/<ul class="contacts contacts-address">[\s\S]*Ville-Exemple \(00\)/);
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
    expect(html).toMatch(/<p class="job-role"><strong>Responsable d(&#39;|')entrepôt/);
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

describe('gabarits de CV', () => {
  it('liste les gabarits livrés et en installe un en gardant l’ancien et la photo', async () => {
    const { listerGabarits, choisirGabarit } = await import('../src/cv/cv.ts');
    expect(listerGabarits().map((g) => g.nom)).toEqual(expect.arrayContaining(['sobre', 'moderne', 'compact']));
    const espace = join(racine, 'espace-gabarit');
    initialiserEspace({ dossier: espace, gabarit: 'compact', env: {} });
    expect(readFileSync(join(espace, 'cv', 'gabarit', 'gabarit.css'), 'utf8')).toContain('« compact »');
    writeFileSync(join(espace, 'cv', 'gabarit', 'portrait.jpg'), 'x');
    const r = choisirGabarit(espace, 'moderne');
    expect(readFileSync(join(r.dossier, 'gabarit.css'), 'utf8')).toContain('« moderne »');
    expect(existsSync(join(r.dossier, 'portrait.jpg'))).toBe(true);
    expect(existsSync(join(r.ancien!, 'gabarit.css'))).toBe(true);
    expect(() => choisirGabarit(espace, 'inconnu')).toThrow(/inconnu/);
  });
});
