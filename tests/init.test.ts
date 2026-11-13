import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/core/config.ts';
import { openDatabase } from '../src/db/database.ts';
import { rubricRequired } from '../src/core/rubric-storage.ts';
import { COPY_INSTRUCTIONS, initializeWorkspace, launch, SCAFFOLD } from '../src/init/init.ts';
import { cvToHtml } from '../src/cv/cv.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-init-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Tous les fichiers d'un dossier, en chemins relatifs. */
function files(folder: string, prefix = ''): string[] {
  return readdirSync(folder).flatMap((n) => {
    const c = join(folder, n);
    return statSync(c).isDirectory() ? files(c, `${prefix}${n}/`) : [`${prefix}${n}`];
  });
}

describe('init : création d’un espace de travail', () => {
  const workspace = join(root, 'mon-workspace');
  const r = initializeWorkspace({ folder: workspace, port: 4411, nameMcp: 'vigie-emploi-test', env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });

  it('copie le modèle, le gabarit de CV et la grille d’exemple', () => {
    const copies = files(workspace);
    for (const f of files(SCAFFOLD)) expect(copies).toContain(f === 'gitignore' ? '.gitignore' : f);
    expect(copies).not.toContain('gitignore');
    expect(copies).toContain('.claude/skills/cv-cible/SKILL.md');
    expect(copies).toContain('cv/gabarit/gabarit.css');
    expect(copies).toContain('cv/gabarit/fonts/OFL.txt');
    expect(copies).toContain('profil/grille.json');
    expect(existsSync(join(workspace, 'data'))).toBe(true);
  });

  it('remplace les marqueurs par les chemins réels', () => {
    for (const f of files(workspace).filter((x) => x.endsWith('.md'))) {
      expect(readFileSync(join(workspace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    const agents = readFileSync(join(workspace, 'AGENTS.md'), 'utf8');
    expect(agents).toContain(r.folder);
    expect(agents).toContain(r.command);
  });

  it('écrit une configuration que l’application retrouve depuis l’espace', () => {
    const c = loadConfig({ cwd: workspace, env: {} });
    expect(c.dataDir).toBe(workspace);
    expect(c.port).toBe(4411);
    const db = openDatabase(c.database);
    expect(rubricRequired(db, c.dataDir).version).toBe(1);
    db.close();
  });

  it('déclare le serveur MCP avec le dossier de données', () => {
    const mcp = JSON.parse(readFileSync(join(workspace, '.mcp.json'), 'utf8'));
    const s = mcp.mcpServers['vigie-emploi-test'];
    expect(s.args[1]).toBe('mcp');
    expect(s.env.VIGIE_EMPLOI_DATA).toBe(workspace);
  });

  it('lit les consignes de l’application sur place hors npx', () => {
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/ses consignes : `[^`]+\/AGENTS\.md`/);
    expect(existsSync(join(workspace, COPY_INSTRUCTIONS))).toBe(false);
  });

  it('commande de lancement depuis le dépôt ou une installation durable : node + chemin absolu du binaire', () => {
    const l = launch('/opt/npm/lib/node_modules/vigie-emploi', '1.2.3', 'linux', '/usr/bin/node');
    expect(l.mode).toBe('path');
    expect(l.command).toBe('node "/opt/npm/lib/node_modules/vigie-emploi/bin/vigie-emploi.js"');
    expect(l.mcp.command).toBe('/usr/bin/node');
    expect(l.mcp.args[1]).toBe('mcp');
  });

  it('commande de lancement depuis le cache de npx : npx avec la version figée (cmd /c sous Windows)', () => {
    const cache = 'C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\vigie-emploi';
    const w = launch(cache, '1.2.3', 'win32', 'node.exe');
    expect(w.mode).toBe('npx');
    expect(w.command).toBe('npx -y vigie-emploi@1.2.3');
    expect(w.mcp).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'vigie-emploi@1.2.3', 'mcp'] });
    const l = launch('/home/x/.npm/_npx/abc123/node_modules/vigie-emploi', '1.2.3', 'linux');
    expect(l.mcp).toEqual({ command: 'npx', args: ['-y', 'vigie-emploi@1.2.3', 'mcp'] });
  });

  it('signale l’absence de navigateur et donne le prompt de démarrage', () => {
    expect(r.browser).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/navigateur|Chrome/);
    expect(r.prompt).toContain(`${r.folder}/DEMARRAGE.md`);
  });

  it('refuse un dossier qui n’est pas vide', () => {
    const full = join(root, 'plein');
    mkdirSync(full);
    writeFileSync(join(full, 'x.txt'), 'x');
    expect(() => initializeWorkspace({ folder: full })).toThrow(/pas vide/);
  });
});

describe('cv : Markdown -> HTML', () => {
  const md = readFileSync(join(SCAFFOLD, 'cv', '_exemple-structure.md'), 'utf8');
  const html = cvToHtml(md, { css: 'gabarit.css', portrait: null });

  it('construit l’en-tête : nom, titre, contacts en trois rangées', () => {
    expect(html).toContain('<h1>Julie MARCHAND</h1>');
    expect(html).toContain('<div class="headline">RESPONSABLE LOGISTIQUE &amp; AMÉLIORATION CONTINUE');
    expect(html).toMatch(/<ul class="contacts">[\s\S]*julie.marchand@example\.com/);
    expect(html).toMatch(/<ul class="contacts contacts-address">[\s\S]*Ville-Exemple \(00\)/);
    expect(html).toMatch(/<ul class="contacts contacts-profiles">[\s\S]*LinkedIn[\s\S]*GitHub/);
    expect(html).not.toContain('class="portrait"');
  });

  it('sort le saut de page manuel du poste qui le précède', () => {
    const withBreak = md.replace('## Formations & Certifications', '<!-- saut-de-page -->\n\n## Formations & Certifications');
    const h = cvToHtml(withBreak, { css: 'gabarit.css', portrait: null });
    expect(h).toMatch(/<\/section>\n<div class="saut-de-page" style="break-after: page"><\/div>\n<section class="two-col"><h2>Formations/);
  });

  it('met les compétences et les langues sur deux colonnes, et l’intitulé du poste en tête', () => {
    expect(html).toContain('<section class="two-col"><h2>Compétences Techniques</h2>');
    expect(html).toContain('<section class="two-col"><h2>Langues</h2>');
    expect(html).toContain('<section class=""><h2>Résumé</h2>');
    expect(html).toMatch(/<p class="job-role"><strong>Responsable d(&#39;|')entrepôt/);
  });
});

describe('anciens noms (postuler-juste, cap-emploi) encore reconnus', () => {
  it('lit postuler-juste.config.json, POSTULER_JUSTE_DATA et data/postuler-juste.sqlite', () => {
    const old = join(root, 'old-pj');
    mkdirSync(join(old, 'data'), { recursive: true });
    writeFileSync(join(old, 'postuler-juste.config.json'), JSON.stringify({ dataDir: '.', port: 4501 }));
    writeFileSync(join(old, 'data', 'postuler-juste.sqlite'), '');
    const byConfig = loadConfig({ cwd: old, env: {} });
    expect(byConfig.port).toBe(4501);
    expect(byConfig.database).toBe(join(old, 'data', 'postuler-juste.sqlite'));
    const byVariable = loadConfig({ cwd: root, env: { POSTULER_JUSTE_DATA: old } });
    expect(byVariable.dataDir).toBe(old);
  });

  it('lit cap-emploi.config.json, CAP_EMPLOI_DATA et data/cap-emploi.sqlite', () => {
    const old = join(root, 'old');
    mkdirSync(join(old, 'data'), { recursive: true });
    writeFileSync(join(old, 'cap-emploi.config.json'), JSON.stringify({ dataDir: '.', port: 4500 }));
    writeFileSync(join(old, 'data', 'cap-emploi.sqlite'), '');
    const byConfig = loadConfig({ cwd: old, env: {} });
    expect(byConfig.port).toBe(4500);
    expect(byConfig.database).toBe(join(old, 'data', 'cap-emploi.sqlite'));
    const byVariable = loadConfig({ cwd: root, env: { CAP_EMPLOI_DATA: old } });
    expect(byVariable.dataDir).toBe(old);
  });

  it('préfère la nouvelle base quand elle existe', () => {
    const fresh = join(root, 'neuf');
    mkdirSync(join(fresh, 'data'), { recursive: true });
    writeFileSync(join(fresh, 'data', 'cap-emploi.sqlite'), '');
    writeFileSync(join(fresh, 'data', 'vigie-emploi.sqlite'), '');
    expect(loadConfig({ cwd: root, env: { VIGIE_EMPLOI_DATA: fresh } }).database).toBe(join(fresh, 'data', 'vigie-emploi.sqlite'));
  });
});

describe('gabarits de CV', () => {
  it('liste les gabarits livrés et en installe un en gardant l’ancien et la photo', async () => {
    const { listTemplates, chooseTemplate } = await import('../src/cv/cv.ts');
    expect(listTemplates().map((g) => g.name)).toEqual(expect.arrayContaining(['plain', 'modern', 'compact']));
    const workspace = join(root, 'workspace-template');
    initializeWorkspace({ folder: workspace, template: 'compact', env: {} });
    expect(readFileSync(join(workspace, 'cv', 'gabarit', 'gabarit.css'), 'utf8')).toContain('« compact »');
    writeFileSync(join(workspace, 'cv', 'gabarit', 'portrait.jpg'), 'x');
    const r = chooseTemplate(workspace, 'modern');
    expect(readFileSync(join(r.folder, 'gabarit.css'), 'utf8')).toContain('« moderne »');
    expect(existsSync(join(r.folder, 'portrait.jpg'))).toBe(true);
    expect(existsSync(join(r.old!, 'gabarit.css'))).toBe(true);
    expect(() => chooseTemplate(workspace, 'unknown')).toThrow(/inconnu/);
  });
});
