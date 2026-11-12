// API JSON locale et service de l'interface compilée (dist/ui).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
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
import { noteExemple, NIVEAUX, validerGrille } from '../core/grille.ts';
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
import { LANGUE_DEFAUT, tl, type CleServeur } from '../i18n/index.ts';
import { libelleNiveau } from '../i18n/libelles.ts';
import type { Params } from '../i18n/outil.ts';
import { Veille } from './veille.ts';
import { Diffusion, surveiller } from './diffusion.ts';
import { estActionAgent, etatTravail, lanceurTerminal, type Lanceur } from './travail.ts';

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

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]'];

/** Routes qui ne comptent pas comme activité (contrôle de santé, flux de notifications laissé ouvert). */
const ROUTES_PASSIVES = ['/api/sante', '/api/flux'];

export interface OptionsApp {
  /** Notifications poussées à l'interface (une instance neuve par défaut). */
  diffusion?: Diffusion;
  /** Ouverture du terminal de l'agent (par défaut : selon la configuration et la plateforme). */
  lanceur?: Lanceur;
}

/** Une requête qui vient d'une autre origine (page web tierce, formulaire) ? */
function origineEtrangere(origine: string | undefined, site: string | undefined): boolean {
  if (site === 'cross-site') return true;
  if (!origine || origine === 'null') return Boolean(origine);
  try {
    return !HOTES_LOCAUX.includes(new URL(origine).hostname.toLowerCase());
  } catch {
    return true;
  }
}

export function creerApp(
  db: Base,
  config: Pick<Config, 'dossierDonnees'> & Partial<Pick<Config, 'emails' | 'terminal' | 'langue'>>,
  veille: Veille = new Veille(0),
  options: OptionsApp = {},
): Hono {
  const app = new Hono();
  const diffusion = options.diffusion ?? new Diffusion();
  const lanceur = options.lanceur ?? lanceurTerminal(config.terminal, process.platform, config.langue ?? LANGUE_DEFAUT);
  const emails = config.emails ?? join(config.dossierDonnees, 'emails');
  // Langue des messages renvoyés à l'interface (celle-ci peut afficher une autre langue : sélecteur de l'en-tête).
  const langue = config.langue ?? LANGUE_DEFAUT;
  const m = (cle: CleServeur, params?: Params) => tl(langue, cle, params);

  app.onError((err, c) => c.json({ ok: false, erreur: err.message }, 400));

  // Serveur local : seules les requêtes adressées à localhost / 127.0.0.1 sont servies (parade au
  // « DNS rebinding » : une page web tierce ne peut pas lire l'API ni les fichiers du dossier).
  // Les écritures venues d'une autre origine (formulaire d'une page tierce) sont refusées.
  app.use('*', async (c, next) => {
    const hote = (c.req.header('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    if (hote && !HOTES_LOCAUX.includes(hote)) return c.text(m('api.hoteRefuse'), 403);
    const ecriture = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    if (ecriture && origineEtrangere(c.req.header('origin'), c.req.header('sec-fetch-site'))) {
      return c.json({ ok: false, erreur: m('api.origineRefusee') }, 403);
    }
    if (!ROUTES_PASSIVES.includes(c.req.path)) veille.signaler();
    await next();
    // Les écritures de l'API ne changent pas PRAGMA data_version pour sa propre connexion : on les signale ici.
    if (ecriture && c.req.path.startsWith('/api/') && !c.req.path.startsWith('/api/travail') && c.res.status < 400) {
      diffusion.emettre({ type: 'base' });
    }
  });

  // Notifications (Server-Sent Events) : « base » (données modifiées), « emails » (boîte de réception).
  app.get('/api/flux', (c) =>
    streamSSE(c, async (flux) => {
      let finir = () => {};
      const fini = new Promise<void>((r) => (finir = r));
      const desabonner = diffusion.abonner((n) => {
        flux.writeSSE({ event: n.type, data: JSON.stringify(n) }).catch(() => finir());
      });
      flux.onAbort(() => finir());
      await flux.writeSSE({ event: 'pret', data: '{}' });
      // Commentaire régulier : garde la connexion ouverte à travers les proxys (ne compte pas comme activité).
      const battement = setInterval(() => flux.write(': battement\n\n').catch(() => finir()), 25_000);
      await fini;
      clearInterval(battement);
      desabonner();
    }),
  );

  // Travail en attente pour l'agent, et lancement de l'agent dans un terminal (boutons de l'interface).
  app.get('/api/travail', (c) => c.json(etatTravail(db, { dossierDonnees: config.dossierDonnees, emails })));

  app.post('/api/travail/:action', async (c) => {
    const action = c.req.param('action');
    if (!estActionAgent(action)) return c.json({ ok: false, erreur: m('api.actionInconnue') }, 404);
    if (!(c.req.header('content-type') ?? '').includes('application/json')) {
      return c.json({ ok: false, erreur: m('api.jsonAttendu') }, 415);
    }
    await lanceur(action, config.dossierDonnees);
    return c.json({ ok: true, action });
  });

  // Contrat « service local » : état, occupation, temps avant l'arrêt automatique.
  app.get('/api/sante', (c) =>
    c.json({
      ok: true,
      dossier: config.dossierDonnees,
      etat: 'pret',
      contrat: 1,
      service: 'postuler-juste',
      langue,
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
    return d ? c.json(d) : c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
  });

  app.post('/api/offres/:id/statut', async (c) => {
    const id = Number(c.req.param('id'));
    const corps = (await c.req.json()) as { statut?: string; commentaire?: string };
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    if (!corps.statut || !estStatut(corps.statut)) return c.json({ ok: false, erreur: m('api.statutInconnu') }, 400);
    ajouterStatut(db, id, corps.statut, { commentaire: corps.commentaire ?? null, origine: 'interface' });
    return c.json(detailOffre(db, id));
  });

  app.put('/api/offres/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    const corps = (await c.req.json()) as { tags?: string[] };
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
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
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    modifierLien(db, id, corps.url ?? null);
    return c.json(detailOffre(db, id));
  });

  /** Bouton « Candidater » : passe l'offre en go et renvoie la commande à copier. */
  app.post('/api/offres/:id/candidater', (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    const r = preparerCandidature(db, config.dossierDonnees, id, 'interface');
    return c.json({ ok: true, commande: `candidater ${id}`, offre: r.offre });
  });

  /** Saisie ou correction d'une note depuis le panneau de détail (nouvelle entrée d'historique). */
  app.post('/api/offres/:id/note', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    const corps = (await c.req.json()) as Pick<EntreeLot, 'note' | 'note_brute' | 'penalites' | 'colle' | 'ecarts'>;
    const { note, note_brute, penalites, colle, ecarts } = corps;
    noterOffres(db, [{ id, note, note_brute, penalites, colle, ecarts, lu: true }], 'interface');
    return c.json(detailOffre(db, id));
  });

  /** Correction des sous-notes (et des entrées des critères calculés) : nouvelle note calculée avec la grille. */
  app.put('/api/offres/:id/sous-notes', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    const corps = (await c.req.json()) as SaisieSousNotes;
    modifierSousNotes(db, id, corps, 'interface', grilleObligatoire(db, config.dossierDonnees));
    return c.json(detailOffre(db, id));
  });

  // Grille de notation : version courante (avec les exemples calculés), aperçu, enregistrement, versions.
  const reponseGrille = (v: VersionGrille | null) =>
    v
      ? {
          ...v,
          niveaux: NIVEAUX.map((n) => ({ valeur: n, libelle: libelleNiveau(n, langue) })),
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
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    const corps = (await c.req.json()) as Record<string, unknown>;
    const champs: ChampsCandidature = {};
    for (const k of CHAMPS_EDITABLES) {
      if (!(k in corps)) continue;
      const v = corps[k];
      if (v !== null && typeof v !== 'string') return c.json({ ok: false, erreur: m('api.champTexte', { champ: k }) }, 400);
      champs[k] = v;
    }
    return c.json(suivreCandidature(db, id, champs, 'interface').offre);
  });

  // Journal de la candidature (événements et échéances).
  app.get('/api/offres/:id/evenements', (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    return c.json(journal(db, id));
  });

  app.post('/api/offres/:id/evenements', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
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
    if (!offreParId(db, id)) return c.json({ ok: false, erreur: m('api.offreIntrouvable') }, 404);
    return c.json(fichiersDossier(db, config.dossierDonnees, id));
  });

  app.get('/api/fichier/*', (c) => {
    const brut = new URL(c.req.url).pathname.slice('/api/fichier/'.length);
    let chemin: string;
    try {
      chemin = brut.split('/').map(decodeURIComponent).join('/');
    } catch {
      return c.text(m('api.cheminMalEncode'), 400);
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

  app.all('/api/*', (c) => c.json({ ok: false, erreur: m('api.routeInconnue') }, 404));

  // Interface compilée : fichiers de dist/ui, sinon index.html (application d'une seule page).
  app.get('*', (c) => {
    if (!existsSync(join(DOSSIER_UI, 'index.html'))) {
      return c.text(m('api.nonCompilee'), 503);
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
  /**
   * Serveur hébergé dans un autre processus (tableau de bord lancé par le serveur MCP faute de node séparé) :
   * messages sur stderr (stdout appartient au protocole MCP), port occupé rendu en erreur, et à l'arrêt automatique
   * seuls le serveur web et sa base se ferment, le processus continue.
   */
  heberge?: boolean;
}): Promise<{ port: number }> {
  const veille = new Veille((o.inactiviteMin ?? 0) * 60);
  const diffusion = new Diffusion();
  const arreterSurveillance = surveiller({ db: o.db, diffusion, base: o.config.base, emails: o.config.emails });
  const app = creerApp(o.db, o.config, veille, { diffusion });
  const langue = o.config.langue ?? LANGUE_DEFAUT;
  const hote = o.hote ?? '127.0.0.1';
  const dire = o.heberge ? (l: string) => process.stderr.write(`${l}\n`) : (l: string) => console.log(l);
  return new Promise((resolve, reject) => {
    const serveur = serve({ fetch: app.fetch, port: o.port, hostname: hote }, (info) => {
      dire(tl(langue, 'serveur.demarre', { port: info.port, dossier: o.config.dossierDonnees }));
      if (!o.heberge) dire(tl(langue, 'serveur.arreter'));
      resolve({ port: info.port });
    });
    serveur.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !o.heberge) {
        console.error(tl(langue, 'serveur.portUtilise', { port: o.port }));
        console.error(tl(langue, 'serveur.autrePort', { suivant: o.port + 1 }));
        process.exit(1);
      }
      clearInterval(surveillance);
      arreterSurveillance();
      reject(err);
    });
    const surveillance = setInterval(() => {
      if (!veille.expiree()) return;
      clearInterval(surveillance);
      dire(tl(langue, 'serveur.inactivite', { minutes: Math.round(veille.delaiS / 60) }));
      arreterSurveillance();
      serveur.close(() => {
        o.db.close();
        if (!o.heberge) process.exit(0);
      });
      if ('closeAllConnections' in serveur) serveur.closeAllConnections();  // sinon les connexions keep-alive retardent l'arrêt
    }, 1000);
    surveillance.unref();
  });
}
