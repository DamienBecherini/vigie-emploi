// Files of the workspace: the application folder of a job ad (list, opening in the file explorer)
// and the reading of a file of the data folder.
import type { Hono } from 'hono';
import { AppError } from '../../core/errors.ts';
import { safeFolder, safeFile, filesFolder } from '../../core/files.ts';
import { pageFile } from '../file.ts';
import { programOpening } from '../open.ts';
import type { RoutesContext } from './context.ts';

export function routesFiles(app: Hono, ctx: RoutesContext): void {
  const { db, config, language, m, opener, isLocal, requireOffer } = ctx;

  // Files of the application folder: list, then reading (data folder only).
  app.get('/api/offers/:id/files', (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    return c.json(filesFolder(db, config.dataDir, id));
  });

  // Open the application folder in the file explorer: only from the server's machine.
  app.post('/api/offers/:id/open-folder', async (c) => {
    if (!isLocal(c)) return c.json({ ok: false, error: m('api.remoteMachine') }, 403);
    if (!(c.req.header('content-type') ?? '').includes('application/json')) {
      return c.json({ ok: false, error: m('api.jsonExpected') }, 415);
    }
    const id = Number(c.req.param('id'));
    requireOffer(id);
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
    const p = pageFile(file.absolute, file.relative, { raw: c.req.query('raw') === '1', language });
    return c.body(p.body, 200, p.headers);
  });
}
