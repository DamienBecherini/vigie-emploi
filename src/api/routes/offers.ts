// Job ads: list (with its URL filters), detail, and the changes made from the detail panel
// (status, tags, link, apply, overall score, sub-scores).
import type { Hono } from 'hono';
import { AppError } from '../../core/errors.ts';
import { transaction } from '../../db/database.ts';
import { body as read, bodyLink, bodyScore, bodyStatus, bodyTags } from '../bodies.ts';
import { listOffers, meta, type OptionsList } from '../../core/queries.ts';
import { addStatus, detailOffer, updateLink, updateTags, tagsOffer } from '../../core/offers.ts';
import { isStatus, STATUSES } from '../../core/statuses.ts';
import { updateSubScores, scoreOffers, prepareApplication, schemaSubScores } from '../../core/actions.ts';
import { rubricRequired } from '../../core/rubric-storage.ts';
import { number, type RoutesContext } from './context.ts';

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

export function routesOffers(app: Hono, ctx: RoutesContext): void {
  const { db, config, m, requireOffer } = ctx;

  app.get('/api/meta', (c) => c.json({ ...meta(db), possibleStatuses: STATUSES }));
  app.get('/api/offers', (c) => c.json(listOffers(db, optionsFromRequest(c.req.query()))));

  app.get('/api/offers/:id', (c) => {
    const d = detailOffer(db, Number(c.req.param('id')));
    if (!d) throw new AppError('not-found', m('api.offerNotFound'));
    return c.json(d);
  });

  // Status, tags and link read their body first: a wrong body is refused (400) even for a missing job ad.
  app.post('/api/offers/:id/status', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await read(c, bodyStatus);
    requireOffer(id);
    if (!body.status || !isStatus(body.status)) return c.json({ ok: false, error: m('api.statusUnknown') }, 400);
    addStatus(db, id, body.status, { comment: body.comment ?? null, origin: 'interface' });
    return c.json(detailOffer(db, id));
  });

  app.put('/api/offers/:id/tags', async (c) => {
    const id = Number(c.req.param('id'));
    const body = await read(c, bodyTags);
    requireOffer(id);
    const wanted = new Set(body.tags ?? []);
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
    const body = await read(c, bodyLink);
    requireOffer(id);
    updateLink(db, id, body.url ?? null);
    return c.json(detailOffer(db, id));
  });

  /** "Apply" button: moves the offer to go and returns the command to copy. */
  app.post('/api/offers/:id/apply', (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    const r = prepareApplication(db, config.dataDir, id, 'interface');
    return c.json({ ok: true, command: `apply ${id}`, offer: r.offer });
  });

  /** Entry or correction of a score from the detail panel (new history entry). */
  app.post('/api/offers/:id/score', async (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    const { score, raw_score, penalties, fit, gaps } = await read(c, bodyScore);
    scoreOffers(db, [{ id, score, raw_score, penalties, fit, gaps, read: true }], 'interface');
    return c.json(detailOffer(db, id));
  });

  /** Correction of the sub-scores (and of the inputs of computed criteria): new score computed with the rubric. */
  app.put('/api/offers/:id/sub-scores', async (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    const body = await read(c, schemaSubScores);
    updateSubScores(db, id, body, 'interface', rubricRequired(db, config.dataDir));
    return c.json(detailOffer(db, id));
  });
}
