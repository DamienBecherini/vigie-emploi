// What every command runs with: the configuration and database chosen by --data / --config, the shape of a
// command, and the not-found error of a command.
import { loadConfig, type Config } from '../core/config.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { AppError } from '../core/errors.ts';

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
