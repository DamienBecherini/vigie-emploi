import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { addStatus, saveApplication, saveOffer } from '../src/core/offers.ts';
import { createApp } from '../src/api/server.ts';
import { Idle } from '../src/api/idle.ts';
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

/** Attend une notification du type voulu (ou échoue après delaiMs). */
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

describe('travail en attente', () => {
  it('compte les .eml de la boîte de réception (0 si elle n’existe pas)', () => {
    const { emails } = data();
    expect(countEmails(emails)).toBe(0);
    writeFileSync(join(emails, 'a.eml'), '');
    writeFileSync(join(emails, 'b.EML'), '');
    writeFileSync(join(emails, 'notes.txt'), '');
    expect(countEmails(emails)).toBe(2);
    expect(countEmails(join(emails, 'absent'))).toBe(0);
  });

  it('liste les offres en go dont le dossier n’existe pas encore', () => {
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

describe('lancement de l’agent', () => {
  it('remplace {folder} et {prompt} dans la commande du terminal', () => {
    expect(commandTerminal(['wt.exe', '-d', '{folder}', 'claude', '{prompt}'], 'D:/data', 'process-emails')).toEqual([
      'wt.exe', '-d', 'D:/data', 'claude', '/traiter-emails',
    ]);
  });

  it('le terminal ne reçoit pas les marqueurs de session de Claude Code', () => {
    const env = environmentClean({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CONFIG_DIR: '/c' });
    expect(env).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: '/c' });
  });

  it('sans terminal configuré hors Windows : erreur explicite', async () => {
    await expect(launcherTerminal(null, 'linux')('prepare-go', '/d')).rejects.toThrow(/claude \/preparer-go/);
  });

  it('un programme introuvable donne une erreur, pas un plantage', async () => {
    await expect(launcherTerminal(['programme-introuvable-vigie-emploi'])('process-emails', tmpdir())).rejects.toThrow(/Impossible d'ouvrir le terminal/);
  });

  it('POST /api/travail/:action lance l’action, et seulement une action connue en JSON', async () => {
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

  it('une erreur du lanceur revient à l’interface', async () => {
    const { folder, db } = data();
    const app = createApp(db, { dataDir: folder }, new Idle(0), {
      launcher: () => Promise.reject(new Error('wt.exe absent')),
    });
    const r = await app.request('/api/work/prepare-go', POST_JSON);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, error: 'wt.exe absent' });
  });

  it('GET /api/travail : e-mails et go à préparer', async () => {
    const { folder, emails, db, offer } = data();
    writeFileSync(join(emails, 'alerte.eml'), '');
    addStatus(db, offer('9'), 'go');
    const app = createApp(db, { dataDir: folder, emails });
    const state = (await (await app.request('/api/work')).json()) as { emails: number; go_to_prepare: unknown[] };
    expect(state.emails).toBe(1);
    expect(state.go_to_prepare).toHaveLength(1);
  });
});

describe('écritures venues d’une autre origine', () => {
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

  it('refusées depuis une page tierce (Origin ou Sec-Fetch-Site)', async () => {
    expect((await status({ Origin: 'https://example.com' })).status).toBe(403);
    expect((await status({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await app.request('/api/work/process-emails', { ...POST_JSON, headers: { ...POST_JSON.headers, Origin: 'https://example.com' } })).status).toBe(403);
    expect(launched).toEqual([]);
  });

  it('acceptées depuis l’interface locale ou sans navigateur (CLI, tests)', async () => {
    expect((await status({ Origin: 'http://localhost:4410', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await status({ Origin: 'http://127.0.0.1:5173' })).status).toBe(200);
    expect((await status({})).status).toBe(200);
  });

  it('les lectures ne sont pas concernées', async () => {
    expect((await app.request('/api/meta', { headers: { Origin: 'https://example.com' } })).status).toBe(200);
  });
});

describe('notifications', () => {
  it('regrouper : une rafale d’appels donne un seul déclenchement', async () => {
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

  it('une écriture par l’API notifie « base » ; une lecture ou une erreur non', async () => {
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

  it('une écriture d’un autre processus dans la base notifie « base » ; un e-mail déposé notifie « emails »', async () => {
    const folder = folderTemporary();
    const emails = join(folder, 'emails');
    mkdirSync(emails);
    const file = join(folder, 'data', 'vigie-emploi.sqlite');
    const server = openDatabase(file);
    const other = openDatabase(file); // la CLI ou le serveur MCP de l'agent
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

  it('GET /api/flux : flux d’événements, premier message « pret », puis les notifications', async () => {
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

  it('le flux ne compte pas comme activité (l’arrêt automatique reste possible)', async () => {
    let t = 0;
    const idle = new Idle(60, () => t);
    const app = createApp(openDatabase(':memory:'), { dataDir: '/d' }, idle);
    t = 50;
    const r = await app.request('/api/stream');
    await r.body!.cancel();
    expect(idle.remainingS()).toBe(10);
  });
});
