import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { addStatus, saveApplication, saveOffer } from '../src/core/offers.ts';
import { createApp } from '../src/api/server.ts';
import { Idle } from '../src/api/idle.ts';
import { AppError } from '../src/core/errors.ts';
import { Broadcast, group, watchChanges, type Notification } from '../src/api/broadcast.ts';
import { commandTerminal, countEmails, environmentClean, stateWork, launcherTerminal, type ActionAgent } from '../src/api/work.ts';

const temporary: string[] = [];
function folderTemporary(): string {
  const d = mkdtempSync(join(tmpdir(), 'vigie-emploi-agent-'));
  temporary.push(d);
  return d;
}
afterAll(() => {
  for (const d of temporary) rmSync(d, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for a notification of the wanted type (or fails after delayMs). */
function next(broadcast: Broadcast, type: Notification['type'], timeoutMs = 3000): Promise<Notification> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Pas de notification « ${type} » en ${timeoutMs} ms`));
    }, timeoutMs);
    const unsubscribe = broadcast.subscribe((n) => {
      if (n.type !== type) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(n);
    });
  });
}

function data() {
  const folder = folderTemporary();
  const emails = join(folder, 'emails');
  mkdirSync(emails);
  const db = openDatabase(':memory:');
  const offer = (siteId: string) => saveOffer(db, 'linkedin', siteId, { title: 'Développeur API', company: 'Kappa' }, 'manual').offer.id;
  return { folder, emails, db, offer };
}

const POST_JSON = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

describe('pending work', () => {
  it('counts the .eml files of the inbox (0 if it does not exist)', () => {
    const { emails } = data();
    expect(countEmails(emails)).toBe(0);
    writeFileSync(join(emails, 'a.eml'), '');
    writeFileSync(join(emails, 'b.EML'), '');
    writeFileSync(join(emails, 'notes.txt'), '');
    expect(countEmails(emails)).toBe(2);
    expect(countEmails(join(emails, 'absent'))).toBe(0);
  });

  it('lists the offers in go whose folder does not exist yet', () => {
    const { folder, emails, db, offer } = data();
    const withoutApplication = offer('1');
    const folderAbsent = offer('2');
    const ready = offer('3');
    const scored = offer('4');
    for (const id of [withoutApplication, folderAbsent, ready]) addStatus(db, id, 'go');
    addStatus(db, scored, 'scored');
    saveApplication(db, folderAbsent, { folder: 'candidatures/absent' });
    mkdirSync(join(folder, 'candidatures', 'prete'), { recursive: true });
    saveApplication(db, ready, { folder: 'candidatures/prete' });
    const state = stateWork(db, { dataDir: folder, emails });
    expect(state.go_to_prepare.map((o) => o.id)).toEqual([withoutApplication, folderAbsent]);
    expect(state.go_to_prepare[0]).toEqual({ id: withoutApplication, title: 'Développeur API', company: 'Kappa' });
  });
});

describe('launch of the agent', () => {
  it('replaces {folder} and {prompt} in the terminal command', () => {
    expect(commandTerminal(['wt.exe', '-d', '{folder}', 'claude', '{prompt}'], 'D:/data', 'process-emails')).toEqual([
      'wt.exe',
      '-d',
      'D:/data',
      'claude',
      '/traiter-emails',
    ]);
  });

  it('the terminal does not receive the session markers of Claude Code', () => {
    const env = environmentClean({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CONFIG_DIR: '/c' });
    expect(env).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: '/c' });
  });

  it('without a configured terminal outside Windows: explicit error', async () => {
    await expect(launcherTerminal(null, 'linux')('prepare-go', '/d')).rejects.toThrow(/claude \/preparer-go/);
  });

  it('a program not found gives an error, not a crash', async () => {
    await expect(launcherTerminal(['programme-introuvable-vigie-emploi'])('process-emails', tmpdir())).rejects.toThrow(/Impossible d'ouvrir le terminal/);
  });

  it('POST /api/work/:action launches the action, and only a known action in JSON', async () => {
    const { folder, emails, db } = data();
    const launched: [ActionAgent, string][] = [];
    const app = createApp(db, { dataDir: folder, emails }, new Idle(0), {
      launcher: async (action, d) => void launched.push([action, d]),
    });
    expect((await app.request('/api/work/process-emails', POST_JSON)).status).toBe(200);
    expect(launched).toEqual([['process-emails', folder]]);
    expect((await app.request('/api/work/rm-rf', POST_JSON)).status).toBe(404);
    expect((await app.request('/api/work/prepare-go', { method: 'POST', body: 'x' })).status).toBe(415);
    expect(launched).toHaveLength(1);
  });

  it('an error of the launcher comes back to the interface', async () => {
    const { folder, db } = data();
    const app = createApp(db, { dataDir: folder }, new Idle(0), {
      launcher: () => Promise.reject(new AppError('invalid', 'wt.exe absent')),
    });
    const r = await app.request('/api/work/prepare-go', POST_JSON);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: 'wt.exe absent' });
  });

  it('GET /api/work: e-mails and go to prepare', async () => {
    const { folder, emails, db, offer } = data();
    writeFileSync(join(emails, 'alerte.eml'), '');
    addStatus(db, offer('9'), 'go');
    const app = createApp(db, { dataDir: folder, emails });
    const state = (await (await app.request('/api/work')).json()) as { emails: number; go_to_prepare: unknown[] };
    expect(state.emails).toBe(1);
    expect(state.go_to_prepare).toHaveLength(1);
  });
});

describe('writes coming from another origin', () => {
  const { folder, db, offer } = data();
  const id = offer('origin');
  const launched: string[] = [];
  const app = createApp(db, { dataDir: folder }, new Idle(0), { launcher: async (a) => void launched.push(a) });
  const status = (headers: Record<string, string>) =>
    app.request(`/api/offers/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ status: 'scored' }),
    });

  it('refused from a third-party page (Origin or Sec-Fetch-Site)', async () => {
    expect((await status({ Origin: 'https://example.com' })).status).toBe(403);
    expect((await status({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await app.request('/api/work/process-emails', { ...POST_JSON, headers: { ...POST_JSON.headers, Origin: 'https://example.com' } })).status).toBe(
      403,
    );
    expect(launched).toEqual([]);
  });

  it('accepted from the local interface or without a browser (CLI, tests)', async () => {
    expect((await status({ Origin: 'http://localhost:4410', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await status({ Origin: 'http://127.0.0.1:5173' })).status).toBe(200);
    expect((await status({})).status).toBe(200);
  });

  it('reads are not concerned', async () => {
    expect((await app.request('/api/meta', { headers: { Origin: 'https://example.com' } })).status).toBe(200);
  });
});

describe('notifications', () => {
  it('group: a burst of calls gives a single trigger', async () => {
    let n = 0;
    const r = group(() => n++, 30);
    r.trigger();
    r.trigger();
    r.trigger();
    await wait(80);
    expect(n).toBe(1);
    r.trigger();
    r.stop();
    await wait(60);
    expect(n).toBe(1);
  });

  it('a write through the API notifies “database”; a read or an error does not', async () => {
    const { folder, db, offer } = data();
    const id = offer('api');
    const broadcast = new Broadcast();
    const received: Notification[] = [];
    broadcast.subscribe((n) => received.push(n));
    const app = createApp(db, { dataDir: folder }, new Idle(0), { broadcast });
    await app.request(`/api/offers/${id}`);
    await app.request(`/api/offers/99999/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"status":"scored"}' });
    expect(received).toEqual([]);
    await app.request(`/api/offers/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"status":"scored"}' });
    expect(received).toEqual([{ type: 'database' }]);
  });

  it('a write of another process in the database notifies “database”; a dropped e-mail notifies “emails”', async () => {
    const folder = folderTemporary();
    const emails = join(folder, 'emails');
    mkdirSync(emails);
    const file = join(folder, 'data', 'vigie-emploi.sqlite');
    const server = openDatabase(file);
    const other = openDatabase(file); // the CLI or the agent's MCP server
    const broadcast = new Broadcast();
    const stop = watchChanges({ db: server, broadcast, database: file, emails, timeoutMs: 50 });
    try {
      const database = next(broadcast, 'database');
      saveOffer(other, 'linkedin', 'externe', { title: 'Offre ajoutée par la CLI' }, 'manual');
      await expect(database).resolves.toEqual({ type: 'database' });

      const mail = next(broadcast, 'emails');
      writeFileSync(join(emails, 'alerte.eml'), '');
      await expect(mail).resolves.toEqual({ type: 'emails', number: 1 });
    } finally {
      stop();
      server.close();
      other.close();
    }
  });

  it('GET /api/stream: event stream, first message “ready”, then the notifications', async () => {
    const { folder, db } = data();
    const broadcast = new Broadcast();
    const app = createApp(db, { dataDir: folder }, new Idle(0), { broadcast });
    const r = await app.request('/api/stream');
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('event: ready')) text += decoder.decode((await reader.read()).value);
    expect(broadcast.numberSubscribers).toBe(1);
    broadcast.emit({ type: 'emails', number: 3 });
    while (!text.includes('event: emails')) text += decoder.decode((await reader.read()).value);
    expect(text).toContain('data: {"type":"emails","number":3}');
    await reader.cancel();
  });

  it('the stream does not count as activity (the automatic stop stays possible)', async () => {
    let t = 0;
    const idle = new Idle(60, () => t);
    const app = createApp(openDatabase(':memory:'), { dataDir: '/d' }, idle);
    t = 50;
    const r = await app.request('/api/stream');
    await r.body!.cancel();
    expect(idle.remainingS()).toBe(10);
  });
});
