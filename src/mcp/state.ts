// Espace de travail du serveur MCP : dossier de données, base ouverte ou non.
// Le serveur démarre toujours, même sans espace (cas d'un client comme Claude Desktop lancé sans configuration) :
// les outils de données répondent alors « espace non initialisé » jusqu'à l'appel d'initialiser_espace.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig, ErrorConfig, APP_ROOT, type Config, type OptionsConfig } from '../core/config.ts';
import { openDatabase, type Database } from '../db/database.ts';
import { defineLanguage } from '../i18n/index.ts';
import { tm } from './texts.ts';

/** Dossier de données quand rien n'est configuré (ni --data, ni VIGIE_EMPLOI_DATA, ni fichier de config). */
export function folderByDefault(): string {
  return join(homedir(), 'ma-recherche');
}

export interface StateMcp {
  config: Config;
  /** Base ouverte, ou null tant que l'espace n'existe pas. */
  db: Database | null;
  /** true si le dossier est le dossier par défaut, faute de configuration. */
  byDefault: boolean;
  options: OptionsConfig;
}

const slash = (p: string) => p.replace(/\\/g, '/');

/** Un espace est utilisable s'il existe et n'est pas vide (les anciens dossiers de données n'ont pas tous AGENTS.md). */
export function workspaceExists(folder: string): boolean {
  return existsSync(folder) && statSync(folder).isDirectory() && readdirSync(folder).length > 0;
}

/** Le dossier de l'application n'est jamais un espace de travail (cas d'un dépôt cloné à l'emplacement par défaut). */
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

export function messageNotInitialized(state: StateMcp): string {
  const d = slash(state.config.dataDir);
  if (isApplication(state.config.dataDir)) {
    return tm('state.messageNotInitialized', { d: String(d) });
  }
  return tm('state.messageNotInitialized2', { d: String(d) });
}

/** Bascule le serveur sur un espace (après initialiser_espace) : relit sa configuration et ouvre sa base. */
export function toggle(state: StateMcp, folder: string): void {
  const config = loadConfig({ ...state.options, dataDir: folder, cwd: folder, fileConfig: undefined });
  const db = openDatabase(config.database);
  state.db?.close();
  state.config = config;
  state.db = db;
  // Messages et résultats dans la langue de l'espace ouvert (les descriptions des outils, déjà publiées, ne changent pas).
  defineLanguage(config.language);
}
