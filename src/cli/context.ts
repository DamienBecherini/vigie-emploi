// What every command runs with: the configuration and database chosen by --data / --config, the shape of a
// command, and the errors that are the user's to read (not found, failure of a core call).
import { loadConfig, type Config } from '../core/config.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { AppError } from '../core/errors.ts';
import { error } from './options.ts';

/** A command: receives its arguments (after the command name), prints, throws on failure. */
export type Command = (args: string[]) => Promise<void> | void;

export interface Context {
  config: Config;
  db: Database;
}

/** Configuration (--data, --config) and its database. */
export function context(v: { data?: string; config?: string }): Context {
  const config = loadConfig({
    dataDir: v.data,
    fileConfig: v.config,
  });
  return { config, db: openDatabase(config.database) };
}

export function notFound(message: string): never {
  throw new AppError('not-found', message);
}

/** Runs a call whose failures are the user's to read: an error that is not an AppError yet becomes one (message alone, no stack). */
export function withoutError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof AppError) throw e;
    error((e as Error).message);
  }
}
