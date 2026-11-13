// Notifications poussées à l'interface (Server-Sent Events) : la base ou la boîte de réception a changé.
// La base est modifiée par d'autres processus (CLI, serveur MCP de l'agent, git) : le serveur surveille
// le fichier et ne prévient que si les données ont vraiment changé (PRAGMA data_version), sans interroger
// la base à intervalle régulier. Ses propres écritures (API) sont signalées directement par le serveur.
import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Database } from '../db/database.ts';
import { countEmails } from './work.ts';

export type Notification = { type: 'database' } | { type: 'emails'; number: number };

export class Broadcast {
  private readonly subscribers = new Set<(n: Notification) => void>();

  subscribe(f: (n: Notification) => void): () => void {
    this.subscribers.add(f);
    return () => this.subscribers.delete(f);
  }

  emit(n: Notification): void {
    for (const f of this.subscribers) {
      try {
        f(n);
      } catch {
        /* un abonné défaillant (connexion fermée) ne bloque pas les autres */
      }
    }
  }

  get numberSubscribers(): number {
    return this.subscribers.size;
  }
}

/** Version des données vue par cette connexion : change quand une AUTRE connexion valide une écriture. */
export function versionData(db: Database): number {
  return (db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
}

/** Appelle f au plus une fois par rafale d'appels espacés de moins de delaiMs. */
export function group(f: () => void, timeoutMs: number): { trigger: () => void; stop: () => void } {
  let timer: NodeJS.Timeout | null = null;
  return {
    trigger: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        f();
      }, timeoutMs);
    },
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export interface OptionsWatcher {
  db: Database;
  broadcast: Broadcast;
  /** Fichier SQLite (son dossier est surveillé : la base et son journal). */
  database: string;
  /** Boîte de réception des .eml. */
  emails: string;
  timeoutMs?: number;
}

/** Surveille la base et la boîte de réception ; renvoie la fonction d'arrêt. */
export function watchChanges(o: OptionsWatcher): () => void {
  const timeout = o.timeoutMs ?? 300;
  const observers: FSWatcher[] = [];
  const stops: (() => void)[] = [];

  let version = versionData(o.db);
  const checkDatabase = group(() => {
    const v = versionData(o.db);
    if (v === version) return;
    version = v;
    o.broadcast.emit({ type: 'database' });
  }, timeout);
  stops.push(checkDatabase.stop);
  const nameDatabase = basename(o.database);
  const onDatabase = watch(dirname(o.database), (_e, name) => {
    if (!name || String(name).startsWith(nameDatabase)) checkDatabase.trigger();
  });
  onDatabase.on('error', () => {});
  observers.push(onDatabase);

  let number = countEmails(o.emails);
  const checkEmails = group(() => {
    const n = countEmails(o.emails);
    if (n === number) return;
    number = n;
    o.broadcast.emit({ type: 'emails', number: n });
  }, timeout);
  stops.push(checkEmails.stop);
  try {
    const onEmails = watch(o.emails, () => checkEmails.trigger());
    onEmails.on('error', () => {});
    observers.push(onEmails);
  } catch {
    /* boîte de réception absente : rien à surveiller */
  }

  return () => {
    for (const a of stops) a();
    for (const w of observers) w.close();
  };
}
