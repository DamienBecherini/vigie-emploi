// Creation of a workspace: copy of the template (scaffold/), of the CV template and of the sample rubric,
// configuration of the application and of the MCP server, then onboarding prompt to give to the AI.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { NAME_FILE_CONFIG, APP_ROOT, systemLanguage } from '../core/config.ts';
import { exampleRubric } from '../core/rubric-storage.ts';
import { commandNode } from '../core/node.ts';
import { FOLDER_TEMPLATES, TEMPLATE_DEFAULT, listTemplates, findBrowser } from '../cv/cv.ts';
import { isLanguage, LANGUAGE_DEFAULT, LANGUAGE_REFERENCE, LANGUAGES, tl, type Language } from '../i18n/index.ts';
import { AppError } from '../core/errors.ts';

export const SCAFFOLD = join(APP_ROOT, 'scaffold');

/**
 * Workspace template in the wanted language: scaffold-<language>/ if it exists (translated AI instructions),
 * otherwise scaffold/ (English).
 */
export function scaffoldForLanguage(language: Language, root: string = APP_ROOT): string {
  if (language === LANGUAGE_REFERENCE) return join(root, 'scaffold');
  const translated = join(root, `scaffold-${language}`);
  return existsSync(translated) ? translated : join(root, 'scaffold');
}
export const BINARY = join(APP_ROOT, 'bin', 'vigie-emploi.js');
/** The application's instructions for the agent (AGENTS.md at the application's root). */
export const INSTRUCTIONS_APP = join(APP_ROOT, 'AGENTS.md');

/** Name of the application's instructions in a language: AGENTS.<language>.md if it exists, otherwise AGENTS.md (English). */
export function nameInstructionsApp(language: Language, root: string = APP_ROOT): string {
  if (language === LANGUAGE_REFERENCE) return 'AGENTS.md';
  return existsSync(join(root, `AGENTS.${language}.md`)) ? `AGENTS.${language}.md` : 'AGENTS.md';
}
const DROP_PUBLIC = 'https://github.com/DamienBecherini/vigie-emploi/blob/main/';
/** Where init copies the application's instructions when it runs from the npx cache. */
export const COPY_INSTRUCTIONS = 'procedures/application.md';

/**
 * How the workspace launches the application again (AI instructions and MCP server).
 * - From the repository or a lasting installation (npm i -g, node_modules of a project, Claude Desktop extension):
 *   `node <path>/bin/vigie-emploi.js`; in the Node built into Claude Desktop, the MCP command is "node" (the system's).
 * - From the npx cache (`npx vigie-emploi init …`): this cache can be purged, the path is worthless.
 *   `npx -y vigie-emploi@<version>` is written (frozen version: the database and its migrations stay consistent);
 *   on Windows, the MCP client launches npx through `cmd /c` (npx is a .cmd script there).
 */
export interface Launch {
  mode: 'path' | 'npx';
  /** Command to type in a terminal ({{CMD}} of the instructions). */
  command: string;
  /** Application as displayed in the instructions ({{APP}}). */
  app: string;
  /** MCP server of .mcp.json (without the environment). */
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
  /** Name of the MCP server in .mcp.json. */
  mcpName?: string;
  /** Shipped CV template to install (default: plain). */
  template?: string;
  /** Language of the interface, the CLI and the tracker, written into the config (default: fr). */
  language?: Language;
  env?: NodeJS.ProcessEnv;
}

export interface ResultInit {
  ok: true;
  folder: string;
  command: string;
  config: string;
  mcp: string;
  mcp_name: string;
  port: number;
  language: Language;
  browser: string | null;
  warnings: string[];
  prompt: string;
}

/** Path with forward slashes (accepted everywhere, Windows included). */
const slash = (p: string) => p.replace(/\\/g, '/');

function errorUser(message: string): never {
  throw new AppError('invalid', message);
}

/** Replaces the {{…}} markers of the text files copied from the template. */
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

/** Onboarding prompt to paste into the AI (in English, it also asks it to speak English). */
export function promptOnboarding(workspace: string, language: Language = LANGUAGE_DEFAULT): string {
  return tl(language, 'init.prompt', { workspace });
}

/** Folder created by `init` without an argument: vigie-emploi in the user's home folder (Windows, macOS, Linux). */
export function defaultWorkspace(home = homedir()): string {
  return join(home, 'vigie-emploi');
}

/** "~", "~/x" and "~\x" brought to the home folder (PowerShell does not expand ~ in the arguments of a program). */
export function expandHome(folder: string, home = homedir()): string {
  return folder === '~' ? home : /^~[\\/]/.test(folder) ? join(home, folder.slice(2)) : folder;
}

export function initializeWorkspace(o: OptionsInit): ResultInit {
  const language = o.language ?? systemLanguage(o.env);
  if (!isLanguage(language)) errorUser(tl(LANGUAGE_DEFAULT, 'init.languageUnknown', { language: String(language), languages: LANGUAGES.join(', ') }));
  const m = (key: Parameters<typeof tl>[1], params?: Parameters<typeof tl>[2]) => tl(language, key, params);
  if (!o.folder) errorUser(m('init.folderExpected'));
  const folder = resolve(expandHome(o.folder));
  if (existsSync(folder)) {
    if (!statSync(folder).isDirectory()) errorUser(m('init.notOneFolder', { folder }));
    if (readdirSync(folder).length) errorUser(m('init.notEmpty', { folder }));
  }
  const port = o.port ?? 4410;
  const mcpName = o.mcpName ?? 'vigie-emploi';
  if (!/^[\w-]+$/.test(mcpName)) errorUser(m('init.nameMcpInvalid', { name: mcpName }));

  const template = o.template ? join(FOLDER_TEMPLATES, o.template) : TEMPLATE_DEFAULT;
  if (!existsSync(join(template, 'gabarit.css'))) {
    errorUser(
      m('init.templateUnknown', {
        template: o.template,
        list: listTemplates()
          .map((g) => g.name)
          .join(', '),
      }),
    );
  }
  const workspace = slash(folder);
  const launched = launch();
  const { command, app } = launched;

  // Translated template (scaffold-fr/…) if it exists; otherwise the English template, reported by a warning.
  const scaffold = scaffoldForLanguage(language);
  cpSync(scaffold, folder, { recursive: true });
  // npm does not ship the .gitignore files of a package: the template keeps it under the name "gitignore".
  if (existsSync(join(folder, 'gitignore'))) renameSync(join(folder, 'gitignore'), join(folder, '.gitignore'));
  // The application's instructions: read in place, except from the npx cache (purgeable) where a copy is made.
  // Version in the workspace's language (AGENTS.fr.md…) if there is one.
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
  writeFileSync(mcp, `${JSON.stringify({ mcpServers: { [mcpName]: server } }, null, 2)}\n`, 'utf8');

  const warnings: string[] = [];
  if (language !== LANGUAGE_REFERENCE && scaffold === SCAFFOLD) warnings.push(m('init.scaffoldEnglish'));
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
    mcp_name: mcpName,
    port,
    language,
    browser,
    warnings,
    prompt: promptOnboarding(workspace, language),
  };
}
