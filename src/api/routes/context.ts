// What every group of API routes shares: database, configuration, language, messages, notifications,
// and the check that a job ad exists (answered 404 with the same body on every route).
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Config } from '../../core/config.ts';
import { offerById } from '../../core/offers.ts';
import type { Database } from '../../db/database.ts';
import type { KeyServer, Language } from '../../i18n/index.ts';
import type { Params } from '../../i18n/tool.ts';
import type { Broadcast } from '../broadcast.ts';
import type { Idle } from '../idle.ts';
import type { OpenerFolder } from '../open.ts';
import type { Launcher } from '../work.ts';

/** Configuration the API needs. */
export type ConfigApp = Pick<Config, 'dataDir'> & Partial<Pick<Config, 'emails' | 'terminal' | 'language' | 'file'>>;

export interface RoutesContext {
  db: Database;
  config: ConfigApp;
  /** Language of the messages sent back to the interface. */
  language: Language;
  /** Translated message in that language. */
  m: (key: KeyServer, params?: Params) => string;
  broadcast: Broadcast;
  idle: Idle;
  /** Folder of the e-mail files. */
  emails: string;
  launcher: Launcher;
  opener: OpenerFolder;
  isLocal: (c: Context) => boolean;
  /**
   * Stops the route with 404 { ok: false, error } when the job ad does not exist. Thrown as an HTTPException whose
   * response is ready, which app.onError sends as it is (no `code` field, unlike an AppError).
   */
  requireOffer: (c: Context, id: number) => void;
}

export function requireOfferWith(db: Database, m: RoutesContext['m']): RoutesContext['requireOffer'] {
  return (c, id) => {
    if (!offerById(db, id)) throw new HTTPException(404, { res: c.json({ ok: false, error: m('api.offerNotFound') }, 404) });
  };
}

/** Number from a URL parameter (a decimal comma is accepted); undefined when absent or unreadable. */
export function number(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
