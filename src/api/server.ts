// Local JSON API and serving of the compiled interface (dist/ui).
// The routes of each resource live in routes/ and mail.ts; this module assembles them and starts the server.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { serve } from '@hono/node-server';
import type { Config } from '../core/config.ts';
import { APP_ROOT } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { routesMail } from './mail.ts';
import { secretStore, type SecretStore } from '../mail/secret.ts';
import { AppError, HTTP_STATUS } from '../core/errors.ts';
import { LANGUAGE_DEFAULT, tl, type KeyServer } from '../i18n/index.ts';
import type { Params } from '../i18n/tool.ts';
import { Idle } from './idle.ts';
import { Broadcast, watchChanges } from './broadcast.ts';
import { launcherTerminal, type Launcher } from './work.ts';
import { openerSystem, isLocalRequest, type OpenerFolder } from './open.ts';
import { requireOfferWith, type ConfigApp, type RoutesContext } from './routes/context.ts';
import { routesAgent } from './routes/agent.ts';
import { routesOffers } from './routes/offers.ts';
import { routesRubric } from './routes/rubric.ts';
import { routesTracking } from './routes/tracking.ts';
import { routesFiles } from './routes/files.ts';

export { optionsFromRequest } from './routes/offers.ts';
export type { ReplyRubric, ReplyNoRubric } from './routes/rubric.ts';

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

export function createApp(db: Database, config: ConfigApp, idle: Idle = new Idle(0), options: OptionsApp = {}): Hono {
  const app = new Hono();
  const broadcast = options.broadcast ?? new Broadcast();
  const launcher = options.launcher ?? launcherTerminal(config.terminal, process.platform, config.language ?? LANGUAGE_DEFAULT);
  const opener = options.opener ?? openerSystem();
  const isLocal = options.isLocal ?? isLocalRequest;
  const emails = config.emails ?? join(config.dataDir, 'emails');
  // Language of the messages sent back to the interface (which may display another language: header selector).
  const language = config.language ?? LANGUAGE_DEFAULT;
  const m = (key: KeyServer, params?: Params) => tl(language, key, params);
  const ctx: RoutesContext = {
    db,
    config,
    language,
    m,
    broadcast,
    idle,
    emails,
    launcher,
    opener,
    isLocal,
    requireOffer: requireOfferWith(db, m),
  };

  // An expected error answers with the status of its code; an unreadable JSON body is a wrong input.
  // A route that stopped with a ready answer (a missing job ad: ctx.requireOffer) sends that answer.
  // Anything else is a defect of the program: 500, with the stack on the error output.
  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ ok: false, error: err.message, code: err.code }, HTTP_STATUS[err.code]);
    if (err instanceof SyntaxError) return c.json({ ok: false, error: err.message, code: 'invalid' }, 400);
    if (err instanceof HTTPException) return err.getResponse();
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

  routesAgent(app, ctx);

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
  routesOffers(app, ctx);
  routesRubric(app, ctx);
  routesTracking(app, ctx);
  routesFiles(app, ctx);

  // Last of the API: any other /api/ path.
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
