// Outil MCP ouvrir_tableau_de_bord : le tableau de bord web sans terminal (client MCP seul, comme Claude Desktop).
// 1. Un tableau de bord répond déjà sur le port de l'espace (/api/sante, même dossier) : on renvoie son adresse.
// 2. Sinon on le démarre dans un processus node séparé et détaché (`vigie-emploi serve --inactivite 60`) : il survit
//    au redémarrage du serveur MCP et s'arrête seul après une heure sans activité.
// 3. Faute de node utilisable (extension Claude Desktop dans le Node intégré, sans node installé), on le démarre dans le
//    processus du serveur MCP : il vit alors tant que Claude Desktop garde le serveur ouvert.
// Ports : celui de l'espace, puis les suivants s'ils sont pris par autre chose (autre espace, autre logiciel).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Config } from '../core/config.ts';
import { nodeExecutable } from '../core/node.ts';
import { openDatabase } from '../db/database.ts';
import { BINARY } from '../init/init.ts';
import { messageNotInitialized, type StateMcp } from './state.ts';
import { on } from './results.ts';
import { tm } from './texts.ts';

/** Arrêt automatique du tableau de bord lancé par l'IA, en minutes sans activité. */
export const IDLE_MIN = 60;
/** Ports essayés après celui de l'espace. */
const PORTS_TRIED = 10;
const PENDING_ONBOARDING_MS = 15_000;

const slash = (p: string) => p.replace(/\\/g, '/');
const sameFolder = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** Réponse de /api/sante : null si rien ne répond ; { service: null } si autre chose qu'un tableau de bord occupe le port. */
export type Health = { service: string | null; folder?: string } | null;

export async function probe(port: number, timeoutMs = 1500): Promise<Health> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    const j = (await r.json().catch(() => null)) as { service?: string; folder?: string } | null;
    return j?.service ? { service: j.service, folder: j.folder } : { service: null };
  } catch (e) {
    // Connexion refusée : port libre. Délai dépassé ou réponse illisible : port occupé par autre chose.
    const code = (e as { cause?: { code?: string } }).cause?.code;
    return code === 'ECONNREFUSED' ? null : { service: null };
  }
}

export type ModeLaunch = 'detached' | 'hosted';

export interface Dependencies {
  probe: (port: number) => Promise<Health>;
  /** Node pour un processus séparé, ou null (démarrage dans le processus du serveur MCP). */
  node: () => string | null;
  /** Lance le processus détaché ; renvoie son pid (tests). */
  launchDetached: (node: string, config: Config, port: number) => number | undefined;
  launchHosted: (config: Config, port: number) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  openBrowser: (url: string) => void;
}

export interface ResultTable {
  ok: true;
  url: string;
  already_launched: boolean;
  mode: ModeLaunch | 'existing';
  stop_auto_min: number | null;
  browser_open: boolean;
  to_tell: string;
}

export function launchDetached(node: string, config: Config, port: number): number | undefined {
  const args = [BINARY, 'serve', '--data', config.dataDir, '--port', String(port), '--idle', String(IDLE_MIN)];
  const child = spawn(node, args, { cwd: config.dataDir, detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined); // l'échec se voit à l'attente de /api/sante
  child.unref();
  return child.pid;
}

async function launchHosted(config: Config, port: number): Promise<void> {
  // Connexion à la base propre au tableau de bord : le serveur MCP peut fermer la sienne en changeant d'espace.
  const { startServer } = await import('../api/server.ts'); // chargé seulement si besoin (Hono, interface)
  const db = openDatabase(config.database);
  try {
    await startServer({ db, config, port, idleMin: IDLE_MIN, hosted: true });
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Ouvre une adresse dans le navigateur par défaut, sans passer par un shell. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const [command, args] =
    platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => undefined);
  child.unref();
}

const DEPENDENCIES: Dependencies = {
  probe,
  node: () => nodeExecutable(),
  launchDetached,
  launchHosted,
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  openBrowser,
};

export async function openDashboard(
  config: Config,
  options: { open?: boolean } = {},
  dep: Dependencies = DEPENDENCIES,
): Promise<ResultTable> {
  const folder = config.dataDir;
  const end = (port: number, already: boolean, mode: ResultTable['mode']): ResultTable => {
    const url = `http://localhost:${port}/`;
    if (options.open) dep.openBrowser(url);
    const stop = mode === 'existing' ? null : IDLE_MIN;
    return {
      ok: true,
      url,
      already_launched: already,
      mode,
      stop_auto_min: stop,
      browser_open: Boolean(options.open),
      to_tell:
        tm(already ? 'dashboard.toTell.alreadyLaunched' : 'dashboard.toTell.started', { url }) +
        tm(options.open ? 'dashboard.toTell.open' : 'dashboard.toTell.link') +
        (mode === 'hosted'
          ? tm('dashboard.toTell.hosted', { minutes: IDLE_MIN })
          : mode === 'detached'
            ? tm('dashboard.toTell.detached', { minutes: IDLE_MIN })
            : ''),
    };
  };

  // Premier port libre, ou celui où tourne déjà le tableau de bord de cet espace.
  let free: number | null = null;
  for (let port = config.port; port < config.port + PORTS_TRIED; port++) {
    const s = await dep.probe(port);
    if (s && s.service === 'vigie-emploi' && s.folder && sameFolder(s.folder, folder)) return end(port, true, 'existing');
    if (!s && free === null) free = port;
  }
  if (free === null) {
    throw new Error(
      tm('dashboard.openDashboard', { port: String(config.port), p2: String(config.port + PORTS_TRIED - 1) }),
    );
  }

  const node = dep.node();
  if (!node) {
    await dep.launchHosted(config, free);
    return end(free, false, 'hosted');
  }
  dep.launchDetached(node, config, free);
  for (let elapsed = 0; elapsed < PENDING_ONBOARDING_MS; elapsed += 250) {
    await dep.wait(250);
    const s = await dep.probe(free);
    if (s?.service === 'vigie-emploi' && s.folder && sameFolder(s.folder, folder)) return end(free, false, 'detached');
  }
  throw new Error(
    tm('dashboard.openDashboard2', { free: String(free), p2: String(PENDING_ONBOARDING_MS / 1000), p3: String(slash(node)), p4: String(slash(folder)) }),
  );
}

export function saveToolDashboard(server: McpServer, state: StateMcp): void {
  server.registerTool(
    'open_dashboard',
    {
      title: tm('dashboard.open_dashboard.title'),
      description: tm('dashboard.open_dashboard.description', { IDLE_MIN: String(IDLE_MIN) }),
      inputSchema: {
        open: z
          .boolean()
          .optional()
          .describe(tm('dashboard.open_dashboard.inputSchema.open')),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    on(async ({ open }: { open?: boolean }) => {
      if (!state.db) throw new Error(messageNotInitialized(state));
      return openDashboard(state.config, { open });
    }),
  );
}
