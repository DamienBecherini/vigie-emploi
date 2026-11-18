// Notifications pushed to the interface (Server-Sent Events): the database or the inbox has changed.
// The database is modified by other processes (CLI, the agent's MCP server, git): the server watches
// the file and only notifies when the data really changed (PRAGMA data_version), without polling
// the database. Its own writes (API) are reported directly by the server.
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
        /* a failing subscriber (connection closed) does not block the others */
      }
    }
  }

  get numberSubscribers(): number {
    return this.subscribers.size;
  }
}

/** Data version seen by this connection: changes when ANOTHER connection commits a write. */
export function versionData(db: Database): number {
  return (db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
}

/** Calls f at most once per burst of calls spaced less than delayMs apart. */
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
  /** SQLite file (its folder is watched: the database and its journal). */
  database: string;
  /** Inbox of the .eml files. */
  emails: string;
  timeoutMs?: number;
}

/** Watches the database and the inbox; returns the stop function. */
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
    /* no inbox: nothing to watch */
  }

  return () => {
    for (const a of stops) a();
    for (const w of observers) w.close();
  };
}
