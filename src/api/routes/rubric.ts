// Scoring rubric: current version with its computed examples, preview, save, history, versions, restore.
import type { Hono } from 'hono';
import { body as read, bodyRestore, bodyRubric } from '../bodies.ts';
import { scoreExample, LEVELS, validateRubric, type Breakdown, type Level } from '../../core/rubric.ts';
import {
  previewRubric,
  saveRubric,
  rubricCurrent,
  rubricRequired,
  historyRubric,
  restoreRubric,
  versionRubric,
  type VersionRubric,
} from '../../core/rubric-storage.ts';
import { labelLevel } from '../../i18n/labels.ts';
import type { RoutesContext } from './context.ts';

/** Scoring rubric as GET /api/rubric sends it (PUT and restore add ok and impact): levels with their labels, computed examples. */
export type ReplyRubric = VersionRubric & { levels: { value: Level; label: string }[]; examples: Breakdown[] };

/** GET /api/rubric when no rubric exists yet. */
export interface ReplyNoRubric {
  version: null;
  rubric: null;
  examples: Breakdown[];
}

export function routesRubric(app: Hono, ctx: RoutesContext): void {
  const { db, config, language } = ctx;

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
    const body = await read(c, bodyRubric);
    const current = rubricRequired(db, config.dataDir);
    return c.json(previewRubric(db, validateRubric(body.rubric), current.rubric.threshold));
  });

  app.put('/api/rubric', async (c) => {
    const body = await read(c, bodyRubric);
    const r = saveRubric(db, config.dataDir, body.rubric, { author: 'interface', summary: body.summary ?? '' });
    return c.json({ ok: true, ...replyRubric(r.version), impact: r.impact });
  });

  app.get('/api/rubric/history', (c) => {
    rubricCurrent(db, config.dataDir);
    return c.json(historyRubric(db));
  });

  app.get('/api/rubric/versions/:v', (c) => c.json(versionRubric(db, Number(c.req.param('v')))));

  app.post('/api/rubric/restore', async (c) => {
    const body = await read(c, bodyRestore);
    const r = restoreRubric(db, config.dataDir, body.version, { author: 'interface', summary: body.summary });
    return c.json({ ok: true, ...replyRubric(r.version), impact: r.impact });
  });
}
