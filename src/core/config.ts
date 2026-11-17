// Configuration resolution: data folder, port, exclusion lists.
// The code contains no personal data: everything specific to the user
// lives in their data folder or in an unversioned vigie-emploi.config.json.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLanguage, LANGUAGE_DEFAULT, LANGUAGE_REFERENCE, LANGUAGES, NAMES_LANGUAGES, type Language } from '../i18n/tool.ts';
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
  /** Language of the interface, of the CLI and of the generated tracker ("fr" or "en"; see languageOf for the default). */
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
/**
 * Environment variable VIGIE_EMPLOI_<name>.
 * An empty value, or one left as `${…}` (setting of a Claude Desktop extension left empty, not substituted),
 * counts as absent.
 */
export function variable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const useful = (v: string | undefined) => {
    const t = v?.trim();
    return t && !/^\$\{[^}]*\}$/.test(t) ? t : undefined;
  };
  return useful(env[`VIGIE_EMPLOI_${name}`]);
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

/**
 * Language of the system, for what no configuration decides (a new workspace, the help shown outside a workspace):
 * the first of LC_ALL, LC_MESSAGES, LANG that names a real locale ("C" and "POSIX" do not), otherwise the locale Node
 * reports. A locale in a language the application does not have gives English.
 */
export function systemLanguage(env: NodeJS.ProcessEnv = process.env, localeNode: string = Intl.DateTimeFormat().resolvedOptions().locale): Language {
  for (const locale of [env.LC_ALL, env.LC_MESSAGES, env.LANG, localeNode]) {
    const code = (locale ?? '')
      .trim()
      .split(/[_.@-]/)[0]
      .toLowerCase();
    if (!code || code === 'c' || code === 'posix') continue;
    return isLanguage(code) ? code : LANGUAGE_REFERENCE;
  }
  return LANGUAGE_REFERENCE;
}

/** This folder's config file. */
function folderConfig(folder: string): string[] {
  return [join(folder, NAME_FILE_CONFIG)];
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

/** Language of the configuration error messages: variable, otherwise file, if they are valid; otherwise the system's. */
function messageLanguage(env: NodeJS.ProcessEnv, raw: ConfigFile = {}): Language {
  const v = variable(env, 'LANGUAGE');
  const n = v === undefined ? undefined : normalizeLanguage(v);
  if (isLanguage(n)) return n;
  return isLanguage(raw.language) ? raw.language : systemLanguage(env);
}

/**
 * Language of the VIGIE_EMPLOI_LANGUAGE variable, otherwise of the file; a file that names none is a French workspace
 * (LANGUAGE_DEFAULT), and without a file it is the system's language. An unknown value is refused.
 */
function languageOf(env: NodeJS.ProcessEnv, raw: ConfigFile, file: string | null): Language {
  const input = variable(env, 'LANGUAGE');
  const v = (input === undefined ? undefined : normalizeLanguage(input)) ?? raw.language ?? (file ? LANGUAGE_DEFAULT : systemLanguage(env));
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
  const folder = dataForced ? resolve(cwd, dataForced) : raw.dataDir ? resolve(baseDir, raw.dataDir) : null;
  if (!folder) {
    throw new ErrorConfig('not-configured', tl(messageLanguage(env, raw), 'core.config.notConfigure', { file: NAME_FILE_CONFIG }));
  }
  const relative = (p: string | undefined, fallback: string) => (p ? (isAbsolute(p) ? p : join(folder, p)) : fallback);
  const databaseDefault = join(folder, 'data', 'vigie-emploi.sqlite');
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
 * otherwise VIGIE_EMPLOI_LANGUAGE's if it is valid, otherwise the system's.
 */
export function languageConfigured(opts: OptionsConfig = {}): Language {
  try {
    return loadConfig(opts).language;
  } catch {
    const v = variable(opts.env ?? process.env, 'LANGUAGE');
    const n = v === undefined ? undefined : normalizeLanguage(v);
    return isLanguage(n) ? n : systemLanguage(opts.env ?? process.env);
  }
}
