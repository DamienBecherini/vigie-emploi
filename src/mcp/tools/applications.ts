// MCP tools that change the state of a job ad and follow the application: status, tags, link,
// preparation of the application ("go") and the application record itself.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { transaction } from '../../db/database.ts';
import { addStatus, detailOffer, updateLink, updateTags } from '../../core/offers.ts';
import { offerOrError, prepareApplication, trackApplication } from '../../core/actions.ts';
import { STATUSES } from '../../core/statuses.ts';
import { on } from '../results.ts';
import { tm, tu } from '../texts.ts';
import { ORIGIN, type ToolContext } from './context.ts';

export function saveToolsApplications(server: McpServer, ctx: ToolContext): void {
  const { database, data, id, textOptional } = ctx;

  server.registerTool(
    'change_status',
    {
      title: tu('server.change_status.title'),
      description: tm('server.change_status.description'),
      inputSchema: {
        id,
        status: z.enum(STATUSES).describe(tm('server.change_status.inputSchema.status', { p1: String(STATUSES.join(', ')) })),
        comment: z.string().optional().describe(tm('server.change_status.inputSchema.comment')),
      },
    },
    on(({ id, status, comment }) => {
      offerOrError(database(), id);
      addStatus(database(), id, status, { comment: comment ?? null, origin: ORIGIN });
      return { ok: true, id, status: detailOffer(database(), id)!.status };
    }),
  );

  server.registerTool(
    'update_tags',
    {
      title: tu('server.update_tags.title'),
      description: tm('server.update_tags.description'),
      inputSchema: {
        id,
        add: z.array(z.string()).optional().describe(tm('server.update_tags.inputSchema.add')),
        remove: z.array(z.string()).optional().describe(tm('server.update_tags.inputSchema.remove')),
      },
    },
    on(({ id, add, remove }) => {
      offerOrError(database(), id);
      return { ok: true, id, tags: transaction(database(), () => updateTags(database(), id, add ?? [], remove ?? [])) };
    }),
  );

  server.registerTool(
    'update_link',
    {
      title: tu('server.update_link.title'),
      description: tm('server.update_link.description'),
      inputSchema: { id, url: z.string().nullable().describe(tm('server.update_link.inputSchema.url')) },
    },
    on(({ id, url }) => {
      offerOrError(database(), id);
      updateLink(database(), id, url);
      return { ok: true, id, url: detailOffer(database(), id)!.canonical_url };
    }),
  );

  server.registerTool(
    'apply',
    {
      title: tu('server.apply.title'),
      description: tm('server.apply.description'),
      inputSchema: { id },
    },
    on(({ id }) => prepareApplication(database(), data(), id, ORIGIN)),
  );

  server.registerTool(
    'save_application',
    {
      title: tu('server.save_application.title'),
      description: tm('server.save_application.description'),
      inputSchema: {
        id,
        folder: textOptional(tm('server.save_application.inputSchema.folder')),
        cv: textOptional(tm('server.save_application.inputSchema.cv')),
        channel: textOptional(tm('server.save_application.inputSchema.channel')),
        sent_at: textOptional(tm('server.save_application.inputSchema.sent_at')),
        message: textOptional(tm('server.save_application.inputSchema.message')),
        next_action: textOptional(tm('server.save_application.inputSchema.next_action')),
      },
    },
    on(({ id, ...fields }) => {
      const r = trackApplication(database(), id, fields, ORIGIN);
      return { ok: true, id, status: r.offer.status, status_added: r.status_added, application: r.offer.application };
    }),
  );
}
