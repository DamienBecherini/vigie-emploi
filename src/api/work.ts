// Travail en attente pour l'agent (e-mails à trier, offres en « go » à préparer) et lancement de l'agent
// dans un terminal. L'application n'appelle toujours aucun modèle : elle ouvre un terminal où l'utilisateur
// dialogue avec son agent (Claude Code par défaut), exactement comme s'il avait tapé la commande lui-même.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../db/database.ts';
import { LANGUAGE_DEFAULT, tl, type Language } from '../i18n/index.ts';

/** Actions lançables depuis l'interface, et l'invite passée à l'agent (commande du dossier de données). */
export const ACTIONS_AGENT = {
  'process-emails': '/traiter-emails',
  'prepare-go': '/preparer-go',
} as const;

export type ActionAgent = keyof typeof ACTIONS_AGENT;

export function isActionAgent(v: string): v is ActionAgent {
  return Object.hasOwn(ACTIONS_AGENT, v);
}

/** Nombre de .eml en attente dans la boîte de réception (0 si le dossier n'existe pas). */
export function countEmails(folder: string): number {
  try {
    return readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.eml')).length;
  } catch {
    return 0;
  }
}

export interface OfferToPrepare {
  id: number;
  title: string;
  company: string | null;
}

/** Offres en « go » dont le dossier de candidature n'existe pas encore. */
export function goToPrepare(db: Database, dataDir: string): OfferToPrepare[] {
  const lines = db
    .prepare(
      `SELECT o.id, o.title, o.company, c.folder
         FROM offers o LEFT JOIN applications c ON c.offer_id = o.id
        WHERE o.status = 'go'
        ORDER BY o.id`,
    )
    .all() as { id: number; title: string; company: string | null; folder: string | null }[];
  return lines
    .filter((l) => !l.folder || !existsSync(join(dataDir, l.folder)))
    .map(({ id, title, company }) => ({ id, title, company }));
}

export interface StateWork {
  emails: number;
  go_to_prepare: OfferToPrepare[];
}

export function stateWork(db: Database, o: { dataDir: string; emails: string }): StateWork {
  return { emails: countEmails(o.emails), go_to_prepare: goToPrepare(db, o.dataDir) };
}

/** Lance l'agent pour une action ; se résout quand le terminal est ouvert. */
export type Launcher = (action: ActionAgent, dataDir: string) => Promise<void>;

/**
 * Commande du terminal : `{dossier}` et `{invite}` y sont remplacés. Par défaut sous Windows :
 * Windows Terminal ouvert dans le dossier de données, avec Claude Code et l'invite de l'action.
 */
export const TERMINAL_WINDOWS = ['wt.exe', '-d', '{folder}', 'claude', '{prompt}'];

export function commandTerminal(scaffold: string[], dataDir: string, action: ActionAgent): string[] {
  return scaffold.map((p) => p.replaceAll('{folder}', dataDir).replaceAll('{prompt}', ACTIONS_AGENT[action]));
}

/**
 * Environnement du terminal lancé : celui du serveur, sans les marqueurs de session de Claude Code
 * (CLAUDECODE, CLAUDE_CODE_*). Si le serveur a été démarré, directement ou non, depuis une session Claude,
 * ces variables feraient croire au nouvel agent qu'il en est une sous-session (conversation non enregistrée).
 */
export function environmentClean(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^CLAUDECODE$|^CLAUDE_CODE_/i.test(k)));
}

export function launcherTerminal(
  scaffold: string[] | null | undefined,
  platform: NodeJS.Platform = process.platform,
  language: Language = LANGUAGE_DEFAULT,
): Launcher {
  const chosen = scaffold ?? (platform === 'win32' ? TERMINAL_WINDOWS : null);
  return (action, dataDir) => {
    if (!chosen || !chosen.length) {
      return Promise.reject(
        new Error(
          tl(language, 'api.withoutTerminal', { prompt: ACTIONS_AGENT[action], folder: dataDir }),
        ),
      );
    }
    const [program, ...args] = commandTerminal(chosen, dataDir, action);
    return new Promise((resolve, reject) => {
      const p = spawn(program, args, {
        cwd: dataDir,
        env: environmentClean(),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      p.once('error', (e) => reject(new Error(tl(language, 'api.terminalImpossible', { program, message: e.message }))));
      p.once('spawn', () => {
        p.unref();
        resolve();
      });
    });
  };
}
