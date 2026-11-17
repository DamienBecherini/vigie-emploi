// Mailbox settings from the dashboard (for users without a terminal): state, folder list, save, fetch, forget.
// The password goes from the local page to the system keychain; it is never sent back.
import type { Hono } from 'hono';
import { readMailSettings, type MailConfig } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { accountOf, fetchMailPerConfig, listFolders, MailError } from '../mail/fetch.ts';
import { PROVIDERS } from '../mail/providers.ts';
import type { SecretStore } from '../mail/secret.ts';
import { mailState, messageMailError, saveMailSettings } from '../mail/settings.ts';

interface Body {
  address?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  folder?: string;
  password?: string;
  sinceDays?: number;
  markSeen?: boolean;
}

function settings(b: Body, current: MailConfig | null): Omit<MailConfig, 'folder'> & { folder: string } {
  const user = String(b.address ?? '').trim();
  const host = String(b.host ?? '').trim();
  if (!user || !host) throw new MailError('other', 'address and host required');
  const secure = b.secure !== false;
  return {
    user,
    host,
    port: Number.isInteger(b.port) && b.port! > 0 ? b.port! : secure ? 993 : 143,
    secure,
    folder: String(b.folder ?? '').trim(),
    sinceDays: Number.isInteger(b.sinceDays) && b.sinceDays! > 0 ? b.sinceDays! : (current?.sinceDays ?? 14),
    markSeen: b.markSeen ?? current?.markSeen ?? true,
  };
}

/** Typed password, or the stored one when the mailbox does not change (the page never receives it). */
function password(b: Body, mail: Pick<MailConfig, 'user' | 'host'>, store: SecretStore): string {
  if (b.password) return b.password;
  const stored = store.get(accountOf(mail));
  if (!stored) throw new MailError('no-password', accountOf(mail));
  return stored;
}

export function routesMail(app: Hono, o: { db: Database; file: string | null; emails: string; store: () => SecretStore }): void {
  const current = () => readMailSettings(o.file);
  const failure = (e: unknown, mail: Pick<MailConfig, 'host' | 'folder'>) => {
    const err = e instanceof MailError ? e : new MailError('other', (e as Error).message);
    return { ok: false, kind: err.kind, error: messageMailError(err, mail) };
  };

  app.get('/api/mail', (c) =>
    c.json({
      ok: true,
      state: mailState(o.db, current(), o.store()),
      config_file: o.file !== null,
      providers: PROVIDERS.map(({ id, name, host, port, secure, auth, help, domains }) => ({ id, name, host, port, secure, auth, help, domains })),
    }),
  );

  // Connection test and folder list (before choosing the folder).
  app.post('/api/mail/folders', async (c) => {
    const b = (await c.req.json()) as Body;
    let mail: MailConfig | null = null;
    try {
      mail = settings(b, current());
      const folders = await listFolders(mail, { password: password(b, mail, o.store()) });
      return c.json({ ok: true, folders });
    } catch (e) {
      return c.json(failure(e, { host: mail?.host ?? String(b.host ?? ''), folder: '' }));
    }
  });

  app.put('/api/mail', async (c) => {
    if (!o.file) return c.json({ ok: false, kind: 'other', error: 'no configuration file' }, 400);
    const b = (await c.req.json()) as Body;
    let mail: MailConfig | null = null;
    try {
      mail = settings(b, current());
      if (!mail.folder) throw new MailError('folder', '');
      const store = o.store();
      const pass = password(b, mail, store);
      const folders = await listFolders(mail, { password: pass });
      if (!folders.includes(mail.folder)) throw new MailError('folder', folders.join(', '));
      const before = current();
      store.set(accountOf(mail), pass);
      if (before && accountOf(before) !== accountOf(mail)) store.remove(accountOf(before));
      saveMailSettings(o.file, mail);
      return c.json({ ok: true, state: mailState(o.db, mail, store) });
    } catch (e) {
      return c.json(failure(e, { host: mail?.host ?? '', folder: mail?.folder ?? '' }));
    }
  });

  app.delete('/api/mail', (c) => {
    const mail = current();
    if (mail) o.store().remove(accountOf(mail));
    if (o.file) saveMailSettings(o.file, null);
    return c.json({ ok: true });
  });

  // Fetch only: the .eml files land in emails/, the inbox badge offers to process them.
  app.post('/api/mail/fetch', async (c) => {
    const mail = current();
    if (!mail) return c.json({ ok: false, kind: 'other', error: 'no mailbox configured' }, 400);
    try {
      const r = await fetchMailPerConfig(o.db, { mail, emails: o.emails }, o.store());
      return c.json({ ok: true, fetched: r!.fetched, more: r!.more, folder: r!.folder });
    } catch (e) {
      return c.json(failure(e, mail));
    }
  });
}
