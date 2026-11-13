#!/usr/bin/env node
// Construit l'extension Claude Desktop (MCP Bundle) : build/vigie-emploi-<version>.mcpb.
// 1. compile l'application (npm run build : dist/ et dist/ui), sauf avec --sans-build ;
// 2. prépare build/mcpb/vigie-emploi/ : JavaScript compilé, ressources lues à l'exécution, manifeste (version de
//    package.json), icône, et node_modules de production seulement (npm ci --omit=dev) ;
// 3. valide le manifeste et emballe le dossier avec l'outil officiel (@anthropic-ai/mcpb : validate, pack).
// Usage : npm run mcpb [-- --sans-build]
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(racine, 'package.json'), 'utf8'));
const sortie = join(racine, 'build');
const etage = join(sortie, 'mcpb', 'vigie-emploi');
const paquet = join(sortie, `vigie-emploi-${pkg.version}.mcpb`);
const cliMcpb = join(racine, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');

/** Versions traduites présentes à la racine : modele-<langue>/, AGENTS.<langue>.md, README.<langue>.md. */
const TRADUCTIONS = readdirSync(racine).filter((n) => /^modele-[a-z]{2,3}$|^(AGENTS|README)\.[a-z]{2,3}\.md$/.test(n));

/** Ce que l'application lit à l'exécution (comme le champ files de package.json), sans le dossier docs/ entier. */
const A_COPIER = [
  'bin/vigie-emploi.js',
  'dist',
  'migrations',
  'modele',
  'gabarits',
  'exemples',
  'AGENTS.md',
  'docs/utiliser-avec-une-ia.md',
  'vigie-emploi.config.example.json',
  'LICENSE',
  'README.md',
  ...TRADUCTIONS,
];

function lancer(commande, args, options = {}) {
  console.log(`> ${commande} ${args.join(' ')}`);
  // npm est un script .cmd sous Windows : il passe par le shell, en une seule chaîne (arguments sans espaces ici).
  const parShell = commande === 'npm' && process.platform === 'win32';
  const r = parShell
    ? spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', shell: true, ...options })
    : spawnSync(commande, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) {
    console.error(`Échec : ${commande} ${args.join(' ')} (code ${r.status ?? r.error?.message})`);
    process.exit(1);
  }
}

if (!process.argv.includes('--sans-build')) lancer('npm', ['run', 'build'], { cwd: racine });
if (!existsSync(join(racine, 'dist', 'cli', 'main.js')) || !existsSync(join(racine, 'dist', 'ui', 'index.html'))) {
  console.error('dist/ incomplet : lancer npm run build.');
  process.exit(1);
}
if (!existsSync(cliMcpb)) {
  console.error('Outil @anthropic-ai/mcpb absent : lancer npm install.');
  process.exit(1);
}

rmSync(join(sortie, 'mcpb'), { recursive: true, force: true });
mkdirSync(etage, { recursive: true });
for (const chemin of A_COPIER) {
  cpSync(join(racine, chemin), join(etage, chemin), { recursive: true });
}

// Dépendances de production, versions exactes du package-lock.json.
cpSync(join(racine, 'package.json'), join(etage, 'package.json'));
cpSync(join(racine, 'package-lock.json'), join(etage, 'package-lock.json'));
lancer('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: etage });
rmSync(join(etage, 'package-lock.json'));

// package.json allégé : "type": "module" (indispensable aux .js de dist/), version, dépendances ; ni scripts ni devDependencies.
const garder = ['name', 'version', 'description', 'author', 'license', 'homepage', 'repository', 'type', 'bin', 'engines', 'dependencies'];
writeFileSync(join(etage, 'package.json'), `${JSON.stringify(Object.fromEntries(garder.filter((c) => c in pkg).map((c) => [c, pkg[c]])), null, 2)}\n`);

// Manifeste : version du paquet ; le $schema ne sert qu'à l'éditeur.
const manifeste = JSON.parse(readFileSync(join(racine, 'mcpb', 'manifest.json'), 'utf8'));
delete manifeste.$schema;
manifeste.version = pkg.version;
writeFileSync(join(etage, 'manifest.json'), `${JSON.stringify(manifeste, null, 2)}\n`);
cpSync(join(racine, 'mcpb', 'icon.png'), join(etage, 'icon.png'));

lancer(process.execPath, [cliMcpb, 'validate', join(etage, 'manifest.json')]);
rmSync(paquet, { force: true });
lancer(process.execPath, [cliMcpb, 'pack', etage, paquet]);

const mo = (statSync(paquet).size / 1024 / 1024).toFixed(1);
console.log(`\nExtension Claude Desktop : ${paquet.replace(/\\/g, '/')} (${mo} Mo)`);
console.log('Installation : double-clic sur le fichier, ou Claude Desktop > Paramètres > Extensions > Paramètres avancés > Installer une extension.');
