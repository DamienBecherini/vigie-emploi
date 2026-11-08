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
import {
  ajouterStatut,
  CHAMPS_CANDIDATURE,
  detailOffre,
  modifierLien,
  modifierTags,
  offreParId,
  tagsOffre,
  type ChampsCandidature,
} from '../core/offres.ts';
import { estStatut, STATUTS } from '../core/statuts.ts';
import { modifierSousNotes, noterOffres, preparerCandidature, suivreCandidature, type SaisieSousNotes } from '../core/actions.ts';
import { noteExemple, LIBELLES_NIVEAUX, NIVEAUX, validerGrille } from '../core/grille.ts';
import {
  apercuGrille,
  enregistrerGrille,
  grilleCourante,
  grilleObligatoire,
  historiqueGrille,
  restaurerGrille,
  versionGrille,
  type VersionGrille,
} from '../core/grille-stockage.ts';
import type { EntreeLot } from '../core/notation.ts';
import {
  ajouterEvenement,
  echeances,
  evenementOuErreur,
  journal,
  marquerFait,
  modifierEvenement,
  supprimerEvenement,
  type SaisieEvenement,
} from '../core/evenements.ts';
import { fichierSur, fichiersDossier } from '../core/fichiers.ts';
import { statistiques } from '../core/statistiques.ts';
import { pageFichier } from './fichier.ts';
import { Veille } from './veille.ts';

/** Champs de candidature modifiables depuis l'interface. */
const CHAMPS_EDITABLES = CHAMPS_CANDIDATURE.filter((k) => k !== 'etat' && k !== 'libelle');

const DOSSIER_UI = join(RACINE_APP, 'dist', 'ui');
const VERSION = (JSON.parse(readFileSync(join(RACINE_APP, 'package.json'), 'utf8')) as { version: string }).version;

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

export function creerApp(db: Base, config: Pick<Config, 'dossierDonnees'>, veille: Veille = new Veille(0)): Hono {
  const app = new Hono();

  app.onError((err, c) => c.json({ ok: false, erreur: err.message }, 400));

  // Serveur local : seules les requêtes adressées à localhost / 127.0.0.1 sont servies (parade au
  // « DNS rebinding » : une page web tierce ne peut pas lire l'API ni les fichiers du dossier).
  app.use('*', async (c, next) => {
    const hote = (c.req.header('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    if (hote && !['localhost', '127.0.0.1', '[::1]'].includes(hote)) return c.text('Hôte refusé', 403);
    if (c.req.path !== '/api/sante') veille.signaler();
    await next();
  });

  // Contrat « service local » : état, occupation, temps avant l'arrêt automatique.
  app.get('/api/sante', (c) =>
    c.json({
      ok: true,
      dossier: config.dossierDonnees,
      etat: 'pret',
      contrat: 1,
      service: 'cap-emploi',
      version: VERSION,
      occupe: false,
      activite: '',
      inactivite: { delai_s: veille.delaiS, restant_s: veille.restantS() },
    }),
  );
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

  app.put('/api/offres/:id/lien', async (c) => {
    const id = Number(c.req.param('id'));
    const corps = (await c.req.json()) as { url?: string | null };
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    modifierLien(db, id, corps.url ?? null);
    return c.json(detailOffre(db, id));
  });

  /** Bouton « Candidater » : passe l'offre en go et renvoie la commande à copier. */
  app.post('/api/offres/:id/candidater', (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const r = preparerCandidature(db, config.dossierDonnees, id, 'interface');
    return c.json({ ok: true, commande: `candidater ${id}`, offre: r.offre });
  });

  /** Saisie ou correction d'une note depuis le panneau de détail (nouvelle entrée d'historique). */
  app.post('/api/offres/:id/note', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const corps = (await c.req.json()) as Pick<EntreeLot, 'note' | 'note_brute' | 'penalites' | 'colle' | 'ecarts'>;
    const { note, note_brute, penalites, colle, ecarts } = corps;
    noterOffres(db, [{ id, note, note_brute, penalites, colle, ecarts, lu: true }], 'interface');
    return c.json(detailOffre(db, id));
  });

  /** Correction des sous-notes (et des entrées des critères calculés) : nouvelle note calculée avec la grille. */
  app.put('/api/offres/:id/sous-notes', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const corps = (await c.req.json()) as SaisieSousNotes;
    modifierSousNotes(db, id, corps, 'interface', grilleObligatoire(db, config.dossierDonnees));
    return c.json(detailOffre(db, id));
  });

  // Grille de notation : version courante (avec les exemples calculés), aperçu, enregistrement, versions.
  const reponseGrille = (v: VersionGrille | null) =>
    v
      ? {
          ...v,
          niveaux: NIVEAUX.map((n) => ({ valeur: n, libelle: LIBELLES_NIVEAUX[n] })),
          exemples: v.grille.exemples.map((e) => noteExemple(v.grille, e, v.version)),
        }
      : { version: null, grille: null, exemples: [] };

  app.get('/api/grille', (c) => c.json(reponseGrille(grilleCourante(db, config.dossierDonnees))));

  app.post('/api/grille/apercu', async (c) => {
    const corps = (await c.req.json()) as { grille?: unknown };
    const courante = grilleObligatoire(db, config.dossierDonnees);
    return c.json(apercuGrille(db, validerGrille(corps.grille), courante.grille.seuil));
  });

  app.put('/api/grille', async (c) => {
    const corps = (await c.req.json()) as { grille?: unknown; resume?: string };
    const r = enregistrerGrille(db, config.dossierDonnees, corps.grille, { auteur: 'interface', resume: corps.resume ?? '' });
    return c.json({ ok: true, ...reponseGrille(r.version), impact: r.impact });
  });

  app.get('/api/grille/historique', (c) => {
    grilleCourante(db, config.dossierDonnees);
    return c.json(historiqueGrille(db));
  });

  app.get('/api/grille/versions/:v', (c) => c.json(versionGrille(db, Number(c.req.param('v')))));

  app.post('/api/grille/restaurer', async (c) => {
    const corps = (await c.req.json()) as { version?: number; resume?: string };
    const r = restaurerGrille(db, config.dossierDonnees, Number(corps.version), { auteur: 'interface', resume: corps.resume });
    return c.json({ ok: true, ...reponseGrille(r.version), impact: r.impact });
  });

  /** Candidature : prochaine action, date d'envoi, canal… (null ou '' efface un champ, absent = inchangé). */
  app.put('/api/offres/:id/candidature', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const corps = (await c.req.json()) as Record<string, unknown>;
    const champs: ChampsCandidature = {};
    for (const k of CHAMPS_EDITABLES) {
      if (!(k in corps)) continue;
      const v = corps[k];
      if (v !== null && typeof v !== 'string') return c.json({ ok: false, erreur: `Champ ${k} : texte attendu` }, 400);
      champs[k] = v;
    }
    return c.json(suivreCandidature(db, id, champs, 'interface').offre);
  });

  // Journal de la candidature (événements et échéances).
  app.get('/api/offres/:id/evenements', (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    return c.json(journal(db, id));
  });

  app.post('/api/offres/:id/evenements', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    const corps = (await c.req.json()) as SaisieEvenement;
    ajouterEvenement(db, id, corps, 'interface');
    return c.json(detailOffre(db, id));
  });

  app.put('/api/evenements/:id', async (c) => {
    const e = evenementOuErreur(db, Number(c.req.param('id')));
    const corps = (await c.req.json()) as SaisieEvenement;
    modifierEvenement(db, e.id, corps);
    return c.json(detailOffre(db, e.offre_id));
  });

  app.post('/api/evenements/:id/fait', async (c) => {
    const e = evenementOuErreur(db, Number(c.req.param('id')));
    const corps = (await c.req.json().catch(() => ({}))) as { fait?: boolean };
    marquerFait(db, e.id, corps.fait ?? true);
    return c.json(detailOffre(db, e.offre_id));
  });

  app.delete('/api/evenements/:id', (c) => {
    const e = supprimerEvenement(db, Number(c.req.param('id')));
    return c.json(detailOffre(db, e.offre_id));
  });

  app.get('/api/echeances', (c) => c.json(echeances(db, { jours: nombre(c.req.query('jours')) ?? 7 })));

  app.get('/api/statistiques', (c) => c.json(statistiques(db)));

  // Fichiers du dossier de candidature : liste, puis lecture (dossier de données uniquement).
  app.get('/api/offres/:id/fichiers', (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: 'Offre introuvable' }, 404);
    return c.json(fichiersDossier(db, config.dossierDonnees, id));
  });

  app.get('/api/fichier/*', (c) => {
    const brut = new URL(c.req.url).pathname.slice('/api/fichier/'.length);
    let chemin: string;
    try {
      chemin = brut.split('/').map(decodeURIComponent).join('/');
    } catch {
      return c.text('Chemin mal encodé', 400);
    }
    let fichier: { absolu: string; relatif: string };
    try {
      fichier = fichierSur(config.dossierDonnees, chemin);
    } catch (e) {
      const message = (e as Error).message;
      return c.text(message, /introuvable/i.test(message) ? 404 : 403);
    }
    const p = pageFichier(fichier.absolu, fichier.relatif, { brut: c.req.query('brut') === '1' });
    return c.body(p.corps, 200, p.entetes);
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

export function demarrerServeur(o: {
  db: Base;
  config: Config;
  port: number;
  hote?: string;
  /** Minutes sans activité avant l'arrêt (0 ou absent : jamais). */
  inactiviteMin?: number;
}): Promise<void> {
  const veille = new Veille((o.inactiviteMin ?? 0) * 60);
  const app = creerApp(o.db, o.config, veille);
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
    const surveillance = setInterval(() => {
      if (!veille.expiree()) return;
      clearInterval(surveillance);
      console.log(`Aucune activité depuis ${Math.round(veille.delaiS / 60)} min : arrêt du tableau de bord.`);
      serveur.close(() => {
        o.db.close();
        process.exit(0);
      });
      if ('closeAllConnections' in serveur) serveur.closeAllConnections();  // sinon les connexions keep-alive retardent l'arrêt
    }, 1000);
    surveillance.unref();
  });
}
