// Writing of the "mail" section of vigie-emploi.config.json (the rest of the file is kept as it is).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Database } from '../db/database.ts';
import type { MailConfig } from '../core/config.ts';
import { accountOf, MailError } from './fetch.ts';
import { t } from '../i18n/index.ts';
import type { SecretBackend, SecretStore } from './secret.ts';

/** Replaces (or removes, with null) the mailbox settings in the configuration file. */
export function saveMailSettings(file: string, mail: MailConfig | null): void {
  const text = existsSync(file) ? readFileSync(file, 'utf8').replace(/^﻿/, '') : '{}';
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (mail) raw.mail = mail;
  else delete raw.mail;
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

export interface MailState {
  configured: boolean;
  user: string | null;
  host: string | null;
  port: number | null;
  folder: string | null;
  sinceDays: number | null;
  markSeen: boolean | null;
  /** A password is stored for this mailbox (or given by VIGIE_EMPLOI_MAIL_PASSWORD). */
  password: boolean;
  backend: SecretBackend;
  /** Last fetch (UTC ISO), null if never. */
  fetched_at: string | null;
}

/** Mailbox state for the CLI, the dashboard and the MCP server (never the password itself). */
export function mailState(db: Database, mail: MailConfig | null, store: SecretStore): MailState {
  const empty = { user: null, host: null, port: null, folder: null, sinceDays: null, markSeen: null, fetched_at: null };
  if (!mail) return { configured: false, ...empty, password: false, backend: store.backend() };
  let password = false;
  try {
    password = Boolean(store.get(accountOf(mail)));
  } catch {
    password = false;
  }
  const row = db.prepare('SELECT fetched_at FROM mailbox_state WHERE account = ? AND folder = ?').get(accountOf(mail), mail.folder) as
    | { fetched_at: string }
    | undefined;
  return {
    configured: true,
    user: mail.user,
    host: mail.host,
    port: mail.port,
    folder: mail.folder,
    sinceDays: mail.sinceDays,
    markSeen: mail.markSeen,
    password,
    backend: store.backend(),
    fetched_at: row?.fetched_at ?? null,
  };
}

/** Message for the user of a fetch error (kind → advice). */
export function messageMailError(e: unknown, mail: Pick<MailConfig, 'host' | 'folder'>): string {
  const err = e instanceof MailError ? e : new MailError('other', (e as Error).message);
  return t(`core.mail.error.${err.kind}` as const, { host: mail.host, folder: mail.folder, message: err.message });
}
