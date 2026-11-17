// Local JSON API and serving of the compiled interface (dist/ui).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import type { Config } from '../core/config.ts';
import { APP_ROOT } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { routesMail } from './mail.ts';
import { secretStore, type SecretStore } from '../mail/secret.ts';
import { transaction } from '../db/database.ts';
import { AppError, HTTP_STATUS } from '../core/errors.ts';
import { listOffers, meta, type OptionsList } from '../core/queries.ts';
import { addStatus, FIELDS_APPLICATION, detailOffer, updateLink, updateTags, offerById, tagsOffer, type FieldsApplication } from '../core/offers.ts';
import { isStatus, STATUSES } from '../core/statuses.ts';
import { updateSubScores, scoreOffers, prepareApplication, trackApplication, type InputSubScores } from '../core/actions.ts';
import { scoreExample, LEVELS, validateRubric, type Breakdown, type Level } from '../core/rubric.ts';
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
import { addEvent, deadlines, eventOrError, journal, markDone, updateEvent, deleteEvent, type EventInput } from '../core/events.ts';
import { safeFolder, safeFile, filesFolder } from '../core/files.ts';
import { statistics } from '../core/statistics.ts';
import { pageFile } from './file.ts';
import { LANGUAGE_DEFAULT, tl, type KeyServer } from '../i18n/index.ts';
import { labelLevel } from '../i18n/labels.ts';
import type { Params } from '../i18n/tool.ts';
import { Idle } from './idle.ts';
import { Broadcast, watchChanges } from './broadcast.ts';
import { isActionAgent, stateWork, launcherTerminal, type Launcher } from './work.ts';
import { openerSystem, programOpening, isLocalRequest, type OpenerFolder } from './open.ts';

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
  return v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
}

/** URL parameters → list options (same names as in the interface). */
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

/** Scoring rubric as GET /api/rubric sends it (PUT and restore add ok and impact): levels with their labels, computed examples. */
export type ReplyRubric = VersionRubric & { levels: { value: Level; label: string }[]; examples: Breakdown[] };

/** GET /api/rubric when no rubric exists yet. */
export interface ReplyNoRubric {
  version: null;
  rubric: null;
  examples: Breakdown[];
}

const HOSTS_LOCAL = ['localhost', '127.0.0.1', '[::1]'];

/** Routes that do not count as activity (health check, notification stream left open). */
const ROUTES_PASSIVE = ['/api/health', '/api/stream'];

export interface OptionsApp {
  /** Notifications pushed to the interface (a new instance by default). */
  broadcast?: Broadcast;
  /** Opening of the agent's terminal (by default: depending on the configuration and the platform). */
  launcher?: Launcher;
  /** Opening of a folder in the file explorer (by default: the system's). */
  opener?: OpenerFolder;
  /** Does the request come from the server's machine? (by default: address of the connection). */
  isLocal?: (c: Context) => boolean;
  /** Keychain of the mailbox password (by default: the system's). */
  store?: () => SecretStore;
}

/** Does a request come from another origin (third-party web page, form)? */
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
  config: Pick<Config, 'dataDir'> & Partial<Pick<Config, 'emails' | 'terminal' | 'language' | 'file'>>,
  idle: Idle = new Idle(0),
  options: OptionsApp = {},
): Hono {
  const app = new Hono();
  const broadcast = options.broadcast ?? new Broadcast();
  const launcher = options.launcher ?? launcherTerminal(config.terminal, process.platform, config.language ?? LANGUAGE_DEFAULT);
  const opener = options.opener ?? openerSystem();
  const isLocal = options.isLocal ?? isLocalRequest;
  const emails = config.emails ?? join(config.dataDir, 'emails');
  // Language of the messages sent back to the interface (which may display another language: header selector).
  const language = config.language ?? LANGUAGE_DEFAULT;
  const m = (key: KeyServer, params?: Params) => tl(language, key, params);

  // An expected error answers with the status of its code; an unreadable JSON body is a wrong input.
  // Anything else is a defect of the program: 500, with the stack on the error output.
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ ok: false, error: err.message, code: err.code }, HTTP_STATUS[err.code]);
    if (err instanceof SyntaxError) return c.json({ ok: false, error: err.message, code: 'invalid' }, 400);
    process.stderr.write(`${err.stack ?? err.message}\n`);
    return c.json({ ok: false, error: m('api.internalError', { message: err.message }), code: 'internal' }, 500);
  });

  // Local server: only requests addressed to localhost / 127.0.0.1 are served (protection against
  // "DNS rebinding": a third-party web page cannot read the API nor the folder's files).
  // Writes coming from another origin (form of a third-party page) are refused.
  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    if (host && !HOSTS_LOCAL.includes(host)) return c.text(m('api.hostRefused'), 403);
    const write = c.req.method !== 'GET' && c.req.method !== 'HEAD';
    if (write && originForeign(c.req.header('origin'), c.req.header('sec-fetch-site'))) {
      return c.json({ ok: false, error: m('api.originRefused') }, 403);
    }
    if (!ROUTES_PASSIVE.includes(c.req.path)) idle.signal();
    await next();
    // The API's writes do not change PRAGMA data_version for its own connection: they are reported here.
    if (write && c.req.path.startsWith('/api/') && !c.req.path.startsWith('/api/work') && c.res.status < 400) {
      broadcast.emit({ type: 'database' });
    }
  });

  // Notifications (Server-Sent Events): "database" (data modified), "emails" (inbox).
  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      let finish = () => {};
      const finished = new Promise<void>((r) => (finish = r));
      const unsubscribe = broadcast.subscribe((n) => {
        stream.writeSSE({ event: n.type, data: JSON.stringify(n) }).catch(() => finish());
      });
      stream.onAbort(() => finish());
      await stream.writeSSE({ event: 'ready', data: '{}' });
      // Regular comment: keeps the connection open through proxies (does not count as activity).
      const heartbeat = setInterval(() => stream.write(': heartbeat\n\n').catch(() => finish()), 25_000);
      await finished;
      clearInterval(heartbeat);
      unsubscribe();
    }),
  );

  // Pending work for the agent, and launch of the agent in a terminal (interface buttons).
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

  // "Local service" contract: state, busyness, time before the automatic stop.
  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      folder: config.dataDir,
      state: 'ready',
      contract: 2,
      service: 'vigie-emploi',
      language,
      version: VERSION,
      busy: false,
      activity: '',
      remaining_work_s: null,
      idle: { timeout_s: idle.timeoutS, remaining_s: idle.remainingS() },
      // Request coming from the server's machine: the interface then offers "open the folder in the explorer".
      local_machine: isLocal(c),
    }),
  );
  routesMail(app, { db, file: config.file ?? null, emails, store: options.store ?? (() => secretStore()) });
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

  /** "Apply" button: moves the offer to go and returns the command to copy. */
  app.post('/api/offers/:id/apply', (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const r = prepareApplication(db, config.dataDir, id, 'interface');
    return c.json({ ok: true, command: `apply ${id}`, offer: r.offer });
  });

  /** Entry or correction of a score from the detail panel (new history entry). */
  app.post('/api/offers/:id/score', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as Pick<InputBatch, 'score' | 'raw_score' | 'penalties' | 'fit' | 'gaps'>;
    const { score, raw_score, penalties, fit, gaps } = body;
    scoreOffers(db, [{ id, score, raw_score, penalties, fit, gaps, read: true }], 'interface');
    return c.json(detailOffer(db, id));
  });

  /** Correction of the sub-scores (and of the inputs of computed criteria): new score computed with the rubric. */
  app.put('/api/offers/:id/sub-scores', async (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    const body = (await c.req.json()) as InputSubScores;
    updateSubScores(db, id, body, 'interface', rubricRequired(db, config.dataDir));
    return c.json(detailOffer(db, id));
  });

  // Scoring rubric: current version (with the computed examples), preview, save, versions.
  const replyRubric = (v: VersionRubric | null): ReplyRubric | ReplyNoRubric =>
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

  /** Application: next action, sending date, channel… (null or '' clears a field, absent = unchanged). */
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

  // Application journal (events and deadlines).
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

  // Files of the application folder: list, then reading (data folder only).
  app.get('/api/offers/:id/files', (c) => {
    const id = Number(c.req.param('id'));
    if (!offerById(db, id)) return c.json({ ok: false, error: m('api.offerNotFound') }, 404);
    return c.json(filesFolder(db, config.dataDir, id));
  });

  // Open the application folder in the file explorer: only from the server's machine.
  app.post('/api/offers/:id/open-folder', async (c) => {
    if (!isLocal(c)) return c.json({ ok: false, error: m('api.remoteMachine') }, 403);
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
      if (!(e instanceof AppError)) throw e;
      return c.text(e.message, e.code === 'not-found' ? 404 : 403);
    }
    const p = pageFile(file.absolute, file.relative, { raw: c.req.query('raw') === '1' });
    return c.body(p.body, 200, p.headers);
  });

  app.all('/api/*', (c) => c.json({ ok: false, error: m('api.routeUnknown') }, 404));

  // Compiled interface: files of dist/ui, otherwise index.html (single-page application).
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
  /** Minutes without activity before the stop (0 or absent: never). */
  idleMin?: number;
  /**
   * Server hosted in another process (dashboard launched by the MCP server for lack of a separate node):
   * messages on stderr (stdout belongs to the MCP protocol), a busy port is returned as an error, and on the automatic stop
   * only the web server and its database close, the process goes on.
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
      if ('closeAllConnections' in server) server.closeAllConnections(); // otherwise keep-alive connections delay the stop
    }, 1000);
    watcher.unref();
  });
}
