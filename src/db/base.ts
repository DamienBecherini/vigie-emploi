// Ouverture de la base SQLite (node:sqlite, intégré à Node 24) et migrations versionnées.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RACINE_APP } from '../core/config.ts';

export type Base = DatabaseSync;

const DOSSIER_MIGRATIONS = join(RACINE_APP, 'migrations');

export function migrations(): { version: number; fichier: string; sql: string }[] {
  return readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 4)), fichier: f, sql: readFileSync(join(DOSSIER_MIGRATIONS, f), 'utf8') }));
}

/** Applique les migrations dont le numéro dépasse PRAGMA user_version, chacune dans une transaction. */
export function migrer(db: Base): number[] {
  const actuelle = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  const appliquees: number[] = [];
  for (const m of migrations()) {
    if (m.version <= actuelle) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
      appliquees.push(m.version);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.fichier} en échec : ${(e as Error).message}`);
    }
  }
  return appliquees;
}

/** Ouvre (et crée au besoin) la base, puis la met à jour. ':memory:' pour les tests. */
export function ouvrirBase(chemin: string): Base {
  if (chemin !== ':memory:') mkdirSync(dirname(chemin), { recursive: true });
  const db = new DatabaseSync(chemin);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrer(db);
  return db;
}

/** Exécute fn dans une transaction (BEGIN IMMEDIATE), annulée en cas d'erreur. */
export function transaction<T>(db: Base, fn: () => T): T {
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
