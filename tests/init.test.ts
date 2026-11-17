import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/core/config.ts';
import { openDatabase } from '../src/db/database.ts';
import { rubricRequired } from '../src/core/rubric-storage.ts';
import { COPY_INSTRUCTIONS, initializeWorkspace, launch, scaffoldForLanguage } from '../src/init/init.ts';
import { cvToHtml } from '../src/cv/cv.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-init-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** All the files of a folder, as relative paths. */
function files(folder: string, prefix = ''): string[] {
  return readdirSync(folder).flatMap((n) => {
    const c = join(folder, n);
    return statSync(c).isDirectory() ? files(c, `${prefix}${n}/`) : [`${prefix}${n}`];
  });
}

describe('init: creation of a workspace', () => {
  const workspace = join(root, 'mon-workspace');
  const r = initializeWorkspace({ folder: workspace, port: 4411, mcpName: 'vigie-emploi-test', env: { VIGIE_EMPLOI_BROWSER: '/nulle/part' } });

  it('copies the template, the CV template and the sample rubric', () => {
    const copies = files(workspace);
    for (const f of files(scaffoldForLanguage('fr'))) expect(copies).toContain(f === 'gitignore' ? '.gitignore' : f);
    expect(copies).not.toContain('gitignore');
    expect(copies).toContain('.claude/skills/cv-cible/SKILL.md');
    expect(copies).toContain('cv/gabarit/gabarit.css');
    expect(copies).toContain('cv/gabarit/fonts/OFL.txt');
    expect(copies).toContain('profil/grille.json');
    expect(existsSync(join(workspace, 'data'))).toBe(true);
  });

  it('replaces the markers with the real paths', () => {
    for (const f of files(workspace).filter((x) => x.endsWith('.md'))) {
      expect(readFileSync(join(workspace, f), 'utf8'), f).not.toMatch(/\{\{\w+\}\}/);
    }
    const agents = readFileSync(join(workspace, 'AGENTS.md'), 'utf8');
    expect(agents).toContain(r.folder);
    expect(agents).toContain(r.command);
  });

  it('writes a configuration that the application finds from the workspace', () => {
    const c = loadConfig({ cwd: workspace, env: {} });
    expect(c.dataDir).toBe(workspace);
    expect(c.port).toBe(4411);
    const db = openDatabase(c.database);
    expect(rubricRequired(db, c.dataDir).version).toBe(1);
    db.close();
  });

  it('declares the MCP server with the data folder', () => {
    const mcp = JSON.parse(readFileSync(join(workspace, '.mcp.json'), 'utf8'));
    const s = mcp.mcpServers['vigie-emploi-test'];
    expect(s.args[1]).toBe('mcp');
    expect(s.env.VIGIE_EMPLOI_DATA).toBe(workspace);
  });

  it('reads the application’s instructions in place outside npx', () => {
    expect(readFileSync(join(workspace, 'AGENTS.md'), 'utf8')).toMatch(/ses consignes : `[^`]+\/AGENTS\.fr\.md`/);
    expect(existsSync(join(workspace, COPY_INSTRUCTIONS))).toBe(false);
  });

  it('launch command from the repository or a lasting installation: node + absolute path of the binary', () => {
    const l = launch('/opt/npm/lib/node_modules/vigie-emploi', '1.2.3', 'linux', '/usr/bin/node');
    expect(l.mode).toBe('path');
    expect(l.command).toBe('node "/opt/npm/lib/node_modules/vigie-emploi/bin/vigie-emploi.js"');
    expect(l.mcp.command).toBe('/usr/bin/node');
    expect(l.mcp.args[1]).toBe('mcp');
  });

  it('launch command from the npx cache: npx with the frozen version (cmd /c on Windows)', () => {
    const cache = 'C:\\Users\\x\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\vigie-emploi';
    const w = launch(cache, '1.2.3', 'win32', 'node.exe');
    expect(w.mode).toBe('npx');
    expect(w.command).toBe('npx -y vigie-emploi@1.2.3');
    expect(w.mcp).toEqual({ command: 'cmd', args: ['/c', 'npx', '-y', 'vigie-emploi@1.2.3', 'mcp'] });
    const l = launch('/home/x/.npm/_npx/abc123/node_modules/vigie-emploi', '1.2.3', 'linux');
    expect(l.mcp).toEqual({ command: 'npx', args: ['-y', 'vigie-emploi@1.2.3', 'mcp'] });
  });

  it('reports the missing browser and gives the onboarding prompt', () => {
    expect(r.browser).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/navigateur|Chrome/);
    expect(r.prompt).toContain(`${r.folder}/DEMARRAGE.md`);
  });

  it('refuses a folder that is not empty', () => {
    const full = join(root, 'plein');
    mkdirSync(full);
    writeFileSync(join(full, 'x.txt'), 'x');
    expect(() => initializeWorkspace({ folder: full })).toThrow(/pas vide/);
  });
});

describe('cv: Markdown -> HTML', () => {
  const md = readFileSync(join(scaffoldForLanguage('fr'), 'cv', '_exemple-structure.md'), 'utf8');
  const html = cvToHtml(md, { css: 'gabarit.css', portrait: null });

  it('builds the header: name, title, contacts on three rows', () => {
    expect(html).toContain('<h1>Julie MARCHAND</h1>');
    expect(html).toContain('<div class="headline">RESPONSABLE LOGISTIQUE &amp; AMÉLIORATION CONTINUE');
    expect(html).toMatch(/<ul class="contacts">[\s\S]*julie.marchand@example\.com/);
    expect(html).toMatch(/<ul class="contacts contacts-address">[\s\S]*Ville-Exemple \(00\)/);
    expect(html).toMatch(/<ul class="contacts contacts-profiles">[\s\S]*LinkedIn[\s\S]*GitHub/);
    expect(html).not.toContain('class="portrait"');
  });

  it('takes the manual page break out of the job before it', () => {
    const withBreak = md.replace('## Formations & Certifications', '<!-- saut-de-page -->\n\n## Formations & Certifications');
    const h = cvToHtml(withBreak, { css: 'gabarit.css', portrait: null });
    expect(h).toMatch(/<\/section>\n<div class="saut-de-page" style="break-after: page"><\/div>\n<section class="two-col"><h2>Formations/);
  });

  it('puts the skills and the languages on two columns, and the job title on top', () => {
    expect(html).toContain('<section class="two-col"><h2>Compétences Techniques</h2>');
    expect(html).toContain('<section class="two-col"><h2>Langues</h2>');
    expect(html).toContain('<section class=""><h2>Résumé</h2>');
    expect(html).toMatch(/<p class="job-role"><strong>Responsable d(&#39;|')entrepôt/);
  });
});

describe('CV templates', () => {
  it('lists the shipped templates and installs one, keeping the old one and the photo', async () => {
    const { listTemplates, chooseTemplate } = await import('../src/cv/cv.ts');
    expect(listTemplates().map((g) => g.name)).toEqual(expect.arrayContaining(['plain', 'modern', 'compact']));
    const workspace = join(root, 'workspace-template');
    initializeWorkspace({ folder: workspace, template: 'compact', env: {} });
    expect(readFileSync(join(workspace, 'cv', 'gabarit', 'gabarit.css'), 'utf8')).toContain('« compact »');
    writeFileSync(join(workspace, 'cv', 'gabarit', 'portrait.jpg'), 'x');
    const r = chooseTemplate(workspace, 'modern');
    expect(readFileSync(join(r.folder, 'gabarit.css'), 'utf8')).toContain('« modern »');
    expect(existsSync(join(r.folder, 'portrait.jpg'))).toBe(true);
    expect(existsSync(join(r.old!, 'gabarit.css'))).toBe(true);
    expect(() => chooseTemplate(workspace, 'unknown')).toThrow(/inconnu/);
  });
});

describe('default folder', () => {
  it('~/vigie-emploi without a folder; ~ expanded by init itself', async () => {
    const { defaultWorkspace, expandHome } = await import('../src/init/init.ts');
    expect(defaultWorkspace('/home/ana')).toBe(join('/home/ana', 'vigie-emploi'));
    expect(expandHome('~', '/home/ana')).toBe('/home/ana');
    expect(expandHome('~/recherche', '/home/ana')).toBe(join('/home/ana', 'recherche'));
    expect(expandHome('~\\recherche', 'C:\\Users\\ana')).toBe(join('C:\\Users\\ana', 'recherche'));
    expect(expandHome('/tmp/~x', '/home/ana')).toBe('/tmp/~x');
  });
});
