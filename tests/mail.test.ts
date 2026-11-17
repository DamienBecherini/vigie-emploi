// IMAP fetch against a real IMAP server in memory (hoodiecrow), password storage, providers.
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImapFlow } from 'imapflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/db/database.ts';
import { mailOf, type MailConfig } from '../src/core/config.ts';
import { accountOf, fetchMail, listFolders, MailError } from '../src/mail/fetch.ts';
import { providerOf } from '../src/mail/providers.ts';
import { fileStore, secretStore, type SecretStore } from '../src/mail/secret.ts';
import { ingestPerConfig } from '../src/ingest/ingest.ts';
import { findOffer } from '../src/core/offers.ts';

const require = createRequire(import.meta.url);
const hoodiecrow = require('hoodiecrow-imap') as (o: object) => {
  listen(port: number, host: string, cb: () => void): void;
  close(cb?: () => void): void;
  server?: { address(): AddressInfo };
  address?: () => AddressInfo;
};

const NOW = new Date('2026-11-17T10:00:00Z');
const FOLDER = 'Alertes emploi';
const LINKEDIN = readFileSync(join(import.meta.dirname, 'fixtures', 'emails', 'linkedin.eml'), 'latin1');
const raw = (subject: string) => `From: alertes@example.test\r\nSubject: ${subject}\r\n\r\nrien`;

let server: ReturnType<typeof hoodiecrow>;
let port: number;
let db: Database;
let inbox: string;

async function start(messages: { raw: string; internaldate: string; flags?: string[] }[]) {
  server = hoodiecrow({
    plugins: ['ID', 'ENABLE', 'UNSELECT', 'UIDPLUS', 'MOVE'],
    storage: {
      INBOX: { messages: [{ raw: raw('autre'), internaldate: '16-Nov-2026 10:00:00 +0100' }] },
      '': { separator: '/', folders: { [FOLDER]: { messages } } },
    },
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.server ? server.server.address() : server.address!()).port;
}

const mail = (o: Partial<MailConfig> = {}): MailConfig => ({
  user: 'testuser',
  host: '127.0.0.1',
  port,
  secure: false,
  folder: FOLDER,
  sinceDays: 14,
  markSeen: true,
  ...o,
});
const opts = (password = 'testpass') => ({ password, now: NOW, client: { port, secure: false, doSTARTTLS: false } });

async function append(subject: string) {
  const c = new ImapFlow({ host: '127.0.0.1', port, secure: false, doSTARTTLS: false, auth: { user: 'testuser', pass: 'testpass' }, logger: false });
  await c.connect();
  await c.append(FOLDER, raw(subject), [], new Date('2026-11-17T09:00:00Z'));
  await c.logout();
}

async function seenFlags(): Promise<boolean[]> {
  const c = new ImapFlow({ host: '127.0.0.1', port, secure: false, doSTARTTLS: false, auth: { user: 'testuser', pass: 'testpass' }, logger: false });
  await c.connect();
  const lock = await c.getMailboxLock(FOLDER, { readOnly: true });
  const r: boolean[] = [];
  for await (const m of c.fetch('1:*', { uid: true, flags: true })) r.push(Boolean(m.flags?.has('\\Seen')));
  lock.release();
  await c.logout();
  return r;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  inbox = mkdtempSync(join(tmpdir(), 'vigie-imap-'));
});
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  rmSync(inbox, { recursive: true, force: true });
});

describe('IMAP fetch', () => {
  it('first fetch: last 14 days only, written as .eml, marked as read; then only the new ones', async () => {
    await start([
      { raw: raw('ancienne'), internaldate: '20-Oct-2026 10:00:00 +0200' },
      { raw: raw('recente 1'), internaldate: '10-Nov-2026 10:00:00 +0100' },
      { raw: raw('recente 2'), internaldate: '16-Nov-2026 10:00:00 +0100' },
    ]);
    const r = await fetchMail(db, mail(), inbox, opts());
    expect(r).toMatchObject({ fetched: 2, first: true, more: false, files: ['imap-1-2.eml', 'imap-1-3.eml'] });
    expect(readFileSync(join(inbox, 'imap-1-2.eml'), 'utf8')).toContain('Subject: recente 1');
    expect(await seenFlags()).toEqual([false, true, true]);

    expect((await fetchMail(db, mail(), inbox, opts())).fetched).toBe(0);
    await append('nouvelle');
    const r3 = await fetchMail(db, mail(), inbox, opts());
    expect(r3).toMatchObject({ fetched: 1, first: false, files: ['imap-1-4.eml'] });
    expect(readdirSync(inbox).sort()).toEqual(['imap-1-2.eml', 'imap-1-3.eml', 'imap-1-4.eml']);
  });

  it('first fetch with nothing recent: later messages only', async () => {
    await start([{ raw: raw('ancienne'), internaldate: '20-Oct-2026 10:00:00 +0200' }]);
    expect((await fetchMail(db, mail(), inbox, opts())).fetched).toBe(0);
    expect((await fetchMail(db, mail(), inbox, opts())).fetched).toBe(0);
    await append('nouvelle');
    expect((await fetchMail(db, mail(), inbox, opts())).files).toEqual(['imap-1-2.eml']);
  });

  it('markSeen false: the mailbox is opened read-only, flags unchanged', async () => {
    await start([{ raw: raw('recente'), internaldate: '16-Nov-2026 10:00:00 +0100' }]);
    expect((await fetchMail(db, mail({ markSeen: false }), inbox, opts())).fetched).toBe(1);
    expect(await seenFlags()).toEqual([false]);
  });

  it('limit per fetch: the rest comes next time', async () => {
    await start(
      ['a', 'b', 'c'].map((s) => ({ raw: raw(s), internaldate: '16-Nov-2026 10:00:00 +0100' })),
    );
    expect(await fetchMail(db, mail(), inbox, { ...opts(), max: 2 })).toMatchObject({ fetched: 2, more: true });
    expect(await fetchMail(db, mail(), inbox, { ...opts(), max: 2 })).toMatchObject({ fetched: 1, more: false, files: ['imap-1-3.eml'] });
  });

  it('errors brought to a kind: wrong password, missing folder', async () => {
    await start([]);
    await expect(fetchMail(db, mail(), inbox, opts('mauvais'))).rejects.toMatchObject({ kind: 'authentication' });
    await expect(fetchMail(db, mail({ folder: 'Inexistant' }), inbox, opts())).rejects.toMatchObject({ kind: 'folder' });
    expect(await listFolders(mail(), opts())).toEqual(['INBOX', FOLDER]);
  });

  it('ingestion: fetch, then offers in the database and e-mails deleted; error reported without blocking', async () => {
    await start([{ raw: LINKEDIN, internaldate: '16-Nov-2026 10:00:00 +0100' }]);
    const store: SecretStore = { backend: () => 'file', get: () => 'testpass', set() {}, remove() {} };
    const config = { emails: inbox, fetchJsonLd: false, excludedTitles: [], rejectedEmployers: [], mail: mail() };
    // The client options of the test server go through the configuration (port, no TLS).
    const r = await ingestPerConfig(db, config, { store, download: false });
    expect(r.mail).toMatchObject({ fetched: 1, folder: FOLDER });
    expect(r.added).toBe(3);
    expect(findOffer(db, 'linkedin', '4100000001')).toBeTruthy();
    expect(readdirSync(inbox)).toEqual([]);

    const bad: SecretStore = { ...store, get: () => null };
    const r2 = await ingestPerConfig(db, config, { store: bad, download: false });
    expect(r2.mail).toMatchObject({ error: 'no-password' });
    expect(r2.files).toBe(0);
  });
});

describe('mailbox settings and passwords', () => {
  it('providers found from the domain', () => {
    expect(providerOf('Jean.Dupont@GMAIL.com')).toMatchObject({ host: 'imap.gmail.com', auth: 'app-password' });
    expect(providerOf('a@orange.fr')).toMatchObject({ host: 'imap.orange.fr', auth: 'password' });
    expect(providerOf('a@hotmail.fr')?.auth).toBe('oauth');
    expect(providerOf('a@exemple.test')).toBeNull();
  });
  it('mail section: defaults, incomplete section ignored', () => {
    expect(mailOf({ user: 'a@b.fr', host: 'imap.b.fr', folder: 'Alertes' })).toEqual({
      user: 'a@b.fr',
      host: 'imap.b.fr',
      port: 993,
      secure: true,
      folder: 'Alertes',
      sinceDays: 14,
      markSeen: true,
    });
    expect(mailOf({ user: 'a@b.fr', host: 'imap.b.fr' })).toBeNull();
    expect(mailOf(undefined)).toBeNull();
  });
  it('file store (last resort) and environment variable', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vigie-secret-'));
    try {
      const s = fileStore(folder);
      const account = accountOf({ user: 'a@b.fr', host: 'imap.b.fr' });
      expect(s.get(account)).toBeNull();
      s.set(account, 'mot de passe "à" \\ part');
      expect(s.get(account)).toBe('mot de passe "à" \\ part');
      s.remove(account);
      expect(existsSync(join(folder, 'secrets'))).toBe(true);
      expect(s.get(account)).toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
    const env = secretStore({ VIGIE_EMPLOI_MAIL_PASSWORD: 'secret', APPDATA: tmpdir(), XDG_CONFIG_HOME: tmpdir() }, 'linux');
    expect(env.backend()).toBe('environment');
    expect(env.get('x')).toBe('secret');
  });
  it.runIf(process.platform === 'win32')('Windows: DPAPI round trip', () => {
    const folder = mkdtempSync(join(tmpdir(), 'vigie-dpapi-'));
    try {
      const s = secretStore({ APPDATA: folder }, 'win32');
      expect(s.backend()).toBe('dpapi');
      s.set('t|h', 'p@ss "w0rd" é');
      expect(readFileSync(join(folder, 'vigie-emploi', 'secrets', 't_h.dpapi'), 'utf8')).not.toContain('w0rd');
      expect(s.get('t|h')).toBe('p@ss "w0rd" é');
      s.remove('t|h');
      expect(s.get('t|h')).toBeNull();
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
  it('MailError keeps its kind', () => {
    expect(new MailError('folder', 'x').kind).toBe('folder');
  });
});
