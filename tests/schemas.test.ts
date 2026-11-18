// What comes from outside is validated by a schema, in one place per kind of input: a score (command line, API,
// MCP server), the bodies of the API's requests, the configuration file.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/server.ts';
import { scoreOffers } from '../src/core/actions.ts';
import { loadConfig } from '../src/core/config.ts';
import { AppError } from '../src/core/errors.ts';
import { saveOffer } from '../src/core/offers.ts';
import { checkInputBatch, schemaInputBatch } from '../src/core/scoring.ts';
import { openDatabase } from '../src/db/database.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-schemas-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError && e.code === 'invalid') return e.message;
    throw e;
  }
  throw new Error('accepted');
};

describe('a score: one schema for the command line, the API and the MCP server', () => {
  it('accepts what an AI writes: numbers as text, null for what the offer does not say', () => {
    const e = checkInputBatch({ id: 3, score: '6,5', company: null, criteria: { technique: { score: '8', justification: 'PHP' } }, unknown: 'ignored' });
    expect(e).toMatchObject({ id: 3, score: '6,5', company: null });
    expect(e).not.toHaveProperty('unknown');
  });

  it('refuses a field of the wrong type, naming it', () => {
    expect(refused(() => checkInputBatch({ id: 'three' }))).toMatch(/\bid\b/);
    expect(refused(() => checkInputBatch({ id: 1, tags: 'php' }))).toMatch(/tags/);
    expect(refused(() => checkInputBatch({ id: 1, inputs: { onsite_days: 9 } }))).toMatch(/inputs\.onsite_days/);
    expect(refused(() => checkInputBatch({ id: 1, criteria: { technique: 8 } }))).toMatch(/criteria\.technique/);
  });

  it('scoreOffers validates each input before writing anything', () => {
    const db = openDatabase(':memory:');
    const { offer } = saveOffer(db, 'linkedin', '1', { title: 'Developer' }, 'manual');
    expect(
      refused(() =>
        scoreOffers(
          db,
          [
            { id: offer.id, score: 7 },
            { id: offer.id, read: 'yes' },
          ],
          'cli',
        ),
      ),
    ).toMatch(/read/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM scores').get()).toEqual({ n: 0 });
  });

  it('a front end attaches its own documentation to the fields, without redefining them', () => {
    const documented = schemaInputBatch((field) => (field === 'criteria.score' ? 'Sub-score from 0 to 10' : undefined));
    expect(documented.shape.criteria.unwrap().valueType.shape.score.description).toBe('Sub-score from 0 to 10');
    expect(Object.keys(documented.shape)).toEqual(Object.keys(schemaInputBatch().shape));
  });
});

describe('API: the body of a request is validated before the route acts', () => {
  const db = openDatabase(':memory:');
  const { offer } = saveOffer(db, 'linkedin', '1', { title: 'Developer' }, 'manual');
  const app = createApp(db, { dataDir: root, language: 'en' });
  const send = (path: string, body: unknown, method = 'POST') =>
    app.request(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it.each([
    ['status', `/api/offers/${offer.id}/status`, 'POST', { status: 5 }, /status/],
    ['tags', `/api/offers/${offer.id}/tags`, 'PUT', { tags: 'php' }, /tags/],
    ['link', `/api/offers/${offer.id}/link`, 'PUT', { url: 12 }, /url/],
    ['score', `/api/offers/${offer.id}/score`, 'POST', { score: true }, /score/],
    ['sub-scores', `/api/offers/${offer.id}/sub-scores`, 'PUT', { blockers: 'stage' }, /blockers/],
    ['event', `/api/offers/${offer.id}/events`, 'POST', { type: 'note', summary: 12 }, /summary/],
    ['restore', '/api/rubric/restore', 'POST', { version: 'one' }, /version/],
  ])('%s: 400 and the name of the wrong field', async (_name, path, method, body, field) => {
    const r = await send(path, body, method);
    expect(r.status).toBe(400);
    const answer = (await r.json()) as { ok: boolean; code: string; error: string };
    expect(answer).toMatchObject({ ok: false, code: 'invalid' });
    expect(answer.error).toMatch(field);
  });

  it('a valid body still goes through', async () => {
    const r = await send(`/api/offers/${offer.id}/tags`, { tags: ['php', 'remote'] }, 'PUT');
    expect(await r.json()).toEqual({ ok: true, tags: ['php', 'remote'] });
  });
});

describe('configuration file', () => {
  const folder = (name: string, content: string): string => {
    const f = join(root, name);
    mkdirSync(f, { recursive: true });
    writeFileSync(join(f, 'vigie-emploi.config.json'), content);
    return f;
  };
  const load = (f: string, env: NodeJS.ProcessEnv = {}) => loadConfig({ cwd: f, env: { LANG: 'en_GB.UTF-8', ...env } });

  it('accepts a complete file and leaves an unknown key alone', () => {
    const f = folder('good', JSON.stringify({ dataDir: '.', port: 4500, language: 'en', excludedTitles: ['stage'], note: 'mine' }));
    expect(load(f)).toMatchObject({ port: 4500, language: 'en' });
  });

  it('refuses a key of the wrong type, naming the file and the key', () => {
    const f = folder('port', JSON.stringify({ dataDir: '.', port: 'abc' }));
    expect(refused(() => load(f))).toMatch(/vigie-emploi\.config\.json.*port/s);
    const g = folder('titles', JSON.stringify({ dataDir: '.', excludedTitles: 'stage' }));
    expect(refused(() => load(g))).toMatch(/excludedTitles/);
  });

  it('refuses a file that is not JSON, an invalid exclusion pattern and an invalid VIGIE_EMPLOI_PORT, each with its message', () => {
    expect(refused(() => load(folder('broken', '{ dataDir: ')))).toMatch(/^Invalid configuration \(/);
    expect(refused(() => load(folder('pattern', JSON.stringify({ dataDir: '.', excludedTitles: ['(stage'] }))))).toMatch(/Invalid exclusion pattern.*\(stage/);
    const f = folder('env', JSON.stringify({ dataDir: '.' }));
    expect(refused(() => load(f, { VIGIE_EMPLOI_PORT: 'abc' }))).toMatch(/Invalid port: abc/);
    expect(load(f, { VIGIE_EMPLOI_PORT: '4999' }).port).toBe(4999);
  });
});
