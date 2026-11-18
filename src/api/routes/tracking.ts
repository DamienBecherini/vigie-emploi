// Application tracking: fields of the application, journal events and deadlines, statistics.
import type { Hono } from 'hono';
import { body as read, bodyApplication, bodyDone, bodyOptional } from '../bodies.ts';
import { FIELDS_APPLICATION, detailOffer, type FieldsApplication } from '../../core/offers.ts';
import { trackApplication } from '../../core/actions.ts';
import { addEvent, deadlines, eventOrError, journal, markDone, updateEvent, deleteEvent, schemaEventInput } from '../../core/events.ts';
import { statistics } from '../../core/statistics.ts';
import { number, type RoutesContext } from './context.ts';

/** Champs de candidature modifiables depuis l'interface. */
const FIELDS_EDITABLE = FIELDS_APPLICATION.filter((k) => k !== 'state' && k !== 'label');

export function routesTracking(app: Hono, ctx: RoutesContext): void {
  const { db, m, requireOffer } = ctx;

  /** Application: next action, sending date, channel… (null or '' clears a field, absent = unchanged). */
  app.put('/api/offers/:id/application', async (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    const body = await read(c, bodyApplication);
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
    requireOffer(id);
    return c.json(journal(db, id));
  });

  app.post('/api/offers/:id/events', async (c) => {
    const id = Number(c.req.param('id'));
    requireOffer(id);
    const body = await read(c, schemaEventInput);
    addEvent(db, id, body, 'interface');
    return c.json(detailOffer(db, id));
  });

  app.put('/api/events/:id', async (c) => {
    const e = eventOrError(db, Number(c.req.param('id')));
    const body = await read(c, schemaEventInput);
    updateEvent(db, e.id, body);
    return c.json(detailOffer(db, e.offer_id));
  });

  app.post('/api/events/:id/done', async (c) => {
    const e = eventOrError(db, Number(c.req.param('id')));
    const body = await bodyOptional(c, bodyDone);
    markDone(db, e.id, body.done ?? true);
    return c.json(detailOffer(db, e.offer_id));
  });

  app.delete('/api/events/:id', (c) => {
    const e = deleteEvent(db, Number(c.req.param('id')));
    return c.json(detailOffer(db, e.offer_id));
  });

  app.get('/api/deadlines', (c) => c.json(deadlines(db, { days: number(c.req.query('days')) ?? 7 })));

  app.get('/api/statistics', (c) => c.json(statistics(db)));
}
