// CLI (src/cli/main.ts and src/cli/mail.ts), safety net before the file is split: import-history, and the mail
// subcommands that run without a real mailbox or the system keychain.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cli, FIXTURES, isolate, parsed, workspace } from './cli-helpers.ts';

vi.mock('../src/db/database.ts', async (original) => (await import('./cli-databases.ts')).trackDatabases(original));

const tmp = isolate('import-mail');

describe('import-history', () => {
  let ws = '';
  let run: Awaited<ReturnType<typeof workspace>>;
  beforeAll(async () => {
    ws = `${tmp.root()}/ws`;
    run = await workspace(ws);
    cpSync(`${FIXTURES}/data`, ws, { recursive: true });
  });

  it('--json: batches, register, tracker, journals of the data folder', async () => {
    const r = parsed<{
      batches: Record<string, unknown>;
      register: Record<string, unknown>;
      tracker: Record<string, unknown>;
      journal: Record<string, unknown>;
    }>(await run('import-history', '--json'));
    expect(r.batches).toMatchObject({ files: 1, inputs: 2, offers_created: 2, scores_added: 2 });
    expect(r.register).toMatchObject({ lines: 9, offers: 18 });
    expect(r.tracker).toMatchObject({ lines: 7, applications: 7 });
    expect(r.journal).toMatchObject({ folders: 1, lines: 6, events_created: 6 });
    expect(parsed<{ total: number }>(await run('list', '--json')).total).toBeGreaterThan(20);
  });

  it('text mode, --source: every section', async () => {
    const source = `${tmp.root()}/source`;
    cpSync(`${FIXTURES}/data`, source, { recursive: true });
    const other = `${tmp.root()}/ws-text`;
    const r = await (await workspace(other))('import-history', '--source', source);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Batches: 1 file\(s\), 2 item\(s\), 2 offer\(s\) created, 2 score\(s\)\.\n/);
    expect(r.out).toMatch(/\nRegister: 9 line\(s\), 18 offer\(s\) including \d+ created/);
    expect(r.out).toMatch(/\nTracking file: 7 line\(s\), \d+ offer\(s\) created, 7 application\(s\), \d+ status\(es\)\.\n/);
    expect(r.out).toMatch(
      /\nJournals: 1 folder\(s\), 6 dated line\(s\), 6 event\(s\) created, .*; types: message 2, interview 1, proposal 1, note 1, test 1\.\n/,
    );
    expect(r.out).toContain('Untyped journal lines, imported as notes (1):\n  candidatures/acme-developpeur-php:15 Fiche relue.');
    expect(r.out).toContain('Journal lines without a date, not imported (1):\n  candidatures/acme-developpeur-php:19 Point fait sans date');
    expect(r.out).toContain('Unrecognised lines (1):\n  _ecartees.md:28 ');
    expect(r.out).toContain('Unrecognised links (1):\n  _ecartees.md:22 https://www.welcometothejungle.com/fr/companies/iota/jobs/webmaster');
  });

  it('generated tracker: not read again', async () => {
    expect((await run('generate-tracker', '--replace')).code).toBe(0);
    const r = await run('import-history');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\nTracking file: not read \(.+\)\.\n/);
    expect(r.out).toContain('0 event(s) created, 6 already in the database');
  });

  it('source without a candidatures/ folder: error', async () => {
    const r = await run('import-history', '--source', `${tmp.root()}/nowhere`, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.err)).toMatchObject({ ok: false, code: 'not-found' });
    // An expected error: in text mode the message alone, no stack.
    const text = await run('import-history', '--source', `${tmp.root()}/nowhere`);
    expect(text.code).toBe(1);
    expect(text.err).toMatch(/^Error: No candidatures\/ folder in .+nowhere\n$/);
  });
});

describe('mail', () => {
  let ws = '';
  let run: Awaited<ReturnType<typeof workspace>>;
  const configFile = () => `${ws}/vigie-emploi.config.json`;
  const writeMail = (mail: object | null) => {
    const c = JSON.parse(readFileSync(configFile(), 'utf8'));
    if (mail) c.mail = mail;
    else delete c.mail;
    writeFileSync(configFile(), JSON.stringify(c, null, 2));
  };
  beforeAll(async () => {
    ws = `${tmp.root()}/ws-mail`;
    run = await workspace(ws);
  });

  it('status without a mailbox: --json and text mode; "status" by default', async () => {
    expect(parsed(await run('mail', 'status', '--json'))).toMatchObject({ configured: false, user: null, host: null, password: false });
    expect(await run('mail', 'status')).toEqual({ code: 0, out: 'No mailbox configured (vigie-emploi mail setup).\n', err: '' });
    expect((await run('mail')).out).toBe('No mailbox configured (vigie-emploi mail setup).\n');
  });

  it('status of a configured mailbox, password given by VIGIE_EMPLOI_MAIL_PASSWORD', async () => {
    writeMail({ user: 'jane@example.com', host: 'imap.example.com', folder: 'Jobs' });
    vi.stubEnv('VIGIE_EMPLOI_MAIL_PASSWORD', 'not-a-real-password');
    try {
      expect(parsed(await run('mail', 'status', '--json'))).toEqual({
        configured: true,
        user: 'jane@example.com',
        host: 'imap.example.com',
        port: 993,
        folder: 'Jobs',
        sinceDays: 14,
        markSeen: true,
        password: true,
        backend: 'environment',
        fetched_at: null,
      });
      expect((await run('mail', 'status')).out).toBe(
        'Mailbox: jane@example.com on imap.example.com:993, folder "Jobs"\nPassword: stored (VIGIE_EMPLOI_MAIL_PASSWORD variable)\nLast fetch: never\n',
      );
    } finally {
      vi.stubEnv('VIGIE_EMPLOI_MAIL_PASSWORD', '');
      writeMail(null);
    }
  });

  it('fetch without a mailbox: error', async () => {
    expect((await run('mail', 'fetch')).err).toBe('Error: No mailbox configured (vigie-emploi mail setup).\n');
  });

  it('forget without a mailbox: settings removed from the configuration file', async () => {
    writeMail(null);
    expect((await run('mail', 'forget')).out).toBe('Mailbox forgotten: settings and password removed (the messages stay in the mailbox).\n');
    expect(JSON.parse(readFileSync(configFile(), 'utf8')).mail).toBeUndefined();
  });

  it('unknown subcommand, unknown option', async () => {
    expect((await run('mail', 'bogus')).err).toBe('Error: Unknown subcommand "bogus": setup, status, fetch or forget.\n');
    expect((await run('mail', 'status', '--bogus')).code).toBe(1);
  });

  it('setup refusals that come before any connection', async () => {
    expect((await run('mail', 'setup', '--password-stdin')).err).toBe('Error: E-mail address required (--address).\n');
    const oauth = await run('mail', 'setup', '--address', 'jane@outlook.com', '--password-stdin');
    expect(oauth.code).toBe(1);
    expect(oauth.err).toContain('Outlook.com / Microsoft 365');
    expect((await run('mail', 'setup', '--address', 'jane@example.org', '--password-stdin')).err).toBe('Error: IMAP server required (--host).\n');
    const bare = `${tmp.root()}/bare`;
    mkdirSync(bare);
    expect((await cli('mail', 'setup', '--data', bare)).err).toMatch(/vigie-emploi\.config\.json/);
  });

  // Windows only: the password store is then a file under %APPDATA% (redirected to the temporary folder); elsewhere it
  // would ask the system keychain.
  it.runIf(process.platform === 'win32')('no password stored: fetch refused, ingest reports it and goes on', async () => {
    vi.stubEnv('APPDATA', `${tmp.root()}/appdata`);
    writeMail({ user: 'jane@example.com', host: 'imap.example.com', folder: 'Jobs' });
    try {
      const fetch = await run('mail', 'fetch');
      expect(fetch.code).toBe(1);
      expect(fetch.err).toMatch(/^Error: .*no password stored for this mailbox/);
      const j = parsed<{ mail: { error: string; folder: string } }>(await run('ingest', '--no-fetch', '--json'));
      expect(j.mail).toMatchObject({ error: 'no-password', folder: 'Jobs' });
      const r = await run('ingest', '--no-fetch');
      expect(r.out).toMatch(/^Mailbox not fetched: .*no password stored/);
      expect((await run('mail', 'status')).out).toContain('Password: missing (vigie-emploi mail setup)');
    } finally {
      writeMail(null);
    }
  });
});

describe('French', () => {
  it('mail and import-history in French', async () => {
    const fr = `${tmp.root()}/fr`;
    const runFr = await workspace(fr, 'fr');
    expect((await runFr('mail', 'status')).out).toMatch(/^Aucune boîte mail/);
    expect((await runFr('import-history')).out).toMatch(/^Lots : 0 fichier/);
  });
});
