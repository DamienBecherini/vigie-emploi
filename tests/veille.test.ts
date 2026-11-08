import { describe, expect, it } from 'vitest';
import { creerApp } from '../src/api/serveur.ts';
import { Veille } from '../src/api/veille.ts';
import type { Base } from '../src/db/base.ts';

function horloge() {
  const h = { t: 0, lire: () => h.t };
  return h;
}

describe('Veille', () => {
  it('expire après le délai, une activité le repousse', () => {
    const h = horloge();
    const v = new Veille(3600, h.lire);
    h.t = 3599;
    expect(v.expiree()).toBe(false);
    v.signaler();
    h.t = 3599 + 3599;
    expect(v.expiree()).toBe(false);
    h.t = 3599 + 3600;
    expect(v.expiree()).toBe(true);
  });

  it('un délai de 0 désactive l’arrêt', () => {
    const h = horloge();
    const v = new Veille(0, h.lire);
    h.t = 1e9;
    expect(v.expiree()).toBe(false);
    expect(v.restantS()).toBeNull();
  });
});

describe('GET /api/sante', () => {
  type Sante = { version: string; inactivite: { delai_s: number; restant_s: number | null } };
  const sante = async (app: ReturnType<typeof creerApp>) => (await (await app.request('/api/sante')).json()) as Sante;

  it('suit le contrat « service local » et garde les anciens champs', async () => {
    const d = await sante(creerApp({} as Base, { dossierDonnees: '/d' }, new Veille(3600, () => 0)));
    expect(d).toMatchObject({ ok: true, dossier: '/d', etat: 'pret', contrat: 1, service: 'cap-emploi', occupe: false, activite: '' });
    expect(d.inactivite).toEqual({ delai_s: 3600, restant_s: 3600 });
    expect(typeof d.version).toBe('string');
  });

  it('le contrôle de santé ne relance pas le délai, une autre requête si', async () => {
    const h = horloge();
    const app = creerApp({} as Base, { dossierDonnees: '/d' }, new Veille(3600, h.lire));
    h.t = 600;
    expect((await sante(app)).inactivite.restant_s).toBe(3000);
    h.t = 700;
    expect((await sante(app)).inactivite.restant_s).toBe(2900);
    await app.request('/inconnu', { method: 'POST' });
    expect((await sante(app)).inactivite.restant_s).toBe(3600);
  });

  it('sans arrêt automatique, pas de décompte', async () => {
    const d = await sante(creerApp({} as Base, { dossierDonnees: '/d' }));
    expect(d.inactivite).toEqual({ delai_s: 0, restant_s: null });
  });
});
