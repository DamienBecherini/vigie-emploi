// Configuration resolution: data folder, port, exclusion lists.
// The code contains no personal data: everything specific to the user
// lives in their data folder or in an unversioned vigie-emploi.config.json.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLanguage, LANGUAGE_DEFAULT, LANGUAGES, NAMES_LANGUAGES, type Language } from '../i18n/tool.ts';
import { tl } from '../i18n/index.ts';

export interface Config {
  /** The user's data folder (contains data/, emails/, candidatures/…). */
  dataDir: string;
  /** SQLite database: <dataDir>/data/vigie-emploi.sqlite by default. */
  database: string;
  /** Inbox of the .eml files: <dataDir>/emails by default. */
  emails: string;
  port: number;
  /** Fetching of the public JSON-LD (Hellowork, Free-Work). */
  fetchJsonLd: boolean;
  excludedTitles: RegExp[];
  rejectedEmployers: RegExp[];
  /**
   * Command that opens a terminal with the agent (interface buttons); `{folder}` and `{prompt}` are
   * replaced in it. null: Windows Terminal + Claude Code on Windows, nothing elsewhere.
   */
  terminal: string[] | null;
  /** Language of the interface, of the CLI and of the generated tracker ("fr" by default, or "en"). */
  language: Language;
  /** Mailbox read over IMAP before each ingestion (null: e-mails dropped in emails/ by hand or by a mail client). */
  mail: MailConfig | null;
  /** Configuration file read, if there is one. */
  file: string | null;
}

/** IMAP mailbox; the password is not here (system keychain, see mail/secret.ts). */
export interface MailConfig {
  /** Login, usually the e-mail address. */
  user: string;
  host: string;
  port: number;
  /** TLS from the start (port 993); false: STARTTLS when the server offers it. */
  secure: boolean;
  /** Folder (or Gmail label) where a filter of the mailbox files the job alerts. */
  folder: string;
  /** First fetch: messages of the last N days only. */
  sinceDays: number;
  /** Mark the fetched messages as read in the mailbox. */
  markSeen: boolean;
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
  mail?: Partial<MailConfig>;
}

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NAME_FILE_CONFIG = 'vigie-emploi.config.json';
/** Former names of the application (postuler-juste, and cap-emploi before it): config files, databases and variables still recognized. */
export const OLD_NAMES = ['postuler-juste', 'cap-emploi'] as const;
export const OLD_FILES_CONFIG = OLD_NAMES.map((n) => `${n}.config.json`);
const PREFIXES_VARIABLES = ['VIGIE_EMPLOI_', 'POSTULER_JUSTE_', 'CAP_EMPLOI_'];

/**
 * Environment variable VIGIE_EMPLOI_<name>, or its former names POSTULER_JUSTE_<name> and CAP_EMPLOI_<name>.
 * An empty value, or one left as `${…}` (setting of a Claude Desktop extension left empty, not substituted),
 * counts as absent.
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
 * Language names typed by hand (setting of the Claude Desktop extension, --language) brought back to the code: "English" → en.
 * The name of each language in its own language (NAMES_LANGUAGES) is recognized as well, accents ignored.
 */
const ALIAS_LANGUAGE: Record<string, string> = { french: 'fr', anglais: 'en' };
const withoutAccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');

/** Language code of a typed value (case, accents and aliases tolerated); the lower-case value if it is not recognized. */
export function normalizeLanguage(v: string): string {
  const b = withoutAccent(v.trim().toLowerCase());
  const byName = LANGUAGES.find((l) => withoutAccent(NAMES_LANGUAGES[l].toLowerCase()) === b);
  return byName ?? ALIAS_LANGUAGE[b] ?? b;
}

/** This folder's config file, under its current name or the former ones. */
function folderConfig(folder: string): string[] {
  return [NAME_FILE_CONFIG, ...OLD_FILES_CONFIG].map((f) => join(folder, f));
}

function readJson(path: string): ConfigFile {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text) as ConfigFile;
}

/** Mailbox settings of the file; null when the address, server or folder is missing. */
export function mailOf(raw: Partial<MailConfig> | undefined): MailConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const user = typeof raw.user === 'string' ? raw.user.trim() : '';
  const host = typeof raw.host === 'string' ? raw.host.trim() : '';
  const folder = typeof raw.folder === 'string' ? raw.folder.trim() : '';
  if (!user || !host || !folder) return null;
  const secure = raw.secure !== false;
  return {
    user,
    host,
    port: Number.isInteger(raw.port) && raw.port! > 0 ? raw.port! : secure ? 993 : 143,
    secure,
    folder,
    sinceDays: Number.isInteger(raw.sinceDays) && raw.sinceDays! > 0 ? raw.sinceDays! : 14,
    markSeen: raw.markSeen !== false,
  };
}

/** Mailbox settings read again from the file (setup made by another process: dashboard, CLI). */
export function readMailSettings(file: string | null): MailConfig | null {
  if (!file || !existsSync(file)) return null;
  try {
    return mailOf(readJson(file).mail);
  } catch {
    return null;
  }
}

function compiler(patterns: string[] | undefined): RegExp[] {
  return (patterns ?? []).map((m) => new RegExp(m, 'i'));
}

/**
 * Configuration error recognizable by its code (and not by the text of the message, which depends on the language).
 * - `not-configured`: no data folder (the MCP server then falls back on the default folder);
 * - `file-not-found`: the requested configuration file is missing;
 * - `language-unknown`: language value refused.
 */
export class ErrorConfig extends Error {
  readonly code: 'not-configured' | 'file-not-found' | 'language-unknown';
  constructor(code: ErrorConfig['code'], message: string) {
    super(message);
    this.name = 'ErrorConfig';
    this.code = code;
  }
}

/** Language of the configuration error messages: variable, otherwise file, if they are valid; otherwise French. */
function messageLanguage(env: NodeJS.ProcessEnv, raw: ConfigFile = {}): Language {
  const v = variable(env, 'LANGUAGE');
  const n = v === undefined ? undefined : normalizeLanguage(v);
  if (isLanguage(n)) return n;
  return isLanguage(raw.language) ? raw.language : LANGUAGE_DEFAULT;
}

/** Language of the VIGIE_EMPLOI_LANGUAGE variable, otherwise of the file, otherwise French; an unknown value is refused. */
function languageOf(env: NodeJS.ProcessEnv, raw: ConfigFile, file: string | null): Language {
  const input = variable(env, 'LANGUAGE');
  const v = (input === undefined ? undefined : normalizeLanguage(input)) ?? raw.language ?? LANGUAGE_DEFAULT;
  if (!isLanguage(v)) {
    const language = messageLanguage(env, raw);
    throw new ErrorConfig(
      'language-unknown',
      tl(language, 'core.config.language', { language: v, languages: LANGUAGES.join(tl(language, 'core.or')), file: file ?? NAME_FILE_CONFIG }),
    );
  }
  return v;
}

export interface OptionsConfig {
  /** Forced data folder (--data option). */
  dataDir?: string;
  /** Forced configuration file (--config option). */
  fileConfig?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/**
 * Order of priority:
 * 1. --data option, otherwise the VIGIE_EMPLOI_DATA variable, otherwise "dataDir" of the config file;
 * 2. config file: --config, VIGIE_EMPLOI_CONFIG, ./vigie-emploi.config.json, <data>/vigie-emploi.config.json,
 *    then the one at the application's root.
 * The former names (POSTULER_JUSTE_* and CAP_EMPLOI_*, postuler-juste.config.json and cap-emploi.config.json, their databases
 * data/postuler-juste.sqlite and data/cap-emploi.sqlite) are still recognized.
 */
export function loadConfig(opts: OptionsConfig = {}): Config {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const candidates: string[] = [];
  if (opts.fileConfig) candidates.push(resolve(cwd, opts.fileConfig));
  const configEnv = variable(env, 'CONFIG');
  if (configEnv) candidates.push(resolve(cwd, configEnv));
  candidates.push(...folderConfig(cwd));
  const dataForced = opts.dataDir ?? variable(env, 'DATA');
  if (dataForced) candidates.push(...folderConfig(resolve(cwd, dataForced)));
  candidates.push(...folderConfig(APP_ROOT));

  let file: string | null = null;
  let raw: ConfigFile = {};
  if (opts.fileConfig && !existsSync(candidates[0])) {
    throw new ErrorConfig('file-not-found', tl(messageLanguage(env), 'core.config.notFound', { path: candidates[0] }));
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
    throw new ErrorConfig('not-configured', tl(messageLanguage(env, raw), 'core.config.notConfigure', { file: NAME_FILE_CONFIG }));
  }
  const relative = (p: string | undefined, fallback: string) => (p ? (isAbsolute(p) ? p : join(folder, p)) : fallback);
  // Default database: data/vigie-emploi.sqlite, or the first existing former database (postuler-juste, cap-emploi)
  // as long as the new one does not exist.
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
    mail: mailOf(raw.mail),
    file,
  };
}

/**
 * Configured language, without ever failing (CLI help and errors): the configuration's if it loads,
 * otherwise VIGIE_EMPLOI_LANGUAGE's if it is valid, otherwise French.
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
