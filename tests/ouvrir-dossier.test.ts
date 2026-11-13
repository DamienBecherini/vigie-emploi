// Ouvrir le dossier de candidature dans l'explorateur de fichiers : seulement depuis la machine du serveur,
// seulement un dossier de l'espace, et le bon programme selon le système.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ouvrirBase } from '../src/db/base.ts';
import { trouverOffre, enregistrerOffre } from '../src/core/offres.ts';
import { importerHistorique } from '../src/import/historique.ts';
import { creerApp } from '../src/api/serveur.ts';
import { programmeOuverture } from '../src/api/ouvrir.ts';

const DONNEES = join(import.meta.dirname, 'fixtures', 'donnees');
const json = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

function preparer(estLocale: boolean) {
  const db = ouvrirBase(':memory:');
  importerHistorique(db, DONNEES);
  const ouverts: string[] = [];
  const app = creerApp(db, { dossierDonnees: DONNEES }, undefined, {
    estLocale: () => estLocale,
    ouvreur: async (absolu) => {
      ouverts.push(absolu);
    },
  });
  return { db, app, ouverts, acme: trouverOffre(db, 'linkedin', '4200000099')!.id };
}

describe('ouvrir le dossier de candidature', () => {
  it('depuis la machine du serveur : ouvre le dossier de l’offre, et /api/sante le signale', async () => {
    const { app, ouverts, acme } = preparer(true);
    expect(((await (await app.request('/api/sante')).json()) as { poste_local: boolean }).poste_local).toBe(true);
    const r = await app.request(`/api/offres/${acme}/ouvrir-dossier`, json);
    expect(r.status).toBe(200);
    expect(ouverts).toHaveLength(1);
    expect(ouverts[0].replace(/\\/g, '/')).toMatch(/candidatures\/acme-developpeur-php$/);
  });

  it('depuis une autre machine : refusé, rien n’est ouvert', async () => {
    const { app, ouverts, acme } = preparer(false);
    expect(((await (await app.request('/api/sante')).json()) as { poste_local: boolean }).poste_local).toBe(false);
    expect((await app.request(`/api/offres/${acme}/ouvrir-dossier`, json)).status).toBe(403);
    expect(ouverts).toEqual([]);
  });

  it('sans connexion réelle (requête de test), la requête n’est pas considérée comme locale', async () => {
    const db = ouvrirBase(':memory:');
    importerHistorique(db, DONNEES);
    const app = creerApp(db, { dossierDonnees: DONNEES });
    expect(((await (await app.request('/api/sante')).json()) as { poste_local: boolean }).poste_local).toBe(false);
  });

  it('offre sans dossier, ou sans JSON (formulaire d’une page tierce) : refusé', async () => {
    const { db, app, ouverts, acme } = preparer(true);
    const id = enregistrerOffre(db, 'manuel', 'sans-dossier', { titre: 'Sans dossier' }, 'manuel').offre.id;
    expect((await app.request(`/api/offres/${id}/ouvrir-dossier`, json)).status).toBe(404);
    expect((await app.request(`/api/offres/${acme}/ouvrir-dossier`, { method: 'POST', body: '{}' })).status).toBe(415);
    expect(ouverts).toEqual([]);
  });

  it('programme selon le système', () => {
    expect(programmeOuverture('win32')).toBe('explorer.exe');
    expect(programmeOuverture('darwin')).toBe('open');
    expect(programmeOuverture('linux')).toBe('xdg-open');
  });
});
