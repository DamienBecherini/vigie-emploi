// Résolution de la configuration : dossier de données, port, listes d'exclusion.
// Le code ne contient aucune donnée personnelle : tout ce qui est propre à l'utilisateur
// vit dans son dossier de données ou dans un vigie-emploi.config.json non versionné.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLanguage, LANGUAGE_DEFAULT, LANGUAGES, NAMES_LANGUAGES, type Language } from '../i18n/tool.ts';
import { tl } from '../i18n/index.ts';

export interface Config {
  /** Dossier de données de l'utilisateur (contient data/, emails/, candidatures/…). */
  dataDir: string;
  /** Base SQLite : <dossierDonnees>/data/vigie-emploi.sqlite par défaut. */
  database: string;
  /** Boîte de réception des .eml : <dossierDonnees>/emails par défaut. */
  emails: string;
  port: number;
  /** Récupération du JSON-LD public (Hellowork, Free-Work). */
  fetchJsonLd: boolean;
  excludedTitles: RegExp[];
  rejectedEmployers: RegExp[];
  /**
   * Commande qui ouvre un terminal avec l'agent (boutons de l'interface) ; `{dossier}` et `{invite}` y sont
   * remplacés. null : Windows Terminal + Claude Code sous Windows, rien ailleurs.
   */
  terminal: string[] | null;
  /** Langue de l'interface, de la CLI et du suivi généré (« fr » par défaut, ou « en »). */
  language: Language;
  /** Fichier de configuration lu, s'il y en a un. */
  file: string | null;
}

interface ConfigFile {
  dataDir?: string;
  database?: string;
  emails?: string;
  port?: number;
  fetchJsonLd?: boolean;
  excludedTitles?: string[];
  rejectedEmployers?: string[];
  terminal?: string[];
  language?: string;
}

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NAME_FILE_CONFIG = 'vigie-emploi.config.json';
/** Anciens noms de l'application (postuler-juste, puis cap-emploi avant lui) : fichiers de config, bases et variables encore reconnus. */
export const OLD_NAMES = ['postuler-juste', 'cap-emploi'] as const;
export const OLD_FILES_CONFIG = OLD_NAMES.map((n) => `${n}.config.json`);
const PREFIXES_VARIABLES = ['VIGIE_EMPLOI_', 'POSTULER_JUSTE_', 'CAP_EMPLOI_'];

/**
 * Variable d'environnement VIGIE_EMPLOI_<nom>, ou ses anciens noms POSTULER_JUSTE_<nom> et CAP_EMPLOI_<nom>.
 * Une valeur vide, ou restée sous la forme `${…}` (réglage d'une extension Claude Desktop laissé vide, non substitué),
 * compte comme absente.
 */
export function variable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const useful = (v: string | undefined) => {
    const t = v?.trim();
    return t && !/^\$\{[^}]*\}$/.test(t) ? t : undefined;
  };
  for (const prefix of PREFIXES_VARIABLES) {
    const v = useful(env[`${prefix}${name}`]);
    if (v) return v;
  }
  return undefined;
}

/**
 * Noms de langue saisis à la main (réglage de l'extension Claude Desktop, --langue) ramenés au code : « English » → en.
 * Le nom de chaque langue dans sa propre langue (NOMS_LANGUES) est reconnu d'office, sans accent compris.
 */
const ALIAS_LANGUAGE: Record<string, string> = { french: 'fr', anglais: 'en' };
const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

/** Code de langue d'une valeur saisie (casse, accents et alias tolérés) ; la valeur en minuscules si elle n'est pas reconnue. */
export function normalizeLanguage(v: string): string {
  const b = withoutAccent(v.trim().toLowerCase());
  const byName = LANGUAGES.find((l) => withoutAccent(NAMES_LANGUAGES[l].toLowerCase()) === b);
  return byName ?? ALIAS_LANGUAGE[b] ?? b;
}

/** Le fichier de config de ce dossier, sous son nom actuel ou l'ancien. */
function configOfFolder(folder: string): string[] {
  return [NAME_FILE_CONFIG, ...OLD_FILES_CONFIG].map((f) => join(folder, f));
}

function readJson(path: string): ConfigFile {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text) as ConfigFile;
}

function compiler(patterns: string[] | undefined): RegExp[] {
  return (patterns ?? []).map((m) => new RegExp(m, 'i'));
}

/**
 * Erreur de configuration reconnaissable par son code (et non par le texte du message, qui dépend de la langue).
 * - `non-configure` : aucun dossier de données (le serveur MCP se rabat alors sur le dossier par défaut) ;
 * - `fichier-introuvable` : fichier de configuration imposé absent ;
 * - `langue-inconnue` : valeur de langue refusée.
 */
export class ErrorConfig extends Error {
  readonly code: 'not-configured' | 'file-not-found' | 'language-unknown';
  constructor(code: ErrorConfig['code'], message: string) {
    super(message);
    this.name = 'ErrorConfig';
    this.code = code;
  }
}

/** Langue des messages d'erreur de configuration : variable, sinon fichier, si elles sont valides ; sinon le français. */
function languageOfMessages(env: NodeJS.ProcessEnv, raw: ConfigFile = {}): Language {
  const v = variable(env, 'LANGUAGE');
  const n = v === undefined ? undefined : normalizeLanguage(v);
  if (isLanguage(n)) return n;
  return isLanguage(raw.language) ? raw.language : LANGUAGE_DEFAULT;
}

/** Langue de la variable VIGIE_EMPLOI_LANGUAGE, sinon du fichier, sinon le français ; une valeur inconnue est refusée. */
function languageOf(env: NodeJS.ProcessEnv, raw: ConfigFile, file: string | null): Language {
  const input = variable(env, 'LANGUAGE');
  const v = (input === undefined ? undefined : normalizeLanguage(input)) ?? raw.language ?? LANGUAGE_DEFAULT;
  if (!isLanguage(v)) {
    const language = languageOfMessages(env, raw);
    throw new ErrorConfig(
      'language-unknown',
      tl(language, 'core.config.language', { language: v, languages: LANGUAGES.join(tl(language, 'core.or')), file: file ?? NAME_FILE_CONFIG }),
    );
  }
  return v;
}

export interface OptionsConfig {
  /** Dossier de données imposé (option --data). */
  dataDir?: string;
  /** Fichier de configuration imposé (option --config). */
  fileConfig?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/**
 * Ordre de priorité :
 * 1. option --data, sinon variable VIGIE_EMPLOI_DATA, sinon "dossierDonnees" du fichier de config ;
 * 2. fichier de config : --config, VIGIE_EMPLOI_CONFIG, ./vigie-emploi.config.json, <data>/vigie-emploi.config.json,
 *    puis celui à la racine de l'application.
 * Les anciens noms (POSTULER_JUSTE_* et CAP_EMPLOI_*, postuler-juste.config.json et cap-emploi.config.json, leurs bases
 * data/postuler-juste.sqlite et data/cap-emploi.sqlite) restent reconnus.
 */
export function loadConfig(opts: OptionsConfig = {}): Config {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const candidates: string[] = [];
  if (opts.fileConfig) candidates.push(resolve(cwd, opts.fileConfig));
  const configEnv = variable(env, 'CONFIG');
  if (configEnv) candidates.push(resolve(cwd, configEnv));
  candidates.push(...configOfFolder(cwd));
  const dataForced = opts.dataDir ?? variable(env, 'DATA');
  if (dataForced) candidates.push(...configOfFolder(resolve(cwd, dataForced)));
  candidates.push(...configOfFolder(APP_ROOT));

  let file: string | null = null;
  let raw: ConfigFile = {};
  if (opts.fileConfig && !existsSync(candidates[0])) {
    throw new ErrorConfig('file-not-found', tl(languageOfMessages(env), 'core.config.notFound', { path: candidates[0] }));
  }
  for (const c of candidates) {
    if (existsSync(c)) {
      file = c;
      raw = readJson(c);
      break;
    }
  }
  const baseDir = file ? dirname(file) : cwd;
  const folder = dataForced
    ? resolve(cwd, dataForced)
    : raw.dataDir
      ? resolve(baseDir, raw.dataDir)
      : null;
  if (!folder) {
    throw new ErrorConfig('not-configured', tl(languageOfMessages(env, raw), 'core.config.notConfigure', { file: NAME_FILE_CONFIG }));
  }
  const relative = (p: string | undefined, fallback: string) => (p ? (isAbsolute(p) ? p : join(folder, p)) : fallback);
  // Base par défaut : data/vigie-emploi.sqlite, ou la première ancienne base existante (postuler-juste, cap-emploi)
  // tant que la nouvelle n'existe pas.
  const databaseNew = join(folder, 'data', 'vigie-emploi.sqlite');
  const databaseOld = OLD_NAMES.map((n) => join(folder, 'data', `${n}.sqlite`)).find((b) => existsSync(b));
  const databaseDefault = !existsSync(databaseNew) && databaseOld ? databaseOld : databaseNew;
  return {
    dataDir: folder,
    database: relative(variable(env, 'DATABASE') ?? raw.database, databaseDefault),
    emails: relative(raw.emails, join(folder, 'emails')),
    port: Number(variable(env, 'PORT') ?? raw.port ?? 4410),
    fetchJsonLd: raw.fetchJsonLd ?? true,
    excludedTitles: compiler(raw.excludedTitles),
    rejectedEmployers: compiler(raw.rejectedEmployers),
    terminal: Array.isArray(raw.terminal) && raw.terminal.length ? raw.terminal.map(String) : null,
    language: languageOf(env, raw, file),
    file,
  };
}

/**
 * Langue configurée, sans jamais échouer (aide et erreurs de la CLI) : celle de la configuration si elle se charge,
 * sinon celle de VIGIE_EMPLOI_LANGUAGE si elle est valide, sinon le français.
 */
export function languageConfigured(opts: OptionsConfig = {}): Language {
  try {
    return loadConfig(opts).language;
  } catch {
    const v = variable(opts.env ?? process.env, 'LANGUAGE');
    const n = v === undefined ? undefined : normalizeLanguage(v);
    return isLanguage(n) ? n : LANGUAGE_DEFAULT;
  }
}
