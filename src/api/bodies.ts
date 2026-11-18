// Bodies of the API's requests: each route names the schema of what it accepts, and reads its body through it.
// A body of the wrong shape is refused here (400, with the name of the wrong field) before the route does anything.
// The schemas of what the core itself takes in (a score, an event, a correction of sub-scores) live with the core;
// the small ones that only the API knows are below.
import type { Context } from 'hono';
import { z } from 'zod';
import { AppError, messageZod } from '../core/errors.ts';
import { schemaInputBatch } from '../core/scoring.ts';

/** Reads the JSON body and validates it. A body that is not JSON is a SyntaxError, answered 400 by the server. */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  return check(schema, await c.req.json());
}

/** Like body, for a route whose body may be left out (an empty or unreadable body counts as {}). */
export async function bodyOptional<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  return check(schema, await c.req.json().catch(() => ({})));
}

function check<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new AppError('invalid', messageZod(r.error));
  return r.data;
}

/** The status itself is checked by the route (its message lists nothing, the interface offers the known statuses). */
export const bodyStatus = z.object({ status: z.string().optional(), comment: z.string().nullable().optional() });
export const bodyTags = z.object({ tags: z.array(z.string()).optional() });
export const bodyLink = z.object({ url: z.string().nullable().optional() });
/** An overall score typed in the detail panel (the old way, without criteria). */
export const bodyScore = schemaInputBatch().pick({ score: true, raw_score: true, penalties: true, fit: true, gaps: true });
/** The rubric is validated by the core, with its own messages. */
export const bodyRubric = z.object({ rubric: z.unknown(), summary: z.string().optional() });
export const bodyRestore = z.object({ version: z.number().int().positive(), summary: z.string().optional() });
/** Application fields: each one is checked by the route (text or null), an unknown one is ignored. */
export const bodyApplication = z.record(z.string(), z.unknown());
export const bodyDone = z.object({ done: z.boolean().optional() });
