// npm package: shipped resources and paths resolved from the compiled JavaScript (dist/).
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

describe('npm package', () => {
  it('ships the compiled code and the resources read at run time', () => {
    expect(pkg.private).toBeUndefined();
    for (const f of ['bin', 'dist', 'migrations', 'scaffold', 'templates', 'examples', 'AGENTS.md']) expect(pkg.files).toContain(f);
    expect(pkg.files).not.toContain('src');
  });

  it('has no .gitignore in the template (npm would not ship it)', () => {
    expect(files(join(root, 'scaffold')).filter((f) => /[\\/]\.gitignore$/.test(f))).toEqual([]);
    expect(existsSync(join(root, 'scaffold', 'gitignore'))).toBe(true);
  });

  it('only imports declared dependencies at run time (the interface is shipped compiled)', () => {
    const imported = new Set<string>();
    for (const f of files(join(root, 'src'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/from '([^.'][^']*)'/g)) {
        if (m[1].startsWith('node:')) continue;
        imported.add(m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]);
      }
    }
    for (const name of imported) expect(Object.keys(pkg.dependencies), name).toContain(name);
  });

  // After "npm run build" (done by prepack): the compiled JavaScript finds the package root again.
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

describe('Claude Desktop extension (mcpb/manifest.json)', () => {
  const m = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8')) as {
    name: string;
    server: { type: string; entry_point: string; mcp_config: { command: string; args: string[]; env: Record<string, string> } };
    user_config: Record<string, { type: string; default?: string }>;
    compatibility: { runtimes: { node: string } };
  };

  it('launches the binary of the vigie-emploi command with Claude Desktop’s node', () => {
    expect(m.name).toBe('vigie-emploi');
    expect(pkg.bin).toEqual({ 'vigie-emploi': 'bin/vigie-emploi.js' });
    expect(m.server.type).toBe('node');
    expect(m.server.entry_point).toBe(pkg.bin['vigie-emploi']);
    expect(m.server.mcp_config.command).toBe('node');
    expect(m.server.mcp_config.args).toEqual([`\${__dirname}/${m.server.entry_point}`, 'mcp']);
  });

  it('passes the folder and the language chosen at install time', () => {
    expect(m.server.mcp_config.env).toEqual({ VIGIE_EMPLOI_DATA: '${user_config.folder}', VIGIE_EMPLOI_LANGUAGE: '${user_config.language}' });
    expect(m.user_config.folder).toMatchObject({ type: 'directory', default: '${HOME}/ma-recherche' });
    expect(m.user_config.language).toMatchObject({ type: 'string', default: 'fr' });
  });

  it('requires the same Node as package.json (node:sqlite)', () => {
    const engines = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
    expect(m.compatibility.runtimes.node).toBe(`${engines}.0.0`);
  });
});
