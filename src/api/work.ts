// Pending work for the agent (e-mails to sort, offers in "go" to prepare) and launch of the agent
// in a terminal. The application still calls no model: it opens a terminal where the user
// talks with their agent (Claude Code by default), exactly as if they had typed the command themselves.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../db/database.ts';
import { LANGUAGE_DEFAULT, tl, type Language } from '../i18n/index.ts';

/** Actions that can be launched from the interface, and the prompt passed to the agent (command of the data folder). */
export const ACTIONS_AGENT = {
  'process-emails': '/traiter-emails',
  'prepare-go': '/preparer-go',
} as const;

export type ActionAgent = keyof typeof ACTIONS_AGENT;

export function isActionAgent(v: string): v is ActionAgent {
  return Object.hasOwn(ACTIONS_AGENT, v);
}

/** Number of .eml files waiting in the inbox (0 if the folder does not exist). */
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

/** Offers in "go" whose application folder does not exist yet. */
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

/** Launches the agent for an action; resolves when the terminal is open. */
export type Launcher = (action: ActionAgent, dataDir: string) => Promise<void>;

/**
 * Terminal command: `{folder}` and `{prompt}` are replaced in it. By default on Windows:
 * Windows Terminal opened in the data folder, with Claude Code and the action's prompt.
 */
export const TERMINAL_WINDOWS = ['wt.exe', '-d', '{folder}', 'claude', '{prompt}'];

export function commandTerminal(scaffold: string[], dataDir: string, action: ActionAgent): string[] {
  return scaffold.map((p) => p.replaceAll('{folder}', dataDir).replaceAll('{prompt}', ACTIONS_AGENT[action]));
}

/**
 * Environment of the launched terminal: the server's, without the session markers of Claude Code
 * (CLAUDECODE, CLAUDE_CODE_*). If the server was started, directly or not, from a Claude session,
 * these variables would make the new agent believe it is a sub-session of it (conversation not saved).
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
    if (!chosen?.length) {
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
