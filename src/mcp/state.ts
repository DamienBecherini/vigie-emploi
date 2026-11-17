// Workspace of the MCP server: data folder, database open or not.
// The server always starts, even without a workspace (case of a client like Claude Desktop launched without configuration):
// the data tools then answer "workspace not initialized" until initialize_workspace is called.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, ErrorConfig, APP_ROOT, type Config, type OptionsConfig } from '../core/config.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { defineLanguage } from '../i18n/index.ts';
import { tm } from './texts.ts';

/** Data folder when nothing is configured (neither --data, nor VIGIE_EMPLOI_DATA, nor a config file). */
export function folderByDefault(): string {
  return join(homedir(), 'vigie-emploi');
}

export interface StateMcp {
  config: Config;
  /** Open database, or null as long as the workspace does not exist. */
  db: Database | null;
  /** true if the folder is the default folder, for lack of configuration. */
  byDefault: boolean;
  options: OptionsConfig;
}

const slash = (p: string) => p.replace(/\\/g, '/');

/** A workspace is usable if it exists and is not empty (older data folders do not all have AGENTS.md). */
export function workspaceExists(folder: string): boolean {
  return existsSync(folder) && statSync(folder).isDirectory() && readdirSync(folder).length > 0;
}

/** The application's folder is never a workspace (case of a repository cloned at the default location). */
function isApplication(folder: string): boolean {
  return resolve(folder).toLowerCase() === resolve(APP_ROOT).toLowerCase();
}

export function openState(options: OptionsConfig = {}): StateMcp {
  let config: Config;
  let byDefault = false;
  try {
    config = loadConfig(options);
  } catch (e) {
    if (!(e instanceof ErrorConfig && e.code === 'not-configured')) throw e;
    config = loadConfig({ ...options, dataDir: folderByDefault() });
    byDefault = true;
  }
  const ready = workspaceExists(config.dataDir) && !isApplication(config.dataDir);
  return { config, db: ready ? openDatabase(config.database) : null, byDefault, options };
}

export function notInitializedMessage(state: StateMcp): string {
  const d = slash(state.config.dataDir);
  if (isApplication(state.config.dataDir)) {
    return tm('state.notInitializedMessage', { d: String(d) });
  }
  return tm('state.messageNotInitialized2', { d: String(d) });
}

/** Switches the server to a workspace (after initialize_workspace): reads its configuration again and opens its database. */
export function toggle(state: StateMcp, folder: string): void {
  const config = loadConfig({ ...state.options, dataDir: folder, cwd: folder, fileConfig: undefined });
  const db = openDatabase(config.database);
  state.db?.close();
  state.config = config;
  state.db = db;
  // Messages and results in the language of the open workspace (the tool descriptions, already published, do not change).
  defineLanguage(config.language);
}
