// Expected errors carry a code; each front end answers from the code, never from the text of the message.
// A defect of the program (any other exception) answers 500 on the API and leaves its stack on the error output.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/api/server.ts';
import { ErrorConfig, loadConfig } from '../src/core/config.ts';
import { AppError, ERROR_CODES, HTTP_STATUS, isExpected } from '../src/core/errors.ts';
import { eventOrError } from '../src/core/events.ts';
import { safeFile } from '../src/core/files.ts';
import { addStatus, saveOffer } from '../src/core/offers.ts';
import { rubricRequired } from '../src/core/rubric-storage.ts';
import { openDatabase } from '../src/db/database.ts';
import { MailError } from '../src/mail/fetch.ts';
import { failure } from '../src/mcp/results.ts';

const root = mkdtempSync(join(tmpdir(), 'vigie-emploi-errors-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

function workspace(name: string) {
  const folder = join(root, name);
  mkdirSync(join(folder, 'candidatures'), { recursive: true });
  writeFileSync(join(folder, 'candidatures', 'note.md'), '# note');
  const db = openDatabase(':memory:');
  const { offer } = saveOffer(db, 'linkedin', '1', { title: 'Developer' }, 'manual');
  return { folder, db, offer, app: createApp(db, { dataDir: folder, language: 'en' }) };
}

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof AppError ? e.code : `not an AppError: ${String(e)}`;
  }
  return undefined;
};

describe('errors of the core', () => {
  const { folder, db, offer } = workspace('core');

  it('carry the code of their kind', () => {
    expect(code(() => eventOrError(db, 99999))).toBe('not-found');
    expect(code(() => rubricRequired(db, folder))).toBe('not-found');
    expect(code(() => addStatus(db, offer.id, 'nonsense'))).toBe('invalid');
    expect(code(() => safeFile(folder, 'data/vigie-emploi.sqlite'))).toBe('forbidden');
    expect(code(() => safeFile(folder, 'candidatures/absent.md'))).toBe('not-found');
  });

  it('configuration and mailbox errors are expected errors too, with their own discriminant', () => {
    const config = code(() => loadConfig({ cwd: join(root, 'nowhere'), env: {} }));
    expect(config).toBe('not-configured');
    expect(new ErrorConfig('language-unknown', 'x')).toBeInstanceOf(AppError);
    const mail = new MailError('authentication', 'refused');
    expect(mail).toBeInstanceOf(AppError);
    expect(mail.kind).toBe('authentication');
  });

  it('every code has an HTTP status', () => {
    for (const c of ERROR_CODES) expect(HTTP_STATUS[c]).toBeGreaterThanOrEqual(400);
  });

  it('isExpected: an AppError or a system error with a code, not a defect of the program', () => {
    expect(isExpected(new AppError('invalid', 'x'))).toBe(true);
    expect(isExpected(Object.assign(new Error('missing'), { code: 'ENOENT' }))).toBe(true);
    expect(isExpected(Object.assign(new Error('option'), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' }))).toBe(true);
    expect(isExpected(new TypeError('x is not a function'))).toBe(false);
    expect(isExpected(new Error('plain'))).toBe(false);
  });
});

describe('API: status from the code', () => {
  const { app, db, offer } = workspace('api');
  const json = (body: unknown, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('404 for what does not exist, with the code in the answer', async () => {
    const r = await app.request('/api/events/99999', { method: 'DELETE' });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ ok: false, code: 'not-found' });
    expect((await app.request('/api/rubric/versions/99')).status).toBe(404);
  });

  it('400 for a wrong input, and for a body that is not JSON', async () => {
    const r = await app.request(`/api/offers/${offer.id}/events`, json({ type: 'nonsense', summary: 'x' }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, code: 'invalid' });
    const broken = await app.request(`/api/offers/${offer.id}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('files: 404 for a missing file, 403 for a refused one, whatever the language of the message', async () => {
    expect((await app.request('/api/file/candidatures/absent.md')).status).toBe(404);
    expect((await app.request('/api/file/data/vigie-emploi.sqlite')).status).toBe(403);
    expect((await app.request('/api/file/candidatures/note.md')).status).toBe(200);
  });

  it('500 for a defect of the program, with its stack on the error output', async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((x) => {
      written.push(String(x));
      return true;
    });
    // A closed database: node:sqlite throws an ordinary Error, which no code announces.
    db.close();
    const r = await app.request('/api/meta');
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ ok: false, code: 'internal' });
    expect(written.join('')).toMatch(/\n\s+at /);
  });
});

describe('MCP: a defect leaves its stack on the error output, an expected error does not', () => {
  it('failure()', () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((x) => {
      written.push(String(x));
      return true;
    });
    expect(failure(new AppError('not-found', 'Job ad 9 not found'))).toMatchObject({ isError: true });
    expect(written).toEqual([]);
    const r = failure(new TypeError('boom'));
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('boom');
    expect(written.join('')).toMatch(/TypeError: boom/);
  });
});
