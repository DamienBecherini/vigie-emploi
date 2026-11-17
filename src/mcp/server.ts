// MCP server (stdio transport): exposes the core of vigie-emploi to an AI (Claude Code, Claude Desktop…).
// No logic of its own here: each tool calls the same functions as the CLI and the API.
// stdout is reserved for the protocol: nothing else must be written to it.
// Language: the configuration's ("language" key or VIGIE_EMPLOI_LANGUAGE), set when the server is created;
// the names of the tools, parameters and statuses are English identifiers.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ErrorConfig, APP_ROOT, variable, readMailSettings } from '../core/config.ts';
import type { OptionsConfig } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { listOffers } from '../core/queries.ts';
import { addStatus, detailOffer, updateLink, updateTags } from '../core/offers.ts';
import { scoreOffers, offerOrError, offersToRead, prepareApplication, trackApplication } from '../core/actions.ts';
import type { InputBatch } from '../core/scoring.ts';
import { COLUMNS_SORT, STATUSES } from '../core/statuses.ts';
import { ingestPerConfig } from '../ingest/ingest.ts';
import { writeTracker } from '../export/tracker.ts';
import { addEvent, deadlines, eventOrError, journal, markDone, updateEvent, TYPES_EVENT } from '../core/events.ts';
import { filesFolder } from '../core/files.ts';
import { instructionsAi, computedExamples, schemaChange, UNITS } from '../core/rubric.ts';
import { pathRubric, rubricCurrent, rubricRequired, historyRubric, updateRubric, rescore, restoreRubric, versionRubric } from '../core/rubric-storage.ts';
import { defineLanguage } from '../i18n/index.ts';
import { notInitializedMessage, openState, type StateMcp } from './state.ts';
import { saveToolsWorkspace } from './workspace.ts';
import { saveToolDashboard } from './dashboard.ts';
import { on } from './results.ts';
import { languageNameEn, tm, tu } from './texts.ts';
import {
  TO_READ_DEFAULT,
  TO_READ_MAX,
  TO_READ_MAX_DESCRIPTIONS,
  detailCapped,
  impactCapped,
  lineCompact,
  LIST_DEFAULT,
  LIST_MAX,
  LENGTH_DESCRIPTION_PAGE,
  presentIngestion,
  withoutEmpty,
} from './presentation.ts';
import { AppError } from '../core/errors.ts';

const ORIGIN = 'mcp';

/** Parameter schemas, built in the current language (descriptions included). */
function buildSchemas() {
  const id = z.number().int().positive().describe(tm('server.id'));
  const numberScore = (d: string) =>
    z
      .union([z.number().min(0).max(10), z.string()])
      .nullable()
      .optional()
      .describe(d);

  /** A score in the batch format (candidatures/_lots/*.json files). */
  const fieldsScore = {
    criteria: z
      .record(
        z.string(),
        z.object({
          score: z.union([z.number().min(0).max(10), z.string()]).describe(tm('server.fieldsScore.criteria.score')),
          justification: z.string().optional().describe(tm('server.fieldsScore.criteria.justification')),
        }),
      )
      .optional()
      .describe(tm('server.fieldsScore.criteria')),
    inputs: z
      .object({
        onsite_days: z.number().int().min(0).max(5).nullable().optional().describe(tm('server.fieldsScore.inputs.onsite_days')),
        salary_min: z.number().positive().nullable().optional().describe(tm('server.fieldsScore.inputs.salary_min')),
        salary_max: z.number().positive().nullable().optional().describe(tm('server.fieldsScore.inputs.salary_max')),
        unit: z.enum(UNITS).nullable().optional().describe(tm('server.fieldsScore.inputs.unit')),
      })
      .optional()
      .describe(tm('server.fieldsScore.inputs')),
    blockers: z.array(z.string()).optional().describe(tm('server.fieldsScore.blockers')),
    score: numberScore(tm('server.fieldsScore.score')),
    raw_score: numberScore(tm('server.fieldsScore.raw_score')),
    penalties: z.string().optional().describe(tm('server.fieldsScore.penalties')),
    fit: z.string().optional().describe(tm('server.fieldsScore.fit')),
    gaps: z.string().optional().describe(tm('server.fieldsScore.gaps')),
    read: z.boolean().optional().describe(tm('server.fieldsScore.read')),
    tags: z.array(z.string()).optional().describe(tm('server.fieldsScore.tags')),
  };
  const fieldsDescriptive = {
    source: z.string().optional().describe(tm('server.fieldsDescriptive.source')),
    title: z.string().optional().describe(tm('server.fieldsDescriptive.title')),
    company: z.string().optional().describe(tm('server.fieldsDescriptive.company')),
    location: z.string().optional(),
    contract: z.string().optional().describe(tm('server.fieldsDescriptive.contract')),
    compensation: z.string().optional().describe(tm('server.fieldsDescriptive.compensation')),
    remote: z.string().optional().describe(tm('server.fieldsDescriptive.remote')),
    published: z.string().optional().describe(tm('server.fieldsDescriptive.published')),
    stack: z.string().optional().describe(tm('server.fieldsDescriptive.stack')),
    description: z.string().optional().describe(tm('server.fieldsDescriptive.description')),
  };
  const inputBatch = z.object({
    id: id.optional().describe(tm('server.inputBatch.id')),
    url: z.string().optional().describe(tm('server.inputBatch.url')),
    ...fieldsDescriptive,
    ...fieldsScore,
  });
  const textOptional = (d: string) => z.string().nullable().optional().describe(d);
  return { id, inputBatch, textOptional };
}

type Schemas = ReturnType<typeof buildSchemas>;

function normalizeInput(e: z.infer<Schemas['inputBatch']>): InputBatch {
  if (e.id === undefined && !e.url) throw new AppError('invalid', tm('server.normalizeInput'));
  return e as InputBatch;
}

export function createServerMcp(state: StateMcp): McpServer {
  defineLanguage(state.config.language);
  const { id, inputBatch, textOptional } = buildSchemas();
  const VERSION_APP = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const server = new McpServer(
    { name: 'vigie-emploi', version: VERSION_APP },
    { instructions: tm('server.INSTRUCTIONS', { language: languageNameEn(state.config.language) }) },
  );
  const reading = { readOnlyHint: true, openWorldHint: false };
  /** Database of the workspace; clear error as long as the workspace is not initialized. */
  const database = (): Database => {
    if (!state.db) throw new AppError('not-configured', notInitializedMessage(state));
    return state.db;
  };
  const data = (): string => {
    database();
    return state.config.dataDir;
  };
  saveToolsWorkspace(server, state, data);
  saveToolDashboard(server, state);
  const loadRubric = () => rubricCurrent(database(), data());

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

  server.registerTool(
    'score_offer',
    {
      title: tu('server.score_offer.title'),
      description: tm('server.score_offer.description'),
      inputSchema: inputBatch.shape,
    },
    on((e) => {
      const [r] = scoreOffers(database(), [normalizeInput(e)], ORIGIN, { rubric: loadRubric });
      return { ok: true, ...r };
    }),
  );

  server.registerTool(
    'score_batch',
    {
      title: tu('server.score_batch.title'),
      description: tm('server.score_batch.description'),
      inputSchema: {
        offers: z.array(inputBatch).min(1).describe(tm('server.score_batch.inputSchema.offers')),
        dry_run: z.boolean().optional().describe(tm('server.score_batch.inputSchema.dry_run')),
      },
    },
    on(({ offers, dry_run }) => {
      const r = scoreOffers(database(), offers.map(normalizeInput), ORIGIN, { rubric: loadRubric, dry_run });
      return { ok: true, dry_run: Boolean(dry_run), scored: dry_run ? 0 : r.length, offers: r };
    }),
  );

  server.registerTool(
    'rubric',
    {
      title: tu('server.rubric.title'),
      description: tm('server.rubric.description'),
      inputSchema: { version: z.number().int().positive().optional().describe(tm('server.rubric.inputSchema.version')) },
      annotations: reading,
    },
    on(({ version }) => {
      const v = version ? versionRubric(database(), version) : rubricRequired(database(), data());
      const sum = v.rubric.criteria.reduce((s, c) => s + c.weight, 0);
      return {
        file: pathRubric(data()),
        version: v.version,
        at: v.at,
        author: v.author,
        summary: v.summary,
        instructions_ai: [...v.rubric.instructions, ...instructionsAi(v.rubric)],
        normalized_weight: Object.fromEntries(v.rubric.criteria.map((c) => [c.id, Math.round((c.weight / sum) * 1000) / 1000])),
        rubric: v.rubric,
        computed_examples: computedExamples(v.rubric, v.version),
        format_score: {
          id: 42,
          criteria: { technique: { score: 8, justification: '…' }, role: { score: 7, justification: '…' } },
          inputs: { onsite_days: 2, salary_min: 55000, salary_max: 65000, unit: 'year' },
          blockers: [],
          fit: '…',
          gaps: '…',
          read: true,
        },
      };
    }),
  );

  server.registerTool(
    'update_rubric',
    {
      title: tu('server.update_rubric.title'),
      description: tm('server.update_rubric.description'),
      inputSchema: {
        change: schemaChange.optional().describe(tm('server.update_rubric.inputSchema.change')),
        summary: z.string().optional().describe(tm('server.update_rubric.inputSchema.summary')),
        dry_run: z.boolean().optional().describe(tm('server.update_rubric.inputSchema.dry_run')),
        restore_version: z.number().int().positive().optional().describe(tm('server.update_rubric.inputSchema.restore_version')),
      },
    },
    on(({ change, summary, dry_run, restore_version }) => {
      if (restore_version !== undefined) {
        const r = restoreRubric(database(), data(), restore_version, { author: ORIGIN, summary });
        return { ok: true, saved: true, version: r.version.version, impact: impactCapped(r.impact) };
      }
      if (!change) throw new AppError('invalid', tm('server.update_rubric'));
      if (!dry_run && !summary?.trim()) throw new AppError('invalid', tm('server.update_rubric_2'));
      const r = updateRubric(database(), data(), change, { author: ORIGIN, summary: summary ?? '', dry_run });
      return {
        ok: true,
        saved: r.saved,
        version: r.version,
        impact: impactCapped(r.impact),
        computed_examples: r.computed_examples,
        ...(r.impact.offers_recalculated === 0
          ? {
              remark: tm('server.update_rubric.remark'),
            }
          : {}),
      };
    }),
  );

  server.registerTool(
    'rescore',
    {
      title: tu('server.rescore.title'),
      description: tm('server.rescore.description'),
      inputSchema: {},
    },
    on(() => ({ ok: true, ...rescore(database(), data()) })),
  );

  server.registerTool(
    'rubric_history',
    {
      title: tu('server.rubric_history.title'),
      description: tm('server.rubric_history.description'),
      inputSchema: {},
      annotations: reading,
    },
    on(() => {
      rubricCurrent(database(), data());
      return { versions: historyRubric(database()) };
    }),
  );

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
  process.stderr.write(
    tm('server.startMcp', { d: String(d), p2: String(state.db ? '' : ', espace non initialisé'), p3: String(state.db ? '' : ', workspace not initialised') }),
  );
}
