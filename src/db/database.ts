// Opening of the SQLite database (node:sqlite, built into Node 24) and versioned migrations.
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

/** Applies the migrations whose number is above PRAGMA user_version, each one in a transaction. */
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
      throw new Error(`Migration ${m.file} failed: ${(e as Error).message}`);
    }
  }
  return applied;
}

/** Opens (and creates if needed) the database, then updates it. ':memory:' for tests. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Runs fn in a transaction (BEGIN IMMEDIATE), rolled back on error. */
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
