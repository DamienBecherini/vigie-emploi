// API JSON locale et service de l'interface compilée (dist/ui).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import type { Config } from '../core/config.ts';
import { RACINE_APP } from '../core/config.ts';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { listerOffres, meta, type OptionsListe } from '../core/requetes.ts';
import { ajouterStatut, detailOffre, modifierTags, offreParId, tagsOffre } from '../core/offres.ts';
import { estStatut, STATUTS } from '../core/statuts.ts';

const DOSSIER_UI = join(RACINE_APP, 'dist', 'ui');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function nombre(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function liste(v: string | undefined): string[] | undefined {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

/** Paramètres d'URL → options de liste (mêmes noms que dans l'interface). */
export function optionsDepuisRequete(q: Record<string, string | undefined>): OptionsListe {
  return {
    statuts: liste(q.statut),
    sources: liste(q.source),
    tags: liste(q.tag),
    noteMin: nombre(q.noteMin),
    noteMax: nombre(q.noteMax),
    sansNote: q.sansNote === '1' ? true : q.sansNote === '0' ? false : undefined,
    contrat: q.contrat || undefined,
    teletravail: q.teletravail || undefined,
    q: q.q || undefined,
    recueDepuis: q.recueDepuis || undefined,
    recueJusqua: q.recueJusqua || undefined,
    publieeDepuis: q.publieeDepuis || undefined,
    publieeJusqua: q.publieeJusqua || undefined,
    mesCandidatures: q.candidatures === '1',
    page: nombre(q.page),
    taille: nombre(q.taille),
    tri: q.tri || undefined,
    ordre: q.ordre === 'asc' ? 'asc' : 'desc',
  };
}

export function creerApp(db: Base, config: Pick<Config, 'dossierDonnees'>): Hono {
  const app = new Hono();

  app.onError((err, c) => c.json({ ok: false, erreur: err.message }, 400));

  app.get('/api/sante', (c) => c.json({ ok: true, dossier: config.dossierDonnees }));
  app.get('/api/meta', (c) => c.json({ ...meta(db), statutsPossibles: STATUTS }));
  app.get('/api/offres', (c) => c.json(listerOffres(db, optionsDepuisRequete(c.req.query()))));

  app.get('/api/offres/:id', (c) => {
    const d = detailOffre(db, Number(c.req.param('id')));
    return d ? c.json(d) : c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
  });

  app.post('/api/offres/:id/statut', async (c) => {
    const id = Number(c.req.param('id'));
    const corps = (await c.req.json()) as { statut?: string; commentaire?: string };
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    if (!corps.statut || !estStatut(corps.statut)) return c.json({ ok: false, erreur: 'Statut inconnu' }, 400);
    ajouterStatut(db, id, corps.statut, { commentaire: corps.commentaire ?? null, origine: 'interface' });
    return c.json(detailOffre(db, id));
  });

  app.put('/api/offres/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    const corps = (await c.req.json()) as { tags?: string[] };
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const voulus = new Set((corps.tags ?? []).map((t) => String(t)));
    const actuels = tagsOffre(db, id);
    const tags = transaction(db, () =>
      modifierTags(
        db,
        id,
        [...voulus].filter((t) => !actuels.includes(t)),
        actuels.filter((t) => !voulus.has(t)),
      ),
    );
    return c.json({ ok: true, tags });
  });

  /** Bouton « Candidater » : passe l'offre en go et renvoie la commande à copier. */
  app.post('/api/offres/:id/candidater', (c) => {
    const id = Number(c.req.param('id'));
    const o = offreParId(db, id);
    if (!o) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    if (['nouvelle', 'a-lire', 'notee', 'ecartee'].includes(o.statut)) {
      ajouterStatut(db, id, 'go', { commentaire: 'bouton Candidater', origine: 'interface' });
    }
    return c.json({ ok: true, commande: `candidater ${id}`, offre: detailOffre(db, id) });
  });

  app.all('/api/*', (c) => c.json({ ok: false, erreur: 'Route inconnue' }, 404));

  // Interface compilée : fichiers de dist/ui, sinon index.html (application d'une seule page).
  app.get('*', (c) => {
    if (!existsSync(join(DOSSIER_UI, 'index.html'))) {
      return c.text("Interface non compilée : lancer « npm run build » dans le dossier de cap-emploi.", 503);
    }
    const demande = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^[\\/]+/, '');
    let chemin = join(DOSSIER_UI, demande);
    if (!chemin.startsWith(DOSSIER_UI + sep) || !existsSync(chemin) || !statSync(chemin).isFile()) {
      chemin = join(DOSSIER_UI, 'index.html');
    }
    const type = TYPES[extname(chemin)] ?? 'application/octet-stream';
    const cache = chemin.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(readFileSync(chemin), 200, { 'Content-Type': type, 'Cache-Control': cache });
  });

  return app;
}

export function demarrerServeur(o: { db: Base; config: Config; port: number; hote?: string }): Promise<void> {
  const app = creerApp(o.db, o.config);
  const hote = o.hote ?? '127.0.0.1';
  return new Promise((resolve, reject) => {
    const serveur = serve({ fetch: app.fetch, port: o.port, hostname: hote }, (info) => {
      console.log(`Tableau de bord : http://localhost:${info.port}/  (données : ${o.config.dossierDonnees})`);
      console.log('Ctrl+C pour arrêter.');
      resolve();
    });
    serveur.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Le port ${o.port} est déjà utilisé : le tableau de bord tourne sans doute déjà sur http://localhost:${o.port}/`);
        console.error(`Sinon, choisissez un autre port : cap-emploi serve --port ${o.port + 1}`);
        process.exit(1);
      }
      reject(err);
    });
  });
}
