import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ouvrirBase } from '../src/db/base.ts';
import { ajouterStatut, enregistrerCandidature, enregistrerOffre } from '../src/core/offres.ts';
import { creerApp } from '../src/api/serveur.ts';
import { Veille } from '../src/api/veille.ts';
import { Diffusion, regrouper, surveiller, type Notification } from '../src/api/diffusion.ts';
import { commandeTerminal, compterEmails, environnementPropre, etatTravail, lanceurTerminal, type ActionAgent } from '../src/api/travail.ts';

const temporaires: string[] = [];
function dossierTemporaire(): string {
  const d = mkdtempSync(join(tmpdir(), 'cap-emploi-agent-'));
  temporaires.push(d);
  return d;
}
afterAll(() => {
  for (const d of temporaires) rmSync(d, { recursive: true, force: true });
});

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend une notification du type voulu (ou échoue après delaiMs). */
function prochaine(diffusion: Diffusion, type: Notification['type'], delaiMs = 3000): Promise<Notification> {
  return new Promise((resolve, reject) => {
    const minuterie = setTimeout(() => {
      desabonner();
      reject(new Error(`Pas de notification « ${type} » en ${delaiMs} ms`));
    }, delaiMs);
    const desabonner = diffusion.abonner((n) => {
      if (n.type !== type) return;
      clearTimeout(minuterie);
      desabonner();
      resolve(n);
    });
  });
}

function donnees() {
  const dossier = dossierTemporaire();
  const emails = join(dossier, 'emails');
  mkdirSync(emails);
  const db = ouvrirBase(':memory:');
  const offre = (idSite: string) => enregistrerOffre(db, 'linkedin', idSite, { titre: 'Développeur API', entreprise: 'Kappa' }, 'manuel').offre.id;
  return { dossier, emails, db, offre };
}

const POST_JSON = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };

describe('travail en attente', () => {
  it('compte les .eml de la boîte de réception (0 si elle n’existe pas)', () => {
    const { emails } = donnees();
    expect(compterEmails(emails)).toBe(0);
    writeFileSync(join(emails, 'a.eml'), '');
    writeFileSync(join(emails, 'b.EML'), '');
    writeFileSync(join(emails, 'notes.txt'), '');
    expect(compterEmails(emails)).toBe(2);
    expect(compterEmails(join(emails, 'absent'))).toBe(0);
  });

  it('liste les offres en go dont le dossier n’existe pas encore', () => {
    const { dossier, emails, db, offre } = donnees();
    const sansCandidature = offre('1');
    const dossierAbsent = offre('2');
    const prete = offre('3');
    const notee = offre('4');
    for (const id of [sansCandidature, dossierAbsent, prete]) ajouterStatut(db, id, 'go');
    ajouterStatut(db, notee, 'notee');
    enregistrerCandidature(db, dossierAbsent, { dossier: 'candidatures/absent' });
    mkdirSync(join(dossier, 'candidatures', 'prete'), { recursive: true });
    enregistrerCandidature(db, prete, { dossier: 'candidatures/prete' });
    const etat = etatTravail(db, { dossierDonnees: dossier, emails });
    expect(etat.go_a_preparer.map((o) => o.id)).toEqual([sansCandidature, dossierAbsent]);
    expect(etat.go_a_preparer[0]).toEqual({ id: sansCandidature, titre: 'Développeur API', entreprise: 'Kappa' });
  });
});

describe('lancement de l’agent', () => {
  it('remplace {dossier} et {invite} dans la commande du terminal', () => {
    expect(commandeTerminal(['wt.exe', '-d', '{dossier}', 'claude', '{invite}'], 'D:/donnees', 'traiter-emails')).toEqual([
      'wt.exe', '-d', 'D:/donnees', 'claude', '/traiter-emails',
    ]);
  });

  it('le terminal ne reçoit pas les marqueurs de session de Claude Code', () => {
    const env = environnementPropre({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CONFIG_DIR: '/c' });
    expect(env).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: '/c' });
  });

  it('sans terminal configuré hors Windows : erreur explicite', async () => {
    await expect(lanceurTerminal(null, 'linux')('preparer-go', '/d')).rejects.toThrow(/claude \/preparer-go/);
  });

  it('un programme introuvable donne une erreur, pas un plantage', async () => {
    await expect(lanceurTerminal(['programme-introuvable-cap-emploi'])('traiter-emails', tmpdir())).rejects.toThrow(/Impossible d'ouvrir le terminal/);
  });

  it('POST /api/travail/:action lance l’action, et seulement une action connue en JSON', async () => {
    const { dossier, emails, db } = donnees();
    const lances: [ActionAgent, string][] = [];
    const app = creerApp(db, { dossierDonnees: dossier, emails }, new Veille(0), {
      lanceur: async (action, d) => void lances.push([action, d]),
    });
    expect((await app.request('/api/travail/traiter-emails', POST_JSON)).status).toBe(200);
    expect(lances).toEqual([['traiter-emails', dossier]]);
    expect((await app.request('/api/travail/rm-rf', POST_JSON)).status).toBe(404);
    expect((await app.request('/api/travail/preparer-go', { method: 'POST', body: 'x' })).status).toBe(415);
    expect(lances).toHaveLength(1);
  });

  it('une erreur du lanceur revient à l’interface', async () => {
    const { dossier, db } = donnees();
    const app = creerApp(db, { dossierDonnees: dossier }, new Veille(0), {
      lanceur: () => Promise.reject(new Error('wt.exe absent')),
    });
    const r = await app.request('/api/travail/preparer-go', POST_JSON);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ ok: false, erreur: 'wt.exe absent' });
  });

  it('GET /api/travail : e-mails et go à préparer', async () => {
    const { dossier, emails, db, offre } = donnees();
    writeFileSync(join(emails, 'alerte.eml'), '');
    ajouterStatut(db, offre('9'), 'go');
    const app = creerApp(db, { dossierDonnees: dossier, emails });
    const etat = (await (await app.request('/api/travail')).json()) as { emails: number; go_a_preparer: unknown[] };
    expect(etat.emails).toBe(1);
    expect(etat.go_a_preparer).toHaveLength(1);
  });
});

describe('écritures venues d’une autre origine', () => {
  const { dossier, db, offre } = donnees();
  const id = offre('origine');
  const lances: string[] = [];
  const app = creerApp(db, { dossierDonnees: dossier }, new Veille(0), { lanceur: async (a) => void lances.push(a) });
  const statut = (headers: Record<string, string>) =>
    app.request(`/api/offres/${id}/statut`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ statut: 'notee' }),
    });

  it('refusées depuis une page tierce (Origin ou Sec-Fetch-Site)', async () => {
    expect((await statut({ Origin: 'https://exemple.com' })).status).toBe(403);
    expect((await statut({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await app.request('/api/travail/traiter-emails', { ...POST_JSON, headers: { ...POST_JSON.headers, Origin: 'https://exemple.com' } })).status).toBe(403);
    expect(lances).toEqual([]);
  });

  it('acceptées depuis l’interface locale ou sans navigateur (CLI, tests)', async () => {
    expect((await statut({ Origin: 'http://localhost:4410', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect((await statut({ Origin: 'http://127.0.0.1:5173' })).status).toBe(200);
    expect((await statut({})).status).toBe(200);
  });

  it('les lectures ne sont pas concernées', async () => {
    expect((await app.request('/api/meta', { headers: { Origin: 'https://exemple.com' } })).status).toBe(200);
  });
});

describe('notifications', () => {
  it('regrouper : une rafale d’appels donne un seul déclenchement', async () => {
    let n = 0;
    const r = regrouper(() => n++, 30);
    r.declencher();
    r.declencher();
    r.declencher();
    await attendre(80);
    expect(n).toBe(1);
    r.declencher();
    r.arreter();
    await attendre(60);
    expect(n).toBe(1);
  });

  it('une écriture par l’API notifie « base » ; une lecture ou une erreur non', async () => {
    const { dossier, db, offre } = donnees();
    const id = offre('api');
    const diffusion = new Diffusion();
    const recues: Notification[] = [];
    diffusion.abonner((n) => recues.push(n));
    const app = creerApp(db, { dossierDonnees: dossier }, new Veille(0), { diffusion });
    await app.request(`/api/offres/${id}`);
    await app.request(`/api/offres/99999/statut`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"statut":"notee"}' });
    expect(recues).toEqual([]);
    await app.request(`/api/offres/${id}/statut`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"statut":"notee"}' });
    expect(recues).toEqual([{ type: 'base' }]);
  });

  it('une écriture d’un autre processus dans la base notifie « base » ; un e-mail déposé notifie « emails »', async () => {
    const dossier = dossierTemporaire();
    const emails = join(dossier, 'emails');
    mkdirSync(emails);
    const fichier = join(dossier, 'data', 'cap-emploi.sqlite');
    const serveur = ouvrirBase(fichier);
    const autre = ouvrirBase(fichier); // la CLI ou le serveur MCP de l'agent
    const diffusion = new Diffusion();
    const arreter = surveiller({ db: serveur, diffusion, base: fichier, emails, delaiMs: 50 });
    try {
      const base = prochaine(diffusion, 'base');
      enregistrerOffre(autre, 'linkedin', 'externe', { titre: 'Offre ajoutée par la CLI' }, 'manuel');
      await expect(base).resolves.toEqual({ type: 'base' });

      const courrier = prochaine(diffusion, 'emails');
      writeFileSync(join(emails, 'alerte.eml'), '');
      await expect(courrier).resolves.toEqual({ type: 'emails', nombre: 1 });
    } finally {
      arreter();
      serveur.close();
      autre.close();
    }
  });

  it('GET /api/flux : flux d’événements, premier message « pret », puis les notifications', async () => {
    const { dossier, db } = donnees();
    const diffusion = new Diffusion();
    const app = creerApp(db, { dossierDonnees: dossier }, new Veille(0), { diffusion });
    const r = await app.request('/api/flux');
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const lecteur = r.body!.getReader();
    const decodeur = new TextDecoder();
    let texte = '';
    while (!texte.includes('event: pret')) texte += decodeur.decode((await lecteur.read()).value);
    expect(diffusion.nombreAbonnes).toBe(1);
    diffusion.emettre({ type: 'emails', nombre: 3 });
    while (!texte.includes('event: emails')) texte += decodeur.decode((await lecteur.read()).value);
    expect(texte).toContain('data: {"type":"emails","nombre":3}');
    await lecteur.cancel();
  });

  it('le flux ne compte pas comme activité (l’arrêt automatique reste possible)', async () => {
    let t = 0;
    const veille = new Veille(60, () => t);
    const app = creerApp(ouvrirBase(':memory:'), { dossierDonnees: '/d' }, veille);
    t = 50;
    const r = await app.request('/api/flux');
    await r.body!.cancel();
    expect(veille.restantS()).toBe(10);
  });
});
