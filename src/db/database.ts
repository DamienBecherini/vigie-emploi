// Ouverture de la base SQLite (node:sqlite, intégré à Node 24) et migrations versionnées.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { APP_ROOT } from '../core/config.ts';

export type Database = DatabaseSync;

const FOLDER_MIGRATIONS = join(APP_ROOT, 'migrations');

export function migrations(): { version: number; file: string; sql: string }[] {
  return readdirSync(FOLDER_MIGRATIONS)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 4)), file: f, sql: readFileSync(join(FOLDER_MIGRATIONS, f), 'utf8') }));
}

/** Applique les migrations dont le numéro dépasse PRAGMA user_version, chacune dans une transaction. */
export function migrate(db: Database): number[] {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  const applied: number[] = [];
  for (const m of migrations()) {
    if (m.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
      applied.push(m.version);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.file} en échec : ${(e as Error).message}`);
    }
  }
  return applied;
}

/** Ouvre (et crée au besoin) la base, puis la met à jour. ':memory:' pour les tests. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Exécute fn dans une transaction (BEGIN IMMEDIATE), annulée en cas d'erreur. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
