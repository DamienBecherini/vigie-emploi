// MCP server (stdio transport): exposes the core of vigie-emploi to an AI (Claude Code, Claude Desktop…).
// No logic of its own here: each tool calls the same functions as the CLI and the API.
// stdout is reserved for the protocol: nothing else must be written to it.
// Language: the configuration's ("language" key or VIGIE_EMPLOI_LANGUAGE), set when the server is created;
// the names of the tools, parameters and statuses are English identifiers.
// The tools are registered by domain (workspace.ts, dashboard.ts, tools/*.ts), in the order clients list them.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorConfig, APP_ROOT, variable } from '../core/config.ts';
import type { OptionsConfig } from '../core/config.ts';
import { defineLanguage } from '../i18n/index.ts';
import { openState, type StateMcp } from './state.ts';
import { saveToolsWorkspace } from './workspace.ts';
import { saveToolDashboard } from './dashboard.ts';
import { languageNameEn, tm } from './texts.ts';
import { createToolContext } from './tools/context.ts';
import { saveToolsOffers } from './tools/offers.ts';
import { saveToolsScoring } from './tools/scoring.ts';
import { saveToolsApplications } from './tools/applications.ts';
import { saveToolsEvents } from './tools/events.ts';
import { saveToolsIngestion } from './tools/ingestion.ts';

export function createServerMcp(state: StateMcp): McpServer {
  defineLanguage(state.config.language);
  const ctx = createToolContext(state);
  const VERSION_APP = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const server = new McpServer(
    { name: 'vigie-emploi', version: VERSION_APP },
    { instructions: tm('server.INSTRUCTIONS', { language: languageNameEn(state.config.language) }) },
  );
  saveToolsWorkspace(server, state, ctx.data);
  saveToolDashboard(server, state);
  saveToolsOffers(server, ctx);
  saveToolsScoring(server, ctx);
  saveToolsApplications(server, ctx);
  saveToolsEvents(server, ctx);
  saveToolsIngestion(server, ctx);
  return server;
}

/**
 * Like openState, but an unknown language in the environment ("Language" setting of the Claude Desktop extension
 * mistyped) does not prevent the server from starting: it is ignored, with a warning on stderr.
 */
export function openStateTolerant(options: OptionsConfig = {}): StateMcp {
  try {
    return openState(options);
  } catch (e) {
    const env = options.env ?? process.env;
    if (!(e instanceof ErrorConfig && e.code === 'language-unknown') || !variable(env, 'LANGUAGE')) throw e;
    process.stderr.write(`vigie-emploi: ${e.message}\n`);
    const withoutLanguage = { ...env };
    delete withoutLanguage.VIGIE_EMPLOI_LANGUAGE;
    return openState({ ...options, env: withoutLanguage });
  }
}

/**
 * Starts the server on stdio. The data folder comes from --data, VIGIE_EMPLOI_DATA or the config file,
 * otherwise from the default folder (~/vigie-emploi); if it does not exist yet, the server starts anyway
 * (initialize_workspace tool).
 */
export async function startMcp(options: OptionsConfig = {}): Promise<void> {
  const state = openStateTolerant(options);
  const server = createServerMcp(state);
  const transport = new StdioServerTransport();
  const close = async () => {
    await server.close().catch(() => undefined);
    state.db?.close();
    process.exit(0);
  };
  process.stdin.on('end', close);
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  await server.connect(transport);
  const d = state.config.dataDir;
  process.stderr.write(tm('server.startMcp', { d: String(d), p3: String(state.db ? '' : ', workspace not initialised') }));
}
