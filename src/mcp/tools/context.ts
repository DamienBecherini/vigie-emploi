// What the data tools of the MCP server share: the workspace accessors that refuse an uninitialised workspace,
// the common parameter schemas, the read-only annotation and the origin written in the journal.
import { z } from 'zod';
import type { Database } from '../../db/database.ts';
import { AppError } from '../../core/errors.ts';
import { notInitializedMessage, type StateMcp } from '../state.ts';
import { tm } from '../texts.ts';

/** Origin of the changes made through the MCP server (statuses, scores, events, rubric versions). */
export const ORIGIN = 'mcp';

export interface ToolContext {
  state: StateMcp;
  /** Database of the workspace; clear error as long as the workspace is not initialized. */
  database: () => Database;
  /** Data folder of the workspace; same error as database() when it is not initialized. */
  data: () => string;
  /** Annotations of a tool that only reads. */
  reading: { readOnlyHint: true; openWorldHint: false };
  /** Identifier of a job ad. */
  id: z.ZodNumber;
  /** Optional text parameter that can be erased (null). */
  textOptional: (d: string) => z.ZodOptional<z.ZodNullable<z.ZodString>>;
}

/** Built once per server, after the language is set: the descriptions of the schemas are in the current language. */
export function createToolContext(state: StateMcp): ToolContext {
  const database = (): Database => {
    if (!state.db) throw new AppError('not-configured', notInitializedMessage(state));
    return state.db;
  };
  const data = (): string => {
    database();
    return state.config.dataDir;
  };
  return {
    state,
    database,
    data,
    reading: { readOnlyHint: true, openWorldHint: false },
    id: z.number().int().positive().describe(tm('server.id')),
    textOptional: (d: string) => z.string().nullable().optional().describe(d),
  };
}
