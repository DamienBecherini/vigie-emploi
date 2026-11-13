// Création d'un espace de travail : copie du modèle (modele/), du gabarit de CV et de la grille d'exemple,
// configuration de l'application et du serveur MCP, puis prompt de démarrage à donner à l'IA.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NAME_FILE_CONFIG, APP_ROOT } from '../core/config.ts';
import { exampleRubric } from '../core/rubric-storage.ts';
import { commandNode } from '../core/node.ts';
import { FOLDER_TEMPLATES, TEMPLATE_DEFAULT, listTemplates, findBrowser } from '../cv/cv.ts';
import { isLanguage, LANGUAGE_DEFAULT, LANGUAGES, tl, type Language } from '../i18n/index.ts';

export const SCAFFOLD = join(APP_ROOT, 'scaffold');

/**
 * Modèle de l'espace dans la langue voulue : modele-<langue>/ s'il existe (consignes de l'IA traduites,
 * à venir pour l'anglais), sinon modele/ (français).
 */
export function scaffoldOfLanguage(language: Language, root: string = APP_ROOT): string {
  if (language === LANGUAGE_DEFAULT) return join(root, 'scaffold');
  const translated = join(root, `scaffold-${language}`);
  return existsSync(translated) ? translated : join(root, 'scaffold');
}
export const BINARY = join(APP_ROOT, 'bin', 'vigie-emploi.js');
/** Consignes de l'application pour l'agent (AGENTS.md à la racine de l'application). */
export const INSTRUCTIONS_APP = join(APP_ROOT, 'AGENTS.md');

/** Nom des consignes de l'application dans une langue : AGENTS.<langue>.md s'il existe, sinon AGENTS.md (français). */
export function nameInstructionsApp(language: Language, root: string = APP_ROOT): string {
  if (language === LANGUAGE_DEFAULT) return 'AGENTS.md';
  return existsSync(join(root, `AGENTS.${language}.md`)) ? `AGENTS.${language}.md` : 'AGENTS.md';
}
const DROP_PUBLIC = 'https://github.com/DamienBecherini/vigie-emploi/blob/main/';
/** Où l'init copie les consignes de l'application quand celle-ci tourne depuis le cache de npx. */
export const COPY_INSTRUCTIONS = 'procedures/application.md';

/**
 * Comment l'espace de travail relance l'application (consignes de l'IA et serveur MCP).
 * - Depuis le dépôt ou une installation durable (npm i -g, node_modules d'un projet, extension Claude Desktop) :
 *   `node <chemin>/bin/vigie-emploi.js` ; dans le Node intégré de Claude Desktop, la commande MCP est « node » (celui du système).
 * - Depuis le cache de npx (`npx vigie-emploi init …`) : ce cache peut être purgé, le chemin ne vaut rien.
 *   On écrit `npx -y vigie-emploi@<version>` (version figée : la base et ses migrations restent cohérentes) ;
 *   sous Windows, le client MCP lance npx via `cmd /c` (npx y est un script .cmd).
 */
export interface Launch {
  mode: 'path' | 'npx';
  /** Commande à taper dans un terminal ({{CMD}} des consignes). */
  command: string;
  /** Application telle qu'affichée dans les consignes ({{APP}}). */
  app: string;
  /** Serveur MCP de .mcp.json (sans l'environnement). */
  mcp: { command: string; args: string[] };
}

export function launch(
  root: string = APP_ROOT,
  version: string = versionApp(root),
  platform: NodeJS.Platform = process.platform,
  node: string = commandNode(),
): Launch {
  if (/[\\/]_npx[\\/]/.test(root)) {
    const pkgInfo = `vigie-emploi@${version}`;
    const args = ['-y', pkgInfo, 'mcp'];
    return {
      mode: 'npx',
      command: `npx -y ${pkgInfo}`,
      app: `${pkgInfo} (npm)`,
      mcp: platform === 'win32' ? { command: 'cmd', args: ['/c', 'npx', ...args] } : { command: 'npx', args },
    };
  }
  const binary = join(root, 'bin', 'vigie-emploi.js');
  return { mode: 'path', command: `node "${slash(binary)}"`, app: slash(root), mcp: { command: node, args: [binary, 'mcp'] } };
}

function versionApp(root: string): string {
  return (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
}

export interface OptionsInit {
  folder: string;
  port?: number;
  /** Nom du serveur MCP dans .mcp.json. */
  nameMcp?: string;
  /** Gabarit de CV livré à installer (défaut : sobre). */
  template?: string;
  /** Langue de l'interface, de la CLI et du suivi, écrite dans la config (défaut : fr). */
  language?: Language;
  env?: NodeJS.ProcessEnv;
}

export interface ResultInit {
  ok: true;
  folder: string;
  command: string;
  config: string;
  mcp: string;
  name_mcp: string;
  port: number;
  language: Language;
  browser: string | null;
  warnings: string[];
  prompt: string;
}

/** Chemin avec des barres obliques (accepté partout, y compris sous Windows). */
const slash = (p: string) => p.replace(/\\/g, '/');

function errorUser(message: string): never {
  throw Object.assign(new Error(message), { user: true });
}

/** Remplace les marqueurs {{…}} des fichiers texte copiés depuis le modèle. */
function customize(folder: string, values: Record<string, string>): void {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) {
      customize(path, values);
    } else if (/\.(md|txt)$/i.test(name)) {
      const text = readFileSync(path, 'utf8');
      const replaced = text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => values[key] ?? m);
      if (replaced !== text) writeFileSync(path, replaced, 'utf8');
    }
  }
}

/** Prompt de démarrage à coller dans l'IA (en anglais, il lui demande aussi de parler anglais). */
export function promptOnboarding(workspace: string, language: Language = LANGUAGE_DEFAULT): string {
  return tl(language, 'init.prompt', { workspace });
}

export function initializeWorkspace(o: OptionsInit): ResultInit {
  const language = o.language ?? LANGUAGE_DEFAULT;
  if (!isLanguage(language)) errorUser(tl(LANGUAGE_DEFAULT, 'init.languageUnknown', { language: String(language), languages: LANGUAGES.join(', ') }));
  const m = (key: Parameters<typeof tl>[1], params?: Parameters<typeof tl>[2]) => tl(language, key, params);
  if (!o.folder) errorUser(m('init.folderExpected'));
  const folder = resolve(o.folder);
  if (existsSync(folder)) {
    if (!statSync(folder).isDirectory()) errorUser(m('init.notOneFolder', { folder }));
    if (readdirSync(folder).length) errorUser(m('init.notEmpty', { folder }));
  }
  const port = o.port ?? 4410;
  const nameMcp = o.nameMcp ?? 'vigie-emploi';
  if (!/^[\w-]+$/.test(nameMcp)) errorUser(m('init.nameMcpInvalid', { name: nameMcp }));

  const template = o.template ? join(FOLDER_TEMPLATES, o.template) : TEMPLATE_DEFAULT;
  if (!existsSync(join(template, 'gabarit.css'))) {
    errorUser(m('init.templateUnknown', { template: o.template, list: listTemplates().map((g) => g.name).join(', ') }));
  }
  const workspace = slash(folder);
  const launched = launch();
  const { command, app } = launched;

  // Modèle traduit (modele-en/…) s'il existe ; sinon le modèle français, signalé par un avertissement.
  const scaffold = scaffoldOfLanguage(language);
  cpSync(scaffold, folder, { recursive: true });
  // npm ne livre pas les .gitignore d'un paquet : le modèle le garde sous le nom « gitignore ».
  if (existsSync(join(folder, 'gitignore'))) renameSync(join(folder, 'gitignore'), join(folder, '.gitignore'));
  // Consignes de l'application : lues sur place, sauf depuis le cache de npx (purgeable) où on en copie une version.
  // Version de la langue de l'espace (AGENTS.en.md…) s'il y en a une.
  const instructions = nameInstructionsApp(language);
  let docApp = `${slash(APP_ROOT)}/${instructions}`;
  if (launched.mode === 'npx') {
    const text = readFileSync(join(APP_ROOT, instructions), 'utf8').replace(/\]\((?!https?:|#)([^)]+)\)/g, `](${DROP_PUBLIC}$1)`);
    writeFileSync(join(folder, COPY_INSTRUCTIONS), text, 'utf8');
    docApp = `${workspace}/${COPY_INSTRUCTIONS}`;
  }
  cpSync(template, join(folder, 'cv', 'gabarit'), { recursive: true });
  mkdirSync(join(folder, 'profil'), { recursive: true });
  cpSync(exampleRubric(language), join(folder, 'profil', 'grille.json'));
  mkdirSync(join(folder, 'data'), { recursive: true });
  customize(folder, { WORKSPACE: workspace, APP: app, CMD: command, DOC_APP: docApp });

  const config = join(folder, NAME_FILE_CONFIG);
  writeFileSync(config, `${JSON.stringify({ dataDir: '.', port, language }, null, 2)}\n`, 'utf8');

  const mcp = join(folder, '.mcp.json');
  const server = { ...launched.mcp, env: { VIGIE_EMPLOI_DATA: folder } };
  writeFileSync(mcp, `${JSON.stringify({ mcpServers: { [nameMcp]: server } }, null, 2)}\n`, 'utf8');

  const warnings: string[] = [];
  if (language !== LANGUAGE_DEFAULT && scaffold === SCAFFOLD) warnings.push(m('init.scaffoldFrench'));
  if (launched.mode === 'npx') warnings.push(m('init.npx', { command }));
  if (!existsSync(join(APP_ROOT, 'dist', 'ui', 'index.html'))) warnings.push(m('init.notCompile', { app }));
  const browser = findBrowser(o.env);
  if (!browser) warnings.push(m('init.withoutBrowser'));

  return {
    ok: true,
    folder: workspace,
    command,
    config: slash(config),
    mcp: slash(mcp),
    name_mcp: nameMcp,
    port,
    language,
    browser,
    warnings,
    prompt: promptOnboarding(workspace, language),
  };
}
