// MCP tools for the journal of an application and its deadlines: add or change an event, read the journal,
// list and close deadlines, and list the files of the application folder that events can point to.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { offerOrError } from '../../core/actions.ts';
import { addEvent, deadlines, eventOrError, journal, markDone, updateEvent, TYPES_EVENT } from '../../core/events.ts';
import { filesFolder } from '../../core/files.ts';
import { on } from '../results.ts';
import { tm, tu } from '../texts.ts';
import { ORIGIN, type ToolContext } from './context.ts';

export function saveToolsEvents(server: McpServer, ctx: ToolContext): void {
  const { database, data, reading, id, textOptional } = ctx;

  const fieldsEvent = {
    direction: z.enum(['sent', 'received']).nullable().optional().describe(tm('server.fieldsEvent.direction')),
    details: textOptional(tm('server.fieldsEvent.details')),
    channel: textOptional(tm('server.fieldsEvent.channel')),
    contacts: textOptional(tm('server.fieldsEvent.contacts')),
    amount: z.number().nullable().optional().describe(tm('server.fieldsEvent.amount')),
    unit: textOptional(tm('server.fieldsEvent.unit')),
    days: z.number().nullable().optional().describe(tm('server.fieldsEvent.days')),
    files: z.array(z.string()).nullable().optional().describe(tm('server.fieldsEvent.files')),
  };

  server.registerTool(
    'add_event',
    {
      title: tu('server.add_event.title'),
      description: tm('server.add_event.description'),
      inputSchema: {
        id,
        type: z.enum(TYPES_EVENT).describe(tm('server.add_event.inputSchema.type', { p1: String(TYPES_EVENT.join(', ')) })),
        at: z.string().optional().describe(tm('server.add_event.inputSchema.at')),
        summary: z.string().min(1).describe(tm('server.add_event.inputSchema.summary')),
        done: z.boolean().optional().describe(tm('server.add_event.inputSchema.done')),
        ...fieldsEvent,
      },
    },
    on(({ id, ...input }) => ({ ok: true, event: addEvent(database(), id, input, ORIGIN) })),
  );

  server.registerTool(
    'update_event',
    {
      title: tu('server.update_event.title'),
      description: tm('server.update_event.description'),
      inputSchema: {
        event_id: z.number().int().positive().describe(tm('server.update_event.inputSchema.event_id')),
        type: z.enum(TYPES_EVENT).optional(),
        at: z.string().optional().describe(tm('server.update_event.inputSchema.at')),
        summary: z.string().min(1).optional(),
        done: z.boolean().optional(),
        ...fieldsEvent,
      },
    },
    on(({ event_id, ...input }) => ({ ok: true, event: updateEvent(database(), event_id, input) })),
  );

  server.registerTool(
    'journal',
    {
      title: tu('server.journal.title'),
      description: tm('server.journal.description'),
      inputSchema: { id },
      annotations: reading,
    },
    on(({ id }) => {
      offerOrError(database(), id);
      return { id, events: journal(database(), id) };
    }),
  );

  server.registerTool(
    'deadlines',
    {
      title: tu('server.deadlines.title'),
      description: tm('server.deadlines.description'),
      inputSchema: {
        days: z.number().int().min(0).max(366).optional().describe(tm('server.deadlines.inputSchema.days')),
      },
      annotations: reading,
    },
    on(({ days }) => deadlines(database(), { days })),
  );

  server.registerTool(
    'mark_done',
    {
      title: tu('server.mark_done.title'),
      description: tm('server.mark_done.description'),
      inputSchema: {
        event_id: z.number().int().positive().describe(tm('server.mark_done.inputSchema.event_id')),
        done: z.boolean().optional().describe(tm('server.mark_done.inputSchema.done')),
      },
    },
    on(({ event_id, done }) => {
      eventOrError(database(), event_id);
      return { ok: true, event: markDone(database(), event_id, done ?? true) };
    }),
  );

  server.registerTool(
    'folder_files',
    {
      title: tu('server.folder_files.title'),
      description: tm('server.folder_files.description'),
      inputSchema: { id },
      annotations: reading,
    },
    on(({ id }) => {
      offerOrError(database(), id);
      return filesFolder(database(), data(), id);
    }),
  );
}
