// Ouvrir le dossier de candidature dans l'explorateur de fichiers : seulement depuis la machine du serveur,
// seulement un dossier de l'espace, et le bon programme selon le système.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.ts';
import { findOffer, saveOffer } from '../src/core/offers.ts';
import { importHistory } from '../src/import/history.ts';
import { createApp } from '../src/api/server.ts';
import { programOpening } from '../src/api/open.ts';

const DATA = join(import.meta.dirname, 'fixtures', 'data');
const json = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

function prepare(isLocale: boolean) {
  const db = openDatabase(':memory:');
  importHistory(db, DATA);
  const open: string[] = [];
  const app = createApp(db, { dataDir: DATA }, undefined, {
    isLocale: () => isLocale,
    opener: async (absolute) => {
      open.push(absolute);
    },
  });
  return { db, app, open, acme: findOffer(db, 'linkedin', '4200000099')!.id };
}

describe('ouvrir le dossier de candidature', () => {
  it('depuis la machine du serveur : ouvre le dossier de l’offre, et /api/sante le signale', async () => {
    const { app, open, acme } = prepare(true);
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(true);
    const r = await app.request(`/api/offers/${acme}/open-folder`, json);
    expect(r.status).toBe(200);
    expect(open).toHaveLength(1);
    expect(open[0].replace(/\\/g, '/')).toMatch(/candidatures\/acme-developpeur-php$/);
  });

  it('depuis une autre machine : refusé, rien n’est ouvert', async () => {
    const { app, open, acme } = prepare(false);
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(false);
    expect((await app.request(`/api/offers/${acme}/open-folder`, json)).status).toBe(403);
    expect(open).toEqual([]);
  });

  it('sans connexion réelle (requête de test), la requête n’est pas considérée comme locale', async () => {
    const db = openDatabase(':memory:');
    importHistory(db, DATA);
    const app = createApp(db, { dataDir: DATA });
    expect(((await (await app.request('/api/health')).json()) as { local_machine: boolean }).local_machine).toBe(false);
  });

  it('offre sans dossier, ou sans JSON (formulaire d’une page tierce) : refusé', async () => {
    const { db, app, open, acme } = prepare(true);
    const id = saveOffer(db, 'manual', 'without-folder', { title: 'Sans dossier' }, 'manual').offer.id;
    expect((await app.request(`/api/offers/${id}/open-folder`, json)).status).toBe(404);
    expect((await app.request(`/api/offers/${acme}/open-folder`, { method: 'POST', body: '{}' })).status).toBe(415);
    expect(open).toEqual([]);
  });

  it('programme selon le système', () => {
    expect(programOpening('win32')).toBe('explorer.exe');
    expect(programOpening('darwin')).toBe('open');
    expect(programOpening('linux')).toBe('xdg-open');
  });
});
