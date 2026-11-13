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
import { ouvrirBase } from '../db/base.ts';
import { BINAIRE } from '../init/init.ts';
import { messageNonInitialise, type EtatMcp } from './etat.ts';
import { sur } from './resultats.ts';
import { tm } from './textes.ts';

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
      a_dire:
        tm(deja ? 'tableau_de_bord.aDire.dejaLance' : 'tableau_de_bord.aDire.demarre', { url }) +
        tm(options.ouvrir ? 'tableau_de_bord.aDire.ouvert' : 'tableau_de_bord.aDire.lien') +
        (mode === 'heberge'
          ? tm('tableau_de_bord.aDire.heberge', { minutes: INACTIVITE_MIN })
          : mode === 'detache'
            ? tm('tableau_de_bord.aDire.detache', { minutes: INACTIVITE_MIN })
            : ''),
    };
  };

  // Premier port libre, ou celui où tourne déjà le tableau de bord de cet espace.
  let libre: number | null = null;
  for (let port = config.port; port < config.port + PORTS_ESSAYES; port++) {
    const s = await dep.sonder(port);
    if (s && s.service === 'vigie-emploi' && s.dossier && memeDossier(s.dossier, dossier)) return fin(port, true, 'existant');
    if (!s && libre === null) libre = port;
  }
  if (libre === null) {
    throw new Error(
      tm('tableau_de_bord.ouvrirTableauDeBord', { port: String(config.port), p2: String(config.port + PORTS_ESSAYES - 1) }),
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
    if (s?.service === 'vigie-emploi' && s.dossier && memeDossier(s.dossier, dossier)) return fin(libre, false, 'detache');
  }
  throw new Error(
    tm('tableau_de_bord.ouvrirTableauDeBord_2', { libre: String(libre), p2: String(ATTENTE_DEMARRAGE_MS / 1000), p3: String(oblique(node)), p4: String(oblique(dossier)) }),
  );
}

export function enregistrerOutilTableauDeBord(serveur: McpServer, etat: EtatMcp): void {
  serveur.registerTool(
    'ouvrir_tableau_de_bord',
    {
      title: tm('tableau_de_bord.ouvrir_tableau_de_bord.title'),
      description: tm('tableau_de_bord.ouvrir_tableau_de_bord.description', { INACTIVITE_MIN: String(INACTIVITE_MIN) }),
      inputSchema: {
        ouvrir: z
          .boolean()
          .optional()
          .describe(tm('tableau_de_bord.ouvrir_tableau_de_bord.inputSchema.ouvrir')),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    sur(async ({ ouvrir }: { ouvrir?: boolean }) => {
      if (!etat.db) throw new Error(messageNonInitialise(etat));
      return ouvrirTableauDeBord(etat.config, { ouvrir });
    }),
  );
}
