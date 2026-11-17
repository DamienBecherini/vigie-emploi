// IMAP fetch: the new messages of the alerts folder become .eml files in the inbox (emails/),
// then the usual ingestion reads them. The mailbox is only read (messages marked as read at most):
// nothing is deleted or moved. The last UID fetched is kept in the database, so a message is fetched once,
// even if the user marks it unread again; on the first fetch, only the last `sinceDays` days.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import type { Database } from '../db/database.ts';
import type { MailConfig } from '../core/config.ts';
import { now } from '../core/text.ts';
import type { SecretStore } from './secret.ts';

/** Most messages fetched in one go (the next ones come with the next fetch). */
export const MAX_PER_FETCH = 200;

export type MailErrorKind = 'no-password' | 'authentication' | 'folder' | 'connection' | 'other';

export class MailError extends Error {
  readonly kind: MailErrorKind;
  constructor(kind: MailErrorKind, message: string) {
    super(message);
    this.name = 'MailError';
    this.kind = kind;
  }
}

export interface MailFetch {
  account: string;
  folder: string;
  /** Messages written to the inbox. */
  fetched: number;
  files: string[];
  /** First fetch of this folder (or its UIDVALIDITY changed): limited to the last `sinceDays` days. */
  first: boolean;
  /** More messages wait on the server (limit of MAX_PER_FETCH reached). */
  more: boolean;
}

export interface OptionsFetch {
  password: string;
  now?: Date;
  max?: number;
  /** Test server: port, TLS… */
  client?: Partial<ImapFlowOptions>;
}

/** Key of a mailbox, for its state in the database and its password in the keychain. */
export function accountOf(mail: Pick<MailConfig, 'user' | 'host'>): string {
  return `${mail.user}|${mail.host}`;
}

/** Error of imapflow or of the network brought to a kind the user can act on. */
export function classify(e: unknown): MailError {
  if (e instanceof MailError) return e;
  const err = e as { authenticationFailed?: boolean; serverResponseCode?: string; code?: string; message?: string; responseText?: string };
  const text = err.responseText || err.message || String(e);
  if (err.authenticationFailed || err.serverResponseCode === 'AUTHENTICATIONFAILED') return new MailError('authentication', text);
  if (err.serverResponseCode === 'NONEXISTENT' || /mailbox doesn't exist|unknown mailbox|nonexistent|no such mailbox/i.test(text))
    return new MailError('folder', text);
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'CERT_HAS_EXPIRED', 'NoConnection'].includes(err.code ?? ''))
    return new MailError('connection', text);
  return new MailError('other', text);
}

/** Server on this machine (local bridge such as Proton Mail Bridge): no network to cross. */
export function isLoopback(host: string): boolean {
  return /^(localhost|127(\.\d{1,3}){3}|::1|\[::1\])$/i.test(host.trim());
}

function client(mail: MailConfig, o: OptionsFetch): ImapFlow {
  return new ImapFlow({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    // Without direct TLS, encryption must be started (STARTTLS) before the password is sent: a server that
    // does not offer it, or an attacker on the network who removes it, is refused instead of receiving the
    // password in clear. Only a server on this machine may do without it.
    ...(mail.secure ? {} : { doSTARTTLS: !isLoopback(mail.host) }),
    auth: { user: mail.user, pass: o.password },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    ...o.client,
  });
}

/** Connection and folder list (setup: check the password, choose the folder). */
export async function listFolders(mail: Omit<MailConfig, 'folder'> & { folder?: string }, o: OptionsFetch): Promise<string[]> {
  const c = client({ ...mail, folder: mail.folder ?? 'INBOX' }, o);
  try {
    await c.connect();
    const list = await c.list();
    return list.filter((b) => !b.flags.has('\\Noselect')).map((b) => b.path);
  } catch (e) {
    throw classify(e);
  } finally {
    await c.logout().catch(() => undefined);
  }
}

export async function fetchMail(db: Database, mail: MailConfig, inbox: string, o: OptionsFetch): Promise<MailFetch> {
  const account = accountOf(mail);
  const result: MailFetch = { account, folder: mail.folder, fetched: 0, files: [], first: false, more: false };
  const max = o.max ?? MAX_PER_FETCH;
  const c = client(mail, o);
  try {
    await c.connect();
    const lock = await c.getMailboxLock(mail.folder, { readOnly: !mail.markSeen });
    try {
      const box = c.mailbox;
      if (!box) throw new MailError('folder', mail.folder);
      const uidValidity = String(box.uidValidity);
      const state = db.prepare('SELECT uid_validity, last_uid FROM mailbox_state WHERE account = ? AND folder = ?').get(account, mail.folder) as
        | { uid_validity: string; last_uid: number }
        | undefined;
      result.first = !state || state.uid_validity !== uidValidity;
      let uids: number[];
      if (result.first) {
        const since = new Date((o.now ?? new Date()).getTime() - mail.sinceDays * 86400000);
        uids = box.exists ? ((await c.search({ since }, { uid: true })) || []) : [];
      } else {
        const after = state!.last_uid;
        uids = box.exists ? ((await c.search({ uid: `${after + 1}:*` }, { uid: true })) || []).filter((u) => u > after) : [];
      }
      uids.sort((a, b) => a - b);
      if (uids.length > max) {
        result.more = true;
        uids = uids.slice(0, max);
      }
      let last = result.first ? 0 : state!.last_uid;
      if (uids.length) {
        mkdirSync(inbox, { recursive: true });
        for await (const m of c.fetch(uids.join(','), { uid: true, source: true }, { uid: true })) {
          if (!m.source) continue;
          const name = `imap-${uidValidity}-${m.uid}.eml`;
          const tmp = join(inbox, `.${name}.tmp`);
          writeFileSync(tmp, m.source);
          renameSync(tmp, join(inbox, name));
          result.files.push(name);
          result.fetched++;
          if (m.uid > last) last = m.uid;
        }
        if (mail.markSeen) await c.messageFlagsAdd(uids.join(','), ['\\Seen'], { uid: true });
      }
      // Nothing recent on the first fetch: start after the messages already there.
      if (result.first && !uids.length && box.uidNext) last = Math.max(last, Number(box.uidNext) - 1);
      db.prepare(
        `INSERT INTO mailbox_state (account, folder, uid_validity, last_uid, fetched_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (account, folder) DO UPDATE SET uid_validity = excluded.uid_validity, last_uid = excluded.last_uid, fetched_at = excluded.fetched_at`,
      ).run(account, mail.folder, uidValidity, last, now());
    } finally {
      lock.release();
    }
  } catch (e) {
    throw classify(e);
  } finally {
    await c.logout().catch(() => undefined);
  }
  result.files.sort();
  return result;
}

/** Fetch with the configured mailbox and the password of the keychain. */
export async function fetchMailPerConfig(
  db: Database,
  config: { mail: MailConfig | null; emails: string },
  store: SecretStore,
  o: Omit<OptionsFetch, 'password'> = {},
): Promise<MailFetch | null> {
  if (!config.mail) return null;
  const password = store.get(accountOf(config.mail));
  if (!password) throw new MailError('no-password', accountOf(config.mail));
  return fetchMail(db, config.mail, config.emails, { ...o, password });
}
