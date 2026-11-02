import { beforeAll, describe, expect, it } from 'vitest';
import { ouvrirBase, transaction, type Base } from '../src/db/base.ts';
import { ajouterNote, ajouterStatut, enregistrerOffre, modifierTags } from '../src/core/offres.ts';
import { listerOffres, meta, requeteFts } from '../src/core/requetes.ts';
import { noterEntree } from '../src/core/notation.ts';
import { creerApp } from '../src/api/serveur.ts';

describe('liste paginée', () => {
  let db: Base;
  beforeAll(() => {
    db = ouvrirBase(':memory:');
    transaction(db, () => {
      for (let i = 1; i <= 120; i++) {
        const { offre } = enregistrerOffre(
          db,
          i % 3 === 0 ? 'hellowork' : 'linkedin',
          String(100000 + i),
          {
            titre: i % 10 === 0 ? `Développeur WordPress ${i}` : `Ingénieur backend ${i}`,
            entreprise: `Société ${i % 7}`,
            contrat: i % 2 ? 'CDI' : 'Freelance',
            teletravail: i % 4 === 0 ? 'full remote' : 'hybride',
            recue_le: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
            description: i === 7 ? 'Maintenance d’applications PHP, accessibilité RGAA' : null,
          },
          'email',
        );
        if (i % 2 === 0) ajouterNote(db, offre.id, { note: (i % 11) * 0.5 });
        if (i % 5 === 0) ajouterStatut(db, offre.id, 'ecartee');
        if (i === 40) ajouterStatut(db, offre.id, 'envoyee');
        if (i % 6 === 0) modifierTags(db, offre.id, ['php'], []);
      }
    });
  });

  it('pagination et total', () => {
    const p1 = listerOffres(db, { taille: 50 });
    expect(p1.total).toBe(120);
    expect(p1.pages).toBe(3);
    expect(p1.offres).toHaveLength(50);
    const p3 = listerOffres(db, { taille: 50, page: 3 });
    expect(p3.offres).toHaveLength(20);
    const ids = new Set([...p1.offres, ...listerOffres(db, { taille: 50, page: 2 }).offres, ...p3.offres].map((o) => o.id));
    expect(ids.size).toBe(120);
  });

  it('tri par note décroissante, sans note en dernier', () => {
    const r = listerOffres(db, { tri: 'note', ordre: 'desc', taille: 120 });
    const notes = r.offres.map((o) => o.note);
    expect(notes[0]).toBe(5);
    expect(notes.slice(60).every((n) => n === null)).toBe(true);
    const asc = listerOffres(db, { tri: 'note', ordre: 'asc', taille: 1 });
    expect(asc.offres[0].note).toBe(0);
  });

  it('filtres combinés', () => {
    expect(listerOffres(db, { sources: ['hellowork'] }).total).toBe(40);
    expect(listerOffres(db, { statuts: ['ecartee'] }).total).toBe(23);
    expect(listerOffres(db, { noteMin: 4, noteMax: 5 }).offres.every((o) => o.note! >= 4 && o.note! <= 5)).toBe(true);
    expect(listerOffres(db, { sansNote: true }).total).toBe(60);
    expect(listerOffres(db, { tags: ['php'] }).total).toBe(20);
    expect(listerOffres(db, { teletravail: 'remote', contrat: 'freelance' }).total).toBe(30);
    expect(listerOffres(db, { recueDepuis: '2026-10-27', recueJusqua: '2026-10-28' }).total).toBe(8);
    expect(listerOffres(db, { mesCandidatures: true }).offres.map((o) => o.titre)).toEqual(['Développeur WordPress 40']);
  });

  it('recherche plein texte : accents ignorés, préfixes, guillemets neutralisés', () => {
    expect(listerOffres(db, { q: 'developpeur wordpress' }).total).toBe(12);
    expect(listerOffres(db, { q: 'accessibilite' }).offres.map((o) => o.id)).toHaveLength(1);
    expect(listerOffres(db, { q: 'ingé' }).total).toBe(108);
    expect(requeteFts('"OR" NEAR(')).toBe('"OR"* "NEAR"*');
    expect(listerOffres(db, { q: '" OR (' }).total).toBe(0);
  });

  it('meta : comptes par statut, source et tag', () => {
    const m = meta(db);
    expect(m.total).toBe(120);
    expect(m.tags).toEqual([{ valeur: 'php', n: 20 }]);
  });

  it('noter (format des lots) : la dernière note fait foi', () => {
    const r1 = noterEntree(db, { url: 'https://www.linkedin.com/jobs/view/100001/', note: 4 });
    expect(r1).toMatchObject({ creee: false, note: 4, statut: 'notee' });
    const r2 = noterEntree(db, { id: r1.id, note: '6,5', note_brute: 7, penalites: '-0,5' });
    expect(r2.note).toBe(6.5);
    expect(() => noterEntree(db, { id: r1.id, note: 12 })).toThrow(/0-10/);
    const nouvelle = noterEntree(db, { url: 'https://www.hellowork.com/fr-fr/emplois/9999.html', titre: 'Nouvelle', note: 5 });
    expect(nouvelle.creee).toBe(true);
  });

  it('API : liste, détail, statut, tags', async () => {
    const app = creerApp(db, { dossierDonnees: '/tmp' });
    const liste = (await (await app.request('/api/offres?source=hellowork&taille=5&tri=note&ordre=desc')).json()) as { total: number; offres: { id: number }[] };
    expect(liste.total).toBeGreaterThanOrEqual(40);
    expect(liste.offres).toHaveLength(5);
    const id = liste.offres[0].id;
    const st = await app.request(`/api/offres/${id}/statut`, {
      method: 'POST',
      body: JSON.stringify({ statut: 'go', commentaire: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(((await st.json()) as { statut: string }).statut).toBe('go');
    const tags = await app.request(`/api/offres/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags: ['a', 'b'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(((await tags.json()) as { tags: string[] }).tags).toEqual(['a', 'b']);
    const c = (await (await app.request(`/api/offres/${id}/candidater`, { method: "POST" })).json()) as { commande: string };
    expect(c.commande).toBe(`candidater ${id}`);
    expect((await app.request('/api/offres/999999')).status).toBe(404);
  });

  it('API : saisie de la note et de la candidature depuis l’interface', async () => {
    const app = creerApp(db, { dossierDonnees: '/tmp' });
    const id = (db.prepare("SELECT id FROM offres WHERE source = 'hellowork' ORDER BY id LIMIT 1").get() as { id: number }).id;
    const envoyer = (chemin: string, method: string, corps: unknown) =>
      app.request(`/api/offres/${id}/${chemin}`, { method, body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } });
    const n = (await (await envoyer('note', 'POST', { note: 5.5, note_brute: 6, penalites: '-0,5 trajet', colle: 'PHP', ecarts: 'sur site' })).json()) as {
      note: number;
      notes: { note: number; origine: string; colle: string }[];
    };
    expect(n.note).toBe(5.5);
    expect(n.notes[0]).toMatchObject({ note: 5.5, origine: 'interface', colle: 'PHP' });
    expect((await envoyer('note', 'POST', { note: 11 })).status).toBe(400);

    const c = (await (await envoyer('candidature', 'PUT', { prochaine_action: 'Relancer le 10/11', canal: 'Hellowork', envoyee_le: '03/11/2026' })).json()) as {
      statut: string;
      candidature: { prochaine_action: string; prochaine_action_origine: string; envoyee_le: string };
    };
    expect(c.statut).toBe('envoyee');
    expect(c.candidature).toMatchObject({ prochaine_action: 'Relancer le 10/11', prochaine_action_origine: 'interface', envoyee_le: '2026-11-03' });
    const efface = (await (await envoyer('candidature', 'PUT', { prochaine_action: null })).json()) as { candidature: { prochaine_action: null } };
    expect(efface.candidature.prochaine_action).toBeNull();
    expect((await envoyer('candidature', 'PUT', { canal: 3 })).status).toBe(400);
  });
});
