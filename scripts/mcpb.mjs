#!/usr/bin/env node
// Construit l'extension Claude Desktop (MCP Bundle) : build/vigie-emploi-<version>.mcpb.
// 1. builds the application (npm run build: dist/ and dist/ui), unless --without-build;
// 2. prepares build/mcpb/vigie-emploi/: compiled JavaScript, resources read at run time, manifest (version from
//    package.json), icon, and production node_modules only (npm ci --omit=dev);
// 3. validates the manifest and packs the folder with the official tool (@anthropic-ai/mcpb: validate, pack).
// Usage: npm run mcpb [-- --without-build]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const output = join(root, 'build');
const stage = join(output, 'mcpb', 'vigie-emploi');
const archive = join(output, `vigie-emploi-${pkg.version}.mcpb`);
const cliMcpb = join(root, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');

/** Translated versions present at the root: scaffold-<language>/, AGENTS.<language>.md, README.<language>.md. */
const TRANSLATIONS = readdirSync(root).filter((n) => /^scaffold-[a-z]{2,3}$|^(AGENTS|README)\.[a-z]{2,3}\.md$/.test(n));

/** What the application reads at run time (like the files field of package.json), without the whole docs/ folder. */
const TO_COPY = [
  'bin/vigie-emploi.js',
  'dist',
  'migrations',
  'scaffold',
  'templates',
  'examples',
  'AGENTS.md',
  'docs/utiliser-avec-une-ia.md',
  'vigie-emploi.config.example.json',
  'LICENSE',
  'README.md',
  ...TRANSLATIONS,
];

function launch(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  // npm is a .cmd script on Windows: it goes through the shell, as a single string (arguments without spaces here).
  const byShell = command === 'npm' && process.platform === 'win32';
  const r = byShell
    ? spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true, ...options })
    : spawnSync(command, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) {
    console.error(`Échec : ${command} ${args.join(' ')} (code ${r.status ?? r.error?.message})`);
    process.exit(1);
  }
}

if (!process.argv.includes('--without-build')) launch('npm', ['run', 'build'], { cwd: root });
if (!existsSync(join(root, 'dist', 'cli', 'main.js')) || !existsSync(join(root, 'dist', 'ui', 'index.html'))) {
  console.error('dist/ incomplet : lancer npm run build.');
  process.exit(1);
}
if (!existsSync(cliMcpb)) {
  console.error('Outil @anthropic-ai/mcpb absent : lancer npm install.');
  process.exit(1);
}

rmSync(join(output, 'mcpb'), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const path of TO_COPY) {
  cpSync(join(root, path), join(stage, path), { recursive: true });
}

// Production dependencies, exact versions from package-lock.json.
cpSync(join(root, 'package.json'), join(stage, 'package.json'));
cpSync(join(root, 'package-lock.json'), join(stage, 'package-lock.json'));
launch('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage });
rmSync(join(stage, 'package-lock.json'));

// Slimmed-down package.json: "type": "module" (required by the .js files of dist/), version, dependencies; no scripts nor devDependencies.
const keep = ['name', 'version', 'description', 'author', 'license', 'homepage', 'repository', 'type', 'bin', 'engines', 'dependencies'];
writeFileSync(join(stage, 'package.json'), `${JSON.stringify(Object.fromEntries(keep.filter((c) => c in pkg).map((c) => [c, pkg[c]])), null, 2)}\n`);

// Manifest: package version; the $schema is only for the editor.
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8'));
delete manifest.$schema;
manifest.version = pkg.version;
writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
cpSync(join(root, 'mcpb', 'icon.png'), join(stage, 'icon.png'));

launch(process.execPath, [cliMcpb, 'validate', join(stage, 'manifest.json')]);
rmSync(archive, { force: true });
launch(process.execPath, [cliMcpb, 'pack', stage, archive]);

const mo = (statSync(archive).size / 1024 / 1024).toFixed(1);
console.log(`\nExtension Claude Desktop : ${archive.replace(/\\/g, '/')} (${mo} Mo)`);
console.log('Installation : double-clic sur le fichier, ou Claude Desktop > Paramètres > Extensions > Paramètres avancés > Installer une extension.');
