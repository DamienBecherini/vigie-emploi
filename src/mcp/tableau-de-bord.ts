// Outil MCP ouvrir_tableau_de_bord : le tableau de bord web sans terminal (client MCP seul, comme Claude Desktop).
// 1. Un tableau de bord répond déjà sur le port de l'espace (/api/sante, même dossier) : on renvoie son adresse.
// 2. Sinon on le démarre dans un processus node séparé et détaché (`postuler-juste serve --inactivite 60`) : il survit
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
import { ouvrirBase } from '../db/base.ts';
import { BINAIRE } from '../init/init.ts';
import { messageNonInitialise, type EtatMcp } from './etat.ts';
import { sur } from './resultats.ts';
import { bi } from './textes.ts';

/** Arrêt automatique du tableau de bord lancé par l'IA, en minutes sans activité. */
export const INACTIVITE_MIN = 60;
/** Ports essayés après celui de l'espace. */
const PORTS_ESSAYES = 10;
const ATTENTE_DEMARRAGE_MS = 15_000;

const oblique = (p: string) => p.replace(/\\/g, '/');
const memeDossier = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

/** Réponse de /api/sante : null si rien ne répond ; { service: null } si autre chose qu'un tableau de bord occupe le port. */
export type Sante = { service: string | null; dossier?: string } | null;

export async function sonder(port: number, delaiMs = 1500): Promise<Sante> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/sante`, { signal: AbortSignal.timeout(delaiMs) });
    const j = (await r.json().catch(() => null)) as { service?: string; dossier?: string } | null;
    return j?.service ? { service: j.service, dossier: j.dossier } : { service: null };
  } catch (e) {
    // Connexion refusée : port libre. Délai dépassé ou réponse illisible : port occupé par autre chose.
    const code = (e as { cause?: { code?: string } }).cause?.code;
    return code === 'ECONNREFUSED' ? null : { service: null };
  }
}

export type ModeLancement = 'detache' | 'heberge';

export interface Dependances {
  sonder: (port: number) => Promise<Sante>;
  /** Node pour un processus séparé, ou null (démarrage dans le processus du serveur MCP). */
  node: () => string | null;
  /** Lance le processus détaché ; renvoie son pid (tests). */
  lancerDetache: (node: string, config: Config, port: number) => number | undefined;
  lancerHeberge: (config: Config, port: number) => Promise<void>;
  attendre: (ms: number) => Promise<void>;
  ouvrirNavigateur: (url: string) => void;
}

export interface ResultatTableau {
  ok: true;
  url: string;
  deja_lance: boolean;
  mode: ModeLancement | 'existant';
  arret_auto_min: number | null;
  navigateur_ouvert: boolean;
  a_dire: string;
}

export function lancerDetache(node: string, config: Config, port: number): number | undefined {
  const args = [BINAIRE, 'serve', '--data', config.dossierDonnees, '--port', String(port), '--inactivite', String(INACTIVITE_MIN)];
  const enfant = spawn(node, args, { cwd: config.dossierDonnees, detached: true, stdio: 'ignore', windowsHide: true });
  enfant.on('error', () => undefined); // l'échec se voit à l'attente de /api/sante
  enfant.unref();
  return enfant.pid;
}

async function lancerHeberge(config: Config, port: number): Promise<void> {
  // Connexion à la base propre au tableau de bord : le serveur MCP peut fermer la sienne en changeant d'espace.
  const { demarrerServeur } = await import('../api/serveur.ts'); // chargé seulement si besoin (Hono, interface)
  const db = ouvrirBase(config.base);
  try {
    await demarrerServeur({ db, config, port, inactiviteMin: INACTIVITE_MIN, heberge: true });
  } catch (e) {
    db.close();
    throw e;
  }
}

/** Ouvre une adresse dans le navigateur par défaut, sans passer par un shell. */
export function ouvrirNavigateur(url: string, plateforme: NodeJS.Platform = process.platform): void {
  const [commande, args] =
    plateforme === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : plateforme === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const enfant = spawn(commande, args, { detached: true, stdio: 'ignore', windowsHide: true });
  enfant.on('error', () => undefined);
  enfant.unref();
}

const DEPENDANCES: Dependances = {
  sonder,
  node: () => nodeExecutable(),
  lancerDetache,
  lancerHeberge,
  attendre: (ms) => new Promise((r) => setTimeout(r, ms)),
  ouvrirNavigateur,
};

export async function ouvrirTableauDeBord(
  config: Config,
  options: { ouvrir?: boolean } = {},
  dep: Dependances = DEPENDANCES,
): Promise<ResultatTableau> {
  const dossier = config.dossierDonnees;
  const fin = (port: number, deja: boolean, mode: ResultatTableau['mode']): ResultatTableau => {
    const url = `http://localhost:${port}/`;
    if (options.ouvrir) dep.ouvrirNavigateur(url);
    const arret = mode === 'existant' ? null : INACTIVITE_MIN;
    return {
      ok: true,
      url,
      deja_lance: deja,
      mode,
      arret_auto_min: arret,
      navigateur_ouvert: Boolean(options.ouvrir),
      a_dire: bi({
        fr:
          (deja ? `Le tableau de bord tourne déjà : ${url}` : `Tableau de bord démarré : ${url}`) +
          (options.ouvrir ? ' (ouvert dans le navigateur par défaut).' : ' (lien à cliquer, ou proposer de l’ouvrir : ouvrir: true).') +
          (mode === 'heberge'
            ? ` Il reste disponible tant que l'application de l'IA garde le serveur ouvert, et s'arrête après ${INACTIVITE_MIN} minutes sans activité.`
            : mode === 'detache'
              ? ` Il s'arrête seul après ${INACTIVITE_MIN} minutes sans activité ; rappeler cet outil le relance.`
              : ''),
        en:
          (deja ? `The dashboard is already running: ${url}` : `Dashboard started: ${url}`) +
          (options.ouvrir ? ' (opened in the default browser).' : ' (link to click, or offer to open it: ouvrir: true).') +
          (mode === 'heberge'
            ? ` It stays available as long as the AI application keeps the server open, and stops after ${INACTIVITE_MIN} minutes without activity.`
            : mode === 'detache'
              ? ` It stops by itself after ${INACTIVITE_MIN} minutes without activity; calling this tool again restarts it.`
              : ''),
      }),
    };
  };

  // Premier port libre, ou celui où tourne déjà le tableau de bord de cet espace.
  let libre: number | null = null;
  for (let port = config.port; port < config.port + PORTS_ESSAYES; port++) {
    const s = await dep.sonder(port);
    if (s && s.service === 'postuler-juste' && s.dossier && memeDossier(s.dossier, dossier)) return fin(port, true, 'existant');
    if (!s && libre === null) libre = port;
  }
  if (libre === null) {
    throw new Error(
      bi({
        fr: `Ports ${config.port} à ${config.port + PORTS_ESSAYES - 1} tous occupés : changer « port » dans postuler-juste.config.json de l'espace.`,
        en: `Ports ${config.port} to ${config.port + PORTS_ESSAYES - 1} are all in use: change "port" in the workspace's postuler-juste.config.json.`,
      }),
    );
  }

  const node = dep.node();
  if (!node) {
    await dep.lancerHeberge(config, libre);
    return fin(libre, false, 'heberge');
  }
  dep.lancerDetache(node, config, libre);
  for (let ecoule = 0; ecoule < ATTENTE_DEMARRAGE_MS; ecoule += 250) {
    await dep.attendre(250);
    const s = await dep.sonder(libre);
    if (s?.service === 'postuler-juste' && s.dossier && memeDossier(s.dossier, dossier)) return fin(libre, false, 'detache');
  }
  throw new Error(
    bi({
      fr:
        `Le tableau de bord ne répond pas sur le port ${libre} après ${ATTENTE_DEMARRAGE_MS / 1000} s (node : ${oblique(node)}). ` +
        `L'utilisateur peut le lancer lui-même dans un terminal : postuler-juste serve --data "${oblique(dossier)}".`,
      en:
        `The dashboard does not respond on port ${libre} after ${ATTENTE_DEMARRAGE_MS / 1000} s (node: ${oblique(node)}). ` +
        `The user can start it themselves in a terminal: postuler-juste serve --data "${oblique(dossier)}".`,
    }),
  );
}

export function enregistrerOutilTableauDeBord(serveur: McpServer, etat: EtatMcp): void {
  serveur.registerTool(
    'ouvrir_tableau_de_bord',
    {
      title: bi({ fr: 'Ouvrir le tableau de bord', en: 'Open the dashboard' }),
      description: bi({
        fr:
          "Démarre le tableau de bord web de l'espace (liste des offres, filtres, détail, réglage de la grille à la souris) s'il ne tourne " +
          `pas déjà, en arrière-plan, et renvoie son adresse locale (http://localhost:…). Il s'arrête seul après ${INACTIVITE_MIN} minutes ` +
          "sans activité. À proposer quand l'utilisateur veut parcourir ses offres ou régler sa grille lui-même, au lieu d'une commande " +
          "« serve » à taper. ouvrir: true l'ouvre aussi dans son navigateur par défaut (seulement s'il le demande ou l'accepte).",
        en:
          "Starts the workspace's web dashboard (job ad list, filters, details, tuning the grid with the mouse) in the background if it is " +
          `not already running, and returns its local address (http://localhost:…). It stops by itself after ${INACTIVITE_MIN} minutes ` +
          'without activity. Offer it when the user wants to browse their job ads or tune their grid themselves, instead of a "serve" ' +
          'command to type. ouvrir: true also opens it in their default browser (only if they ask for it or agree).',
      }),
      inputSchema: {
        ouvrir: z
          .boolean()
          .optional()
          .describe(bi({ fr: "true : ouvrir aussi l'adresse dans le navigateur par défaut", en: 'true: also open the address in the default browser' })),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    sur(async ({ ouvrir }: { ouvrir?: boolean }) => {
      if (!etat.db) throw new Error(messageNonInitialise(etat));
      return ouvrirTableauDeBord(etat.config, { ouvrir });
    }),
  );
}
