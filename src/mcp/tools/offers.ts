// MCP tools that read the job ads: filtered and paged list, one ad in detail, the ads still to read and score.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listOffers } from '../../core/queries.ts';
import { detailOffer } from '../../core/offers.ts';
import { offerOrError, offersToRead } from '../../core/actions.ts';
import { COLUMNS_SORT, STATUSES } from '../../core/statuses.ts';
import { on } from '../results.ts';
import { tm, tu } from '../texts.ts';
import {
  TO_READ_DEFAULT,
  TO_READ_MAX,
  TO_READ_MAX_DESCRIPTIONS,
  detailCapped,
  lineCompact,
  LIST_DEFAULT,
  LIST_MAX,
  LENGTH_DESCRIPTION_PAGE,
  withoutEmpty,
} from '../presentation.ts';
import type { ToolContext } from './context.ts';

export function saveToolsOffers(server: McpServer, ctx: ToolContext): void {
  const { database, reading, id } = ctx;

  server.registerTool(
    'list_offers',
    {
      title: tu('server.list_offers.title'),
      description: tm('server.list_offers.description'),
      inputSchema: {
        statuses: z
          .array(z.enum(STATUSES))
          .optional()
          .describe(tm('server.list_offers.inputSchema.statuses', { p1: String(STATUSES.join(', ')) })),
        sources: z.array(z.string()).optional().describe(tm('server.list_offers.inputSchema.sources')),
        tags: z.array(z.string()).optional().describe(tm('server.list_offers.inputSchema.tags')),
        score_min: z.number().optional().describe(tm('server.list_offers.inputSchema.score_min')),
        score_max: z.number().optional().describe(tm('server.list_offers.inputSchema.score_max')),
        unscored: z.boolean().optional().describe(tm('server.list_offers.inputSchema.unscored')),
        text: z.string().optional().describe(tm('server.list_offers.inputSchema.text')),
        contract: z.string().optional().describe(tm('server.list_offers.inputSchema.contract')),
        remote: z.string().optional().describe(tm('server.list_offers.inputSchema.remote')),
        received_from: z.string().optional().describe(tm('server.list_offers.inputSchema.received_from')),
        received_until: z.string().optional().describe(tm('server.list_offers.inputSchema.received_until')),
        published_from: z.string().optional().describe(tm('server.list_offers.inputSchema.published_from')),
        my_applications: z.boolean().optional().describe(tm('server.list_offers.inputSchema.my_applications')),
        page: z.number().int().min(1).optional().describe(tm('server.list_offers.inputSchema.page')),
        size: z
          .number()
          .int()
          .min(1)
          .max(LIST_MAX)
          .optional()
          .describe(tm('server.list_offers.inputSchema.size', { LIST_DEFAULT: String(LIST_DEFAULT), LIST_MAX: String(LIST_MAX) })),
        sort: z
          .string()
          .optional()
          .describe(tm('server.list_offers.inputSchema.sort', { p1: String(COLUMNS_SORT.join(', ')) })),
        order: z.enum(['asc', 'desc']).optional().describe(tm('server.list_offers.inputSchema.order')),
      },
      annotations: reading,
    },
    on((a) => {
      const r = listOffers(database(), {
        statuses: a.statuses,
        sources: a.sources,
        tags: a.tags,
        scoreMin: a.score_min,
        scoreMax: a.score_max,
        unscored: a.unscored,
        q: a.text,
        contract: a.contract,
        remote: a.remote,
        receivedFrom: a.received_from,
        receivedUntil: a.received_until,
        publishedFrom: a.published_from,
        myApplications: a.my_applications,
        page: a.page,
        size: a.size ?? LIST_DEFAULT,
        sort: a.sort,
        order: a.order,
      });
      const remaining = Math.max(0, r.total - (r.page - 1) * r.size - r.offers.length);
      return { total: r.total, page: r.page, pages: r.pages, remaining, offers: r.offers.map(lineCompact) };
    }),
  );

  server.registerTool(
    'read_offer',
    {
      title: tu('server.read_offer.title'),
      description: tm('server.read_offer.description'),
      inputSchema: { id, full: z.boolean().optional().describe(tm('server.read_offer.inputSchema.full')) },
      annotations: reading,
    },
    on(({ id, full }) => {
      offerOrError(database(), id);
      return detailCapped(detailOffer(database(), id)!, { full });
    }),
  );

  server.registerTool(
    'offers_to_read',
    {
      title: tu('server.offers_to_read.title'),
      description: tm('server.offers_to_read.description', {
        TO_READ_DEFAULT: String(TO_READ_DEFAULT),
        LENGTH_DESCRIPTION_PAGE: String(LENGTH_DESCRIPTION_PAGE),
        TO_READ_MAX_DESCRIPTIONS: String(TO_READ_MAX_DESCRIPTIONS),
      }),
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(TO_READ_MAX)
          .optional()
          .describe(tm('server.offers_to_read.inputSchema.limit', { TO_READ_DEFAULT: String(TO_READ_DEFAULT) })),
        page: z.number().int().min(1).optional().describe(tm('server.offers_to_read.inputSchema.page')),
        descriptions: z
          .boolean()
          .optional()
          .describe(tm('server.offers_to_read.inputSchema.descriptions', { TO_READ_MAX_DESCRIPTIONS: String(TO_READ_MAX_DESCRIPTIONS) })),
      },
      annotations: reading,
    },
    on((a) => {
      const limit = Math.min(a.limit ?? TO_READ_DEFAULT, a.descriptions ? TO_READ_MAX_DESCRIPTIONS : TO_READ_MAX);
      const r = offersToRead(database(), { limit, page: a.page, descriptions: Boolean(a.descriptions), length: LENGTH_DESCRIPTION_PAGE });
      return {
        ...r,
        offers: r.offers.map((o) => withoutEmpty(o)),
        more: r.remaining ? tm('server.offers_to_read.suite', { p1: String(r.page + 1), remaining: String(r.remaining) }) : null,
      };
    }),
  );
}
