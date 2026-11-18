// MCP tools at both ends of the flow: ingestion of the e-mail alerts (mailbox or folder of .eml files)
// and generation of the Markdown application tracker.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readMailSettings } from '../../core/config.ts';
import { ingestPerConfig } from '../../ingest/ingest.ts';
import { writeTracker } from '../../export/tracker.ts';
import { on } from '../results.ts';
import { tm, tu } from '../texts.ts';
import { presentIngestion } from '../presentation.ts';
import type { ToolContext } from './context.ts';

export function saveToolsIngestion(server: McpServer, ctx: ToolContext): void {
  const { state, database, data } = ctx;

  server.registerTool(
    'ingest_emails',
    {
      title: tu('server.ingest_emails.title'),
      description: tm('server.ingest_emails.description'),
      inputSchema: {
        keep: z.boolean().optional().describe(tm('server.ingest_emails.inputSchema.keep')),
        download: z.boolean().optional().describe(tm('server.ingest_emails.inputSchema.download')),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    on(async (a) =>
      presentIngestion(
        await ingestPerConfig(database(), { ...state.config, mail: readMailSettings(state.config.file) }, { keep: a.keep, download: a.download }),
        { keep: a.keep, host: readMailSettings(state.config.file)?.host },
      ),
    ),
  );

  server.registerTool(
    'generate_tracker',
    {
      title: tu('server.generate_tracker.title'),
      description: tm('server.generate_tracker.description'),
      inputSchema: {
        replace: z.boolean().optional().describe(tm('server.generate_tracker.inputSchema.replace')),
        output: z.string().optional().describe(tm('server.generate_tracker.inputSchema.output')),
      },
    },
    on((a) => ({ ok: true, ...writeTracker(database(), data(), { replace: a.replace, output: a.output, language: state.config.language }) })),
  );
}
