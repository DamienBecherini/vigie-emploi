// MCP tools that score the job ads and manage the scoring rubric: one score, a batch of scores, the rubric,
// its changes (trial run, restore), recalculation of all scores and the history of its versions.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { scoreOffers } from '../../core/actions.ts';
import { schemaInputBatch, type InputBatchReceived } from '../../core/scoring.ts';
import { instructionsAi, computedExamples, schemaChange } from '../../core/rubric.ts';
import { pathRubric, rubricCurrent, rubricRequired, historyRubric, updateRubric, rescore, restoreRubric, versionRubric } from '../../core/rubric-storage.ts';
import { AppError } from '../../core/errors.ts';
import { on } from '../results.ts';
import { tm, tu, type KeyMcp } from '../texts.ts';
import { impactCapped } from '../presentation.ts';
import { ORIGIN, type ToolContext } from './context.ts';

/** Documentation of the fields of a score, read by the AI (the schema itself is the core's: schemaInputBatch). */
const DOCS_SCORE: Record<string, KeyMcp> = {
  id: 'server.inputBatch.id',
  url: 'server.inputBatch.url',
  source: 'server.fieldsDescriptive.source',
  title: 'server.fieldsDescriptive.title',
  company: 'server.fieldsDescriptive.company',
  contract: 'server.fieldsDescriptive.contract',
  compensation: 'server.fieldsDescriptive.compensation',
  remote: 'server.fieldsDescriptive.remote',
  published: 'server.fieldsDescriptive.published',
  stack: 'server.fieldsDescriptive.stack',
  description: 'server.fieldsDescriptive.description',
  criteria: 'server.fieldsScore.criteria',
  'criteria.score': 'server.fieldsScore.criteria.score',
  'criteria.justification': 'server.fieldsScore.criteria.justification',
  inputs: 'server.fieldsScore.inputs',
  'inputs.onsite_days': 'server.fieldsScore.inputs.onsite_days',
  'inputs.salary_min': 'server.fieldsScore.inputs.salary_min',
  'inputs.salary_max': 'server.fieldsScore.inputs.salary_max',
  'inputs.unit': 'server.fieldsScore.inputs.unit',
  blockers: 'server.fieldsScore.blockers',
  score: 'server.fieldsScore.score',
  raw_score: 'server.fieldsScore.raw_score',
  penalties: 'server.fieldsScore.penalties',
  fit: 'server.fieldsScore.fit',
  gaps: 'server.fieldsScore.gaps',
  read: 'server.fieldsScore.read',
  tags: 'server.fieldsScore.tags',
};

function normalizeInput(e: InputBatchReceived): InputBatchReceived {
  if (e.id === undefined && !e.url) throw new AppError('invalid', tm('server.normalizeInput'));
  return e;
}

export function saveToolsScoring(server: McpServer, ctx: ToolContext): void {
  const { database, data, reading } = ctx;
  /** A score in the batch format (candidatures/_lots/*.json files). */
  const inputBatch = schemaInputBatch((field) => (DOCS_SCORE[field] ? tm(DOCS_SCORE[field]) : undefined));
  const loadRubric = () => rubricCurrent(database(), data());

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
}
