import { beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, transaction, type Database } from '../src/db/database.ts';
import { addScore, addStatus, saveOffer, updateTags } from '../src/core/offers.ts';
import { listOffers, meta, levelsSort, requestFts } from '../src/core/queries.ts';
import { scoreInput } from '../src/core/scoring.ts';
import { createApp } from '../src/api/server.ts';

describe('liste paginée', () => {
  let db: Database;
  beforeAll(() => {
    db = openDatabase(':memory:');
    transaction(db, () => {
      for (let i = 1; i <= 120; i++) {
        const { offer } = saveOffer(
          db,
          i % 3 === 0 ? 'hellowork' : 'linkedin',
          String(100000 + i),
          {
            title: i % 10 === 0 ? `Développeur WordPress ${i}` : `Ingénieur backend ${i}`,
            company: `Société ${i % 7}`,
            contract: i % 2 ? 'CDI' : 'Freelance',
            remote: i % 4 === 0 ? 'full remote' : 'hybride',
            received_at: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
            description: i === 7 ? 'Maintenance d’applications PHP, accessibilité RGAA' : null,
          },
          'email',
        );
        if (i % 2 === 0) addScore(db, offer.id, { score: (i % 11) * 0.5 });
        if (i % 5 === 0) addStatus(db, offer.id, 'dismissed');
        if (i === 40) addStatus(db, offer.id, 'sent');
        if (i % 6 === 0) updateTags(db, offer.id, ['php'], []);
      }
    });
  });

  it('pagination et total', () => {
    const p1 = listOffers(db, { size: 50 });
    expect(p1.total).toBe(120);
    expect(p1.pages).toBe(3);
    expect(p1.offers).toHaveLength(50);
    const p3 = listOffers(db, { size: 50, page: 3 });
    expect(p3.offers).toHaveLength(20);
    const ids = new Set([...p1.offers, ...listOffers(db, { size: 50, page: 2 }).offers, ...p3.offers].map((o) => o.id));
    expect(ids.size).toBe(120);
  });

  it('tri par note décroissante, sans note en dernier', () => {
    const r = listOffers(db, { sort: 'score', order: 'desc', size: 120 });
    const scores = r.offers.map((o) => o.score);
    expect(scores[0]).toBe(5);
    expect(scores.slice(60).every((n) => n === null)).toBe(true);
    const asc = listOffers(db, { sort: 'score', order: 'asc', size: 1 });
    expect(asc.offers[0].score).toBe(0);
  });

  it('tri sur deux niveaux : date de réception, puis note à date égale', () => {
    const r = listOffers(db, { sort: 'received_at:desc,score:desc', size: 120 });
    const lines = r.offers.map((o) => ({ date: o.received_at as string, score: o.score }));
    for (let k = 1; k < lines.length; k++) {
      const [a, b] = [lines[k - 1], lines[k]];
      expect(a.date >= b.date).toBe(true);
      if (a.date === b.date && a.score !== null && b.score !== null) expect(a.score).toBeGreaterThanOrEqual(b.score);
      if (a.date === b.date && a.score === null) expect(b.score).toBeNull();
    }
    const asc = listOffers(db, { sort: 'received_at:asc,score:asc', size: 5 });
    expect(asc.offers[0].received_at).toBe('2026-10-01');
  });

  it('niveaux de tri : sens par défaut, colonnes inconnues et doublons ignorés', () => {
    expect(levelsSort('received_at,score:asc', 'desc')).toEqual([
      { column: 'received_at', order: 'desc' },
      { column: 'score', order: 'asc' },
    ]);
    expect(levelsSort('score, unknown ,score:asc', 'asc')).toEqual([{ column: 'score', order: 'asc' }]);
    expect(levelsSort('score;DROP TABLE offers')).toEqual([{ column: 'received_at', order: 'desc' }]);
    expect(levelsSort(undefined)).toEqual([{ column: 'received_at', order: 'desc' }]);
  });

  it('filtres combinés', () => {
    expect(listOffers(db, { sources: ['hellowork'] }).total).toBe(40);
    expect(listOffers(db, { statuses: ['dismissed'] }).total).toBe(23);
    expect(listOffers(db, { scoreMin: 4, scoreMax: 5 }).offers.every((o) => o.score! >= 4 && o.score! <= 5)).toBe(true);
    expect(listOffers(db, { unscored: true }).total).toBe(60);
    expect(listOffers(db, { tags: ['php'] }).total).toBe(20);
    expect(listOffers(db, { remote: 'remote', contract: 'freelance' }).total).toBe(30);
    expect(listOffers(db, { receivedFrom: '2026-10-27', receivedUntil: '2026-10-28' }).total).toBe(8);
    expect(listOffers(db, { myApplications: true }).offers.map((o) => o.title)).toEqual(['Développeur WordPress 40']);
  });

  it('recherche plein texte : accents ignorés, préfixes, guillemets neutralisés', () => {
    expect(listOffers(db, { q: 'developpeur wordpress' }).total).toBe(12);
    expect(listOffers(db, { q: 'accessibilite' }).offers.map((o) => o.id)).toHaveLength(1);
    expect(listOffers(db, { q: 'ingé' }).total).toBe(108);
    expect(requestFts('"OR" NEAR(')).toBe('"OR"* "NEAR"*');
    expect(listOffers(db, { q: '" OR (' }).total).toBe(0);
  });

  it('meta : comptes par statut, source et tag', () => {
    const m = meta(db);
    expect(m.total).toBe(120);
    expect(m.tags).toEqual([{ value: 'php', n: 20 }]);
  });

  it('noter (format des lots) : la dernière note fait foi', () => {
    const r1 = scoreInput(db, { url: 'https://www.linkedin.com/jobs/view/100001/', score: 4 });
    expect(r1).toMatchObject({ created: false, score: 4, status: 'scored' });
    const r2 = scoreInput(db, { id: r1.id, score: '6,5', raw_score: 7, penalties: '-0,5' });
    expect(r2.score).toBe(6.5);
    expect(() => scoreInput(db, { id: r1.id, score: 12 })).toThrow(/0-10/);
    const created = scoreInput(db, { url: 'https://www.hellowork.com/fr-fr/emplois/9999.html', title: 'Nouvelle', score: 5 });
    expect(created.created).toBe(true);
  });

  it('noter par id : les champs du lot complètent ceux qui manquent, sans écraser', () => {
    const { offer } = saveOffer(db, 'linkedin', '777001', { title: 'Développeur PHP', location: 'Paris' }, 'email');
    scoreInput(db, { id: offer.id, score: 5, company: 'Satelia', location: 'Lyon', contract: 'CDI' });
    const after = listOffers(db, { q: 'Satelia', size: 5 }).offers.find((o) => o.id === offer.id)!;
    expect(after).toMatchObject({ company: 'Satelia', contract: 'CDI', location: 'Paris', title: 'Développeur PHP' });
  });

  it('API : liste, détail, statut, tags', async () => {
    const app = createApp(db, { dataDir: '/tmp' });
    const list = (await (await app.request('/api/offers?source=hellowork&size=5&sort=score&order=desc')).json()) as { total: number; offers: { id: number }[] };
    expect(list.total).toBeGreaterThanOrEqual(40);
    expect(list.offers).toHaveLength(5);
    const id = list.offers[0].id;
    const st = await app.request(`/api/offers/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'go', comment: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(((await st.json()) as { status: string }).status).toBe('go');
    const tags = await app.request(`/api/offers/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags: ['a', 'b'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(((await tags.json()) as { tags: string[] }).tags).toEqual(['a', 'b']);
    const c = (await (await app.request(`/api/offers/${id}/apply`, { method: "POST" })).json()) as { command: string };
    expect(c.command).toBe(`apply ${id}`);
    expect((await app.request('/api/offers/999999')).status).toBe(404);
  });

  it('API : saisie de la note et de la candidature depuis l’interface', async () => {
    const app = createApp(db, { dataDir: '/tmp' });
    const id = (db.prepare("SELECT id FROM offers WHERE source = 'hellowork' ORDER BY id LIMIT 1").get() as { id: number }).id;
    const send = (path: string, method: string, body: unknown) =>
      app.request(`/api/offers/${id}/${path}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    const n = (await (await send('score', 'POST', { score: 5.5, raw_score: 6, penalties: '-0,5 trajet', fit: 'PHP', gaps: 'sur site' })).json()) as {
      score: number;
      scores: { score: number; origin: string; fit: string }[];
    };
    expect(n.score).toBe(5.5);
    expect(n.scores[0]).toMatchObject({ score: 5.5, origin: 'interface', fit: 'PHP' });
    expect((await send('score', 'POST', { score: 11 })).status).toBe(400);

    const c = (await (await send('application', 'PUT', { next_action: 'Relancer le 10/11', channel: 'Hellowork', sent_at: '03/11/2026' })).json()) as {
      status: string;
      application: { next_action: string; next_action_origin: string; sent_at: string };
    };
    expect(c.status).toBe('sent');
    expect(c.application).toMatchObject({ next_action: 'Relancer le 10/11', next_action_origin: 'interface', sent_at: '2026-11-03' });
    const cleared = (await (await send('application', 'PUT', { next_action: null })).json()) as { application: { next_action: null } };
    expect(cleared.application.next_action).toBeNull();
    expect((await send('application', 'PUT', { channel: 3 })).status).toBe(400);
  });
});
