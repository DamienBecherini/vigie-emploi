// Open the application folder in the file explorer: only from the server's machine,
// only a folder of the workspace, and the right program depending on the system.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { findOffer, saveOffer } from '../src/core/offers.ts';
import { importHistory } from '../src/import/history.ts';
import { createApp } from '../src/api/server.ts';
import { programOpening } from '../src/api/open.ts';

const DATA = join(import.meta.dirname, 'fixtures', 'data');
const json = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

function prepare(isLocal: boolean) {
  const db = openDatabase(':memory:');
  importHistory(db, DATA);
  const open: string[] = [];
  const app = createApp(db, { dataDir: DATA }, undefined, {
    isLocal: () => isLocal,
    opener: async (absolute) => {
      open.push(absolute);
    },
  });
  return { db, app, open, acme: findOffer(db, 'linkedin', '4200000099')!.id };
}

describe('open the application folder', () => {
  it('from the server’s machine: opens the offer’s folder, and /api/health reports it', async () => {
    const { app, open, acme } = prepare(true);
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(true);
    const r = await app.request(`/api/offers/${acme}/open-folder`, json);
    expect(r.status).toBe(200);
    expect(open).toHaveLength(1);
    expect(open[0].replace(/\\/g, '/')).toMatch(/candidatures\/acme-developpeur-php$/);
  });

  it('from another machine: refused, nothing is opened', async () => {
    const { app, open, acme } = prepare(false);
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(false);
    expect((await app.request(`/api/offers/${acme}/open-folder`, json)).status).toBe(403);
    expect(open).toEqual([]);
  });

  it('without a real connection (test request), the request is not considered local', async () => {
    const db = openDatabase(':memory:');
    importHistory(db, DATA);
    const app = createApp(db, { dataDir: DATA });
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(false);
  });

  it('offer without a folder, or without JSON (form of a third-party page): refused', async () => {
    const { db, app, open, acme } = prepare(true);
    const id = saveOffer(db, 'manual', 'without-folder', { title: 'Sans dossier' }, 'manual').offer.id;
    expect((await app.request(`/api/offers/${id}/open-folder`, json)).status).toBe(404);
    expect((await app.request(`/api/offers/${acme}/open-folder`, { method: 'POST', body: '{}' })).status).toBe(415);
    expect(open).toEqual([]);
  });

  it('program depending on the system', () => {
    expect(programOpening('win32')).toBe('explorer.exe');
    expect(programOpening('darwin')).toBe('open');
    expect(programOpening('linux')).toBe('xdg-open');
  });
});
