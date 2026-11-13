// Paquet npm : ressources livrées et chemins résolus depuis le JavaScript compilé (dist/).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  private?: boolean;
  files: string[];
  bin: Record<string, string>;
  dependencies: Record<string, string>;
};

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((n) => {
    const c = join(folder, n);
    return statSync(c).isDirectory() ? files(c) : [c];
  });
}

describe('paquet npm', () => {
  it('livre le code compilé et les ressources lues à l’exécution', () => {
    expect(pkg.private).toBeUndefined();
    for (const f of ['bin', 'dist', 'migrations', 'scaffold', 'templates', 'examples', 'AGENTS.md']) expect(pkg.files).toContain(f);
    expect(pkg.files).not.toContain('src');
  });

  it('n’a pas de .gitignore dans le modèle (npm ne le livrerait pas)', () => {
    expect(files(join(root, 'scaffold')).filter((f) => /[\\/]\.gitignore$/.test(f))).toEqual([]);
    expect(existsSync(join(root, 'scaffold', 'gitignore'))).toBe(true);
  });

  it('n’importe à l’exécution que des dépendances déclarées (l’interface est livrée compilée)', () => {
    const imported = new Set<string>();
    for (const f of files(join(root, 'src'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from '([^.'][^']*)'/g)) {
        if (m[1].startsWith('node:')) continue;
        imported.add(m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]);
      }
    }
    for (const name of imported) expect(Object.keys(pkg.dependencies), name).toContain(name);
  });

  // Après « npm run build » (fait par prepack) : le JavaScript compilé retrouve la racine du paquet.
  it.skipIf(!existsSync(join(root, 'dist', 'core', 'config.js')))('résout les chemins de ressources depuis dist/', async () => {
    const config = await import(pathToFileURL(join(root, 'dist', 'core', 'config.js')).href);
    expect(resolve(config.APP_ROOT)).toBe(root);
    const init = await import(pathToFileURL(join(root, 'dist', 'init', 'init.js')).href);
    expect(existsSync(join(init.SCAFFOLD, 'AGENTS.md'))).toBe(true);
    expect(existsSync(init.INSTRUCTIONS_APP)).toBe(true);
    const cv = await import(pathToFileURL(join(root, 'dist', 'cv', 'cv.js')).href);
    expect(existsSync(join(cv.TEMPLATE_DEFAULT, 'gabarit.css'))).toBe(true);
    const rubric = await import(pathToFileURL(join(root, 'dist', 'core', 'rubric-storage.js')).href);
    expect(existsSync(rubric.EXAMPLE_RUBRIC)).toBe(true);
    const database = await import(pathToFileURL(join(root, 'dist', 'db', 'database.js')).href);
    expect(database.migrations().length).toBeGreaterThan(0);
  });
});

describe('extension Claude Desktop (mcpb/manifest.json)', () => {
  const m = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8')) as {
    name: string;
    server: { type: string; entry_point: string; mcp_config: { command: string; args: string[]; env: Record<string, string> } };
    user_config: Record<string, { type: string; default?: string }>;
    compatibility: { runtimes: { node: string } };
  };

  it('lance le binaire de la commande vigie-emploi avec le node de Claude Desktop', () => {
    expect(m.name).toBe('vigie-emploi');
    expect(pkg.bin).toEqual({ 'vigie-emploi': 'bin/vigie-emploi.js' });
    expect(m.server.type).toBe('node');
    expect(m.server.entry_point).toBe(pkg.bin['vigie-emploi']);
    expect(m.server.mcp_config.command).toBe('node');
    expect(m.server.mcp_config.args).toEqual([`\${__dirname}/${m.server.entry_point}`, 'mcp']);
  });

  it('transmet le dossier et la langue choisis à l’installation', () => {
    expect(m.server.mcp_config.env).toEqual({ VIGIE_EMPLOI_DATA: '${user_config.folder}', VIGIE_EMPLOI_LANGUAGE: '${user_config.language}' });
    expect(m.user_config.folder).toMatchObject({ type: 'directory', default: '${HOME}/ma-recherche' });
    expect(m.user_config.language).toMatchObject({ type: 'string', default: 'fr' });
  });

  it('exige le même Node que package.json (node:sqlite)', () => {
    const engines = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
    expect(m.compatibility.runtimes.node).toBe(`${engines}.0.0`);
  });
});
