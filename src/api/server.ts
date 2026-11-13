// API JSON locale et service de l'interface compilée (dist/ui).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import type { Config } from '../core/config.ts';
import { APP_ROOT } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { listOffers, meta, type OptionsList } from '../core/queries.ts';
import {
  addStatus,
  FIELDS_APPLICATION,
  detailOffer,
  updateLink,
  updateTags,
  offerById,
  tagsOffer,
  type FieldsApplication,
} from '../core/offers.ts';
import { isStatus, STATUSES } from '../core/statuses.ts';
import { updateSubScores, scoreOffers, prepareApplication, trackApplication, type InputSubScores } from '../core/actions.ts';
import { scoreExample, LEVELS, validateRubric } from '../core/rubric.ts';
import {
  previewRubric,
  saveRubric,
  rubricCurrent,
  rubricRequired,
  historyRubric,
  restoreRubric,
  versionRubric,
  type VersionRubric,
} from '../core/rubric-storage.ts';
import type { InputBatch } from '../core/scoring.ts';
import {
  addEvent,
  deadlines,
  eventOrError,
  journal,
  markDone,
  updateEvent,
  deleteEvent,
  type EventInput,
} from '../core/events.ts';
import { safeFolder, safeFile, filesFolder } from '../core/files.ts';
import { statistics } from '../core/statistics.ts';
import { pageFile } from './file.ts';
import { LANGUAGE_DEFAULT, tl, type KeyServer } from '../i18n/index.ts';
import { labelLevel } from '../i18n/labels.ts';
import type { Params } from '../i18n/tool.ts';
import { Idle } from './idle.ts';
import { Broadcast, watchChanges } from './broadcast.ts';
import { isActionAgent, stateWork, launcherTerminal, type Launcher } from './work.ts';
import { openerSystem, programOpening, requestLocale, type OpenerFolder } from './open.ts';

/** Champs de candidature modifiables depuis l'interface. */
const FIELDS_EDITABLE = FIELDS_APPLICATION.filter((k) => k !== 'state' && k !== 'label');

const FOLDER_UI = join(APP_ROOT, 'dist', 'ui');
const VERSION = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version;

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

function number(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function list(v: string | undefined): string[] | undefined {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

/** Paramètres d'URL → options de liste (mêmes noms que dans l'interface). */
export function optionsFromRequest(q: Record<string, string | undefined>): OptionsList {
  return {
    statuses: list(q.status),
    sources: list(q.source),
    tags: list(q.tag),
    scoreMin: number(q.scoreMin),
    scoreMax: number(q.scoreMax),
    unscored: q.unscored === '1' ? true : q.unscored === '0' ? false : undefined,
    contract: q.contract || undefined,
    remote: q.remote || undefined,
    q: q.q || undefined,
    receivedFrom: q.receivedFrom || undefined,
    receivedUntil: q.receivedUntil || undefined,
    publishedFrom: q.publishedFrom || undefined,
    publishedUntil: q.publishedUntil || undefined,
    myApplications: q.applications === '1',
    page: number(q.page),
    size: number(q.size),
    sort: q.sort || undefined,
    order: q.order === 'asc' ? 'asc' : 'desc',
  };
}

const HOSTS_LOCAL = ['localhost', '127.0.0.1', '[::1]'];

/** Routes qui ne comptent pas comme activité (contrôle de santé, flux de notifications laissé ouvert). */
const ROUTES_PASSIVE = ['/api/health', '/api/stream'];

export interface OptionsApp {
  /** Notifications poussées à l'interface (une instance neuve par défaut). */
  broadcast?: Broadcast;
  /** Ouverture du terminal de l'agent (par défaut : selon la configuration et la plateforme). */
  launcher?: Launcher;
  /** Ouverture d'un dossier dans l'explorateur de fichiers (par défaut : celui du système). */
  opener?: OpenerFolder;
  /** La requête vient-elle de la machine du serveur ? (par défaut : adresse de la connexion). */
  isLocale?: (c: Context) => boolean;
}

/** Une requête qui vient d'une autre origine (page web tierce, formulaire) ? */
function originForeign(origin: string | undefined, site: string | undefined): boolean {
  if (site === 'cross-site') return true;
  if (!origin || origin === 'null') return Boolean(origin);
  try {
    return !HOSTS_LOCAL.includes(new URL(origin).hostname.toLowerCase());
  } catch {
    return true;
  }
}

export function createApp(
  db: Database,
  config: Pick<Config, 'dataDir'> & Partial<Pick<Config, 'emails' | 'terminal' | 'language'>>,
  idle: Idle = new Idle(0),
  options: OptionsApp = {},
): Hono {
  const app = new Hono();
  const broadcast = options.broadcast ?? new Broadcast();
  const launcher = options.launcher ?? launcherTerminal(config.terminal, process.platform, config.language ?? LANGUAGE_DEFAULT);
  const opener = options.opener ?? openerSystem();
  const isLocale = options.isLocale ?? requestLocale;
  const emails = config.emails ?? join(config.dataDir, 'emails');
  // Langue des messages renvoyés à l'interface (celle-ci peut afficher une autre langue : sélecteur de l'en-tête).
  const language = config.language ?? LANGUAGE_DEFAULT;
  const m = (key: KeyServer, params?: Params) => tl(language, key, params);

  app.onError((err, c) => c.json({ ok: false, error: err.message }, 400));

  // Serveur local : seules les requêtes adressées à localhost / 127.0.0.1 sont servies (parade au
  // « DNS rebinding » : une page web tierce ne peut pas lire l'API ni les fichiers du dossier).
  // Les écritures venues d'une autre origine (formulaire d'une page tierce) sont refusées.
  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    if (host && !HOSTS_LOCAL.includes(host)) return c.text(m('api.hostRefused'), 403);
    const write = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    if (write && originForeign(c.req.header('origin'), c.req.header('sec-fetch-site'))) {
      return c.json({ ok: false, error: m('api.originRefused') }, 403);
    }
    if (!ROUTES_PASSIVE.includes(c.req.path)) idle.signal();
    await next();
    // Les écritures de l'API ne changent pas PRAGMA data_version pour sa propre connexion : on les signale ici.
    if (write && c.req.path.startsWith('/api/') && !c.req.path.startsWith('/api/work') && c.res.status < 400) {
      broadcast.emit({ type: 'database' });
    }
  });

  // Notifications (Server-Sent Events) : « base » (données modifiées), « emails » (boîte de réception).
  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      let finish = () => {};
      const finished = new Promise<void>((r) => (finish = r));
      const unsubscribe = broadcast.subscribe((n) => {
        stream.writeSSE({ event: n.type, data: JSON.stringify(n) }).catch(() => finish());
      });
      stream.onAbort(() => finish());
      await stream.writeSSE({ event: 'ready', data: '{}' });
      // Commentaire régulier : garde la connexion ouverte à travers les proxys (ne compte pas comme activité).
      const heartbeat = setInterval(() => stream.write(': battement\n\n').catch(() => finish()), 25_000);
      await finished;
      clearInterval(heartbeat);
      unsubscribe();
    }),
  );

  // Travail en attente pour l'agent, et lancement de l'agent dans un terminal (boutons de l'interface).
  app.get('/api/work', (c) => c.json(stateWork(db, { dataDir: config.dataDir, emails })));

  app.post('/api/work/:action', async (c) => {
    const action = c.req.param('action');
    if (!isActionAgent(action)) return c.json({ ok: false, error: m('api.actionUnknown') }, 404);
    if (!(c.req.header('content-type') ?? '').includes('application/json')) {
      return c.json({ ok: false, error: m('api.jsonExpected') }, 415);
    }
    await launcher(action, config.dataDir);
    return c.json({ ok: true, action });
  });

  // Contrat « service local » : état, occupation, temps avant l'arrêt automatique.
  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      folder: config.dataDir,
      state: 'ready',
      contract: 1,
      service: 'vigie-emploi',
      language,
      version: VERSION,
      busy: false,
      activity: '',
      idle: { timeout_s: idle.timeoutS, remaining_s: idle.remainingS() },
      // Requête venue de la machine du serveur : l'interface propose alors « ouvrir le dossier dans l'explorateur ».
      local_machine: isLocale(c),
    }),
  );
  app.get('/api/meta', (c) => c.json({ ...meta(db), possibleStatuses: STATUSES }));
  app.get('/api/offers', (c) => c.json(listOffers(db, optionsFromRequest(c.req.query()))));

  app.get('/api/offers/:id', (c) => {
    const d = detailOffer(db, Number(c.req.param('id')));
    return d ? c.json(d) : c.json({ ok: false, error: m('api.offerNotFound') }, 404);
  });

  app.post('/api/offers/:id/status', async (c) => {
    const id = Number(c.req.param('id'));
    const body = (await c.req.json()) as { status?: string; comment?: string };
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    if (!body.status || !isStatus(body.status)) return c.json({ ok: false, error: m('api.statusUnknown') }, 400);
    addStatus(db, id, body.status, { comment: body.comment ?? null, origin: 'interface' });
    return c.json(detailOffer(db, id));
  });

  app.put('/api/offers/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    const body = (await c.req.json()) as { tags?: string[] };
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const wanted = new Set((body.tags ?? []).map((t) => String(t)));
    const current = tagsOffer(db, id);
    const tags = transaction(db, () =>
      updateTags(
        db,
        id,
        [...wanted].filter((t) => !current.includes(t)),
        current.filter((t) => !wanted.has(t)),
      ),
    );
    return c.json({ ok: true, tags });
  });

  app.put('/api/offers/:id/link', async (c) => {
    const id = Number(c.req.param('id'));
    const body = (await c.req.json()) as { url?: string | null };
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    updateLink(db, id, body.url ?? null);
    return c.json(detailOffer(db, id));
  });

  /** Bouton « Candidater » : passe l'offre en go et renvoie la commande à copier. */
  app.post('/api/offers/:id/apply', (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const r = prepareApplication(db, config.dataDir, id, 'interface');
    return c.json({ ok: true, command: `apply ${id}`, offer: r.offer });
  });

  /** Saisie ou correction d'une note depuis le panneau de détail (nouvelle entrée d'historique). */
  app.post('/api/offers/:id/score', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as Pick<InputBatch, 'score' | 'raw_score' | 'penalties' | 'fit' | 'gaps'>;
    const { score, raw_score, penalties, fit, gaps } = body;
    scoreOffers(db, [{ id, score, raw_score, penalties, fit, gaps, read: true }], 'interface');
    return c.json(detailOffer(db, id));
  });

  /** Correction des sous-notes (et des entrées des critères calculés) : nouvelle note calculée avec la grille. */
  app.put('/api/offers/:id/sub-scores', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as InputSubScores;
    updateSubScores(db, id, body, 'interface', rubricRequired(db, config.dataDir));
    return c.json(detailOffer(db, id));
  });

  // Grille de notation : version courante (avec les exemples calculés), aperçu, enregistrement, versions.
  const replyRubric = (v: VersionRubric | null) =>
    v
      ? {
          ...v,
          levels: LEVELS.map((n) => ({ value: n, label: labelLevel(n, language) })),
          examples: v.rubric.examples.map((e) => scoreExample(v.rubric, e, v.version)),
        }
      : { version: null, rubric: null, examples: [] };

  app.get('/api/rubric', (c) => c.json(replyRubric(rubricCurrent(db, config.dataDir))));

  app.post('/api/rubric/preview', async (c) => {
    const body = (await c.req.json()) as { rubric?: unknown };
    const current = rubricRequired(db, config.dataDir);
    return c.json(previewRubric(db, validateRubric(body.rubric), current.rubric.threshold));
  });

  app.put('/api/rubric', async (c) => {
    const body = (await c.req.json()) as { rubric?: unknown; summary?: string };
    const r = saveRubric(db, config.dataDir, body.rubric, { author: 'interface', summary: body.summary ?? '' });
    return c.json({ ok: true, ...replyRubric(r.version), impact: r.impact });
  });

  app.get('/api/rubric/history', (c) => {
    rubricCurrent(db, config.dataDir);
    return c.json(historyRubric(db));
  });

  app.get('/api/rubric/versions/:v', (c) => c.json(versionRubric(db, Number(c.req.param('v')))));

  app.post('/api/rubric/restore', async (c) => {
    const body = (await c.req.json()) as { version?: number; summary?: string };
    const r = restoreRubric(db, config.dataDir, Number(body.version), { author: 'interface', summary: body.summary });
    return c.json({ ok: true, ...replyRubric(r.version), impact: r.impact });
  });

  /** Candidature : prochaine action, date d'envoi, canal… (null ou '' efface un champ, absent = inchangé). */
  app.put('/api/offers/:id/application', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as Record<string, unknown>;
    const fields: FieldsApplication = {};
    for (const k of FIELDS_EDITABLE) {
      if (!(k in body)) continue;
      const v = body[k];
      if (v !== null && typeof v !== 'string') return c.json({ ok: false, error: m('api.fieldText', { field: k }) }, 400);
      fields[k] = v;
    }
    return c.json(trackApplication(db, id, fields, 'interface').offer);
  });

  // Journal de la candidature (événements et échéances).
  app.get('/api/offers/:id/events', (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    return c.json(journal(db, id));
  });

  app.post('/api/offers/:id/events', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as EventInput;
    addEvent(db, id, body, 'interface');
    return c.json(detailOffer(db, id));
  });

  app.put('/api/events/:id', async (c) => {
    const e = eventOrError(db, Number(c.req.param('id')));
    const body = (await c.req.json()) as EventInput;
    updateEvent(db, e.id, body);
    return c.json(detailOffer(db, e.offer_id));
  });

  app.post('/api/events/:id/done', async (c) => {
    const e = eventOrError(db, Number(c.req.param('id')));
    const body = (await c.req.json().catch(() => ({}))) as { done?: boolean };
    markDone(db, e.id, body.done ?? true);
    return c.json(detailOffer(db, e.offer_id));
  });

  app.delete('/api/events/:id', (c) => {
    const e = deleteEvent(db, Number(c.req.param('id')));
    return c.json(detailOffer(db, e.offer_id));
  });

  app.get('/api/deadlines', (c) => c.json(deadlines(db, { days: number(c.req.query('days')) ?? 7 })));

  app.get('/api/statistics', (c) => c.json(statistics(db)));

  // Fichiers du dossier de candidature : liste, puis lecture (dossier de données uniquement).
  app.get('/api/offers/:id/files', (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    return c.json(filesFolder(db, config.dataDir, id));
  });

  // Ouvrir le dossier de candidature dans l'explorateur de fichiers : seulement depuis la machine du serveur.
  app.post('/api/offers/:id/open-folder', async (c) => {
    if (!isLocale(c)) return c.json({ ok: false, error: m('api.remoteMachine') }, 403);
    if (!(c.req.header('content-type') ?? '').includes('application/json')) {
      return c.json({ ok: false, error: m('api.jsonExpected') }, 415);
    }
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const folder = filesFolder(db, config.dataDir, id).folder;
    if (!folder) return c.json({ ok: false, error: m('api.withoutFolder') }, 404);
    let absolute: string;
    try {
      absolute = safeFolder(config.dataDir, folder);
    } catch (e) {
      return c.json({ ok: false, error: (e as Error).message }, 404);
    }
    try {
      await opener(absolute);
    } catch (e) {
      const program = (e as { program?: string }).program ?? programOpening();
      return c.json({ ok: false, error: m('api.openingImpossible', { program, message: (e as Error).message }) }, 500);
    }
    return c.json({ ok: true, folder });
  });

  app.get('/api/file/*', (c) => {
    const raw = new URL(c.req.url).pathname.slice('/api/file/'.length);
    let path: string;
    try {
      path = raw.split('/').map(decodeURIComponent).join('/');
    } catch {
      return c.text(m('api.pathBadlyEncode'), 400);
    }
    let file: { absolute: string; relative: string };
    try {
      file = safeFile(config.dataDir, path);
    } catch (e) {
      const message = (e as Error).message;
      return c.text(message, /introuvable/i.test(message) ? 404 : 403);
    }
    const p = pageFile(file.absolute, file.relative, { raw: c.req.query('raw') === '1' });
    return c.body(p.body, 200, p.headers);
  });

  app.all('/api/*', (c) => c.json({ ok: false, error: m('api.routeUnknown') }, 404));

  // Interface compilée : fichiers de dist/ui, sinon index.html (application d'une seule page).
  app.get('*', (c) => {
    if (!existsSync(join(FOLDER_UI, 'index.html'))) {
      return c.text(m('api.notCompiled'), 503);
    }
    const requested = normalize(decodeURIComponent(new URL(c.req.url).pathname)).replace(/^[\\/]+/, '');
    let path = join(FOLDER_UI, requested);
    if (!path.startsWith(FOLDER_UI + sep) || !existsSync(path) || !statSync(path).isFile()) {
      path = join(FOLDER_UI, 'index.html');
    }
    const type = TYPES[extname(path)] ?? 'application/octet-stream';
    const cache = path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(readFileSync(path), 200, { 'Content-Type': type, 'Cache-Control': cache });
  });

  return app;
}

export function startServer(o: {
  db: Database;
  config: Config;
  port: number;
  host?: string;
  /** Minutes sans activité avant l'arrêt (0 ou absent : jamais). */
  idleMin?: number;
  /**
   * Serveur hébergé dans un autre processus (tableau de bord lancé par le serveur MCP faute de node séparé) :
   * messages sur stderr (stdout appartient au protocole MCP), port occupé rendu en erreur, et à l'arrêt automatique
   * seuls le serveur web et sa base se ferment, le processus continue.
   */
  hosted?: boolean;
}): Promise<{ port: number }> {
  const idle = new Idle((o.idleMin ?? 0) * 60);
  const broadcast = new Broadcast();
  const stopWatcher = watchChanges({ db: o.db, broadcast, database: o.config.database, emails: o.config.emails });
  const app = createApp(o.db, o.config, idle, { broadcast });
  const language = o.config.language ?? LANGUAGE_DEFAULT;
  const host = o.host ?? '127.0.0.1';
  const say = o.hosted ? (l: string) => process.stderr.write(`${l}\n`) : (l: string) => console.log(l);
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: o.port, hostname: host }, (info) => {
      say(tl(language, 'server.started', { port: info.port, folder: o.config.dataDir }));
      if (!o.hosted) say(tl(language, 'server.stop'));
      resolve({ port: info.port });
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !o.hosted) {
        console.error(tl(language, 'server.portUsed', { port: o.port }));
        console.error(tl(language, 'server.otherPort', { next: o.port + 1 }));
        process.exit(1);
      }
      clearInterval(watcher);
      stopWatcher();
      reject(err);
    });
    const watcher = setInterval(() => {
      if (!idle.expired()) return;
      clearInterval(watcher);
      say(tl(language, 'server.idle', { minutes: Math.round(idle.timeoutS / 60) }));
      stopWatcher();
      server.close(() => {
        o.db.close();
        if (!o.hosted) process.exit(0);
      });
      if ('closeAllConnections' in server) server.closeAllConnections();  // sinon les connexions keep-alive retardent l'arrêt
    }, 1000);
    watcher.unref();
  });
}
