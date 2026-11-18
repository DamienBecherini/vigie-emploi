// Commands of the scoring: score (record the AI's criteria for offers), rubric (read, initialize, change,
// restore the scoring grid) and rescore (recalculate every offer with the current grid).
import { readFileSync } from 'node:fs';
import { batchInputs } from '../../core/scoring.ts';
import { scoreOffers } from '../../core/actions.ts';
import { instructionsAi, scoreExample } from '../../core/rubric.ts';
import {
  pathRubric,
  rubricCurrent,
  rubricRequired,
  historyRubric,
  initializeRubric,
  updateRubric,
  rescore,
  restoreRubric,
  versionRubric,
} from '../../core/rubric-storage.ts';
import { languageCurrent, t } from '../../i18n/index.ts';
import { labelLevel } from '../../i18n/labels.ts';
import { analyze, error, whole } from '../options.ts';
import { context, type Command } from '../context.ts';
import { comma, json, showImpact } from '../format.ts';

/** Trial run: --dry-run (the spelling of the help) or --dry_run (the name of the MCP and API field); --no-… gives false. */
function dryRun(v: { 'dry-run'?: boolean; dry_run?: boolean }): boolean {
  return Boolean(v['dry-run'] ?? v.dry_run);
}

export const scoringCommands: Record<string, Command> = {
  score(args) {
    // Here --json carries the scores to record (JSON text): it replaces the general --json switch.
    const { v, pos } = analyze(args, { file: { type: 'string' }, json: { type: 'string' }, 'dry-run': { type: 'boolean' }, dry_run: { type: 'boolean' } });
    const { config, db } = context(v);
    const dry = dryRun(v);
    let inputs: unknown[];
    if (v.file) {
      inputs = batchInputs(JSON.parse(readFileSync(v.file, 'utf8').replace(/^﻿/, '')));
    } else {
      if (typeof v.json !== 'string') error(t('cli.score.expected'));
      const e = JSON.parse(v.json) as unknown;
      inputs = Array.isArray(e) ? e : [e];
      if (pos[0]) {
        if (inputs.length !== 1) error(t('cli.score.oneSingle'));
        inputs[0] = { ...(inputs[0] as object), id: whole(pos[0], 'id') };
      }
    }
    const results = scoreOffers(db, inputs, 'cli', { rubric: () => rubricCurrent(db, config.dataDir), dry_run: dry });
    json({ ok: true, dry_run: dry, scored: dry ? 0 : results.length, offers: results });
  },

  rubric(args) {
    const { v } = analyze(args, {
      instructions: { type: 'boolean' },
      history: { type: 'boolean' },
      version: { type: 'string' },
      restore: { type: 'string' },
      init: { type: 'boolean' },
      update: { type: 'string' },
      summary: { type: 'string' },
      'dry-run': { type: 'boolean' },
      dry_run: { type: 'boolean' },
    });
    const { config, db } = context(v);
    const folder = config.dataDir;
    if (v.init) {
      const r = initializeRubric(db, folder, config.language);
      if (v.json) return json({ ok: true, created: r.created, path: r.path, version: r.version.version });
      return console.log(r.created ? t('cli.rubric.copied', { path: r.path }) : t('cli.rubric.exists', { path: r.path }));
    }
    if (v.history) {
      rubricCurrent(db, folder);
      const h = historyRubric(db);
      if (v.json) return json({ ok: true, versions: h });
      for (const x of h) console.log(`  v${String(x.version).padEnd(4)} ${x.at.slice(0, 16).replace('T', ' ')}  ${x.author.padEnd(9)} ${x.summary}`);
      return;
    }
    if (v.restore !== undefined) {
      const r = restoreRubric(db, folder, whole(v.restore, 'version'), { author: 'cli', summary: v.summary });
      if (v.json) return json({ ok: true, version: r.version.version, impact: r.impact });
      console.log(t('cli.rubric.version', { version: r.version.version, summary: r.version.summary }));
      return showImpact(r.impact);
    }
    if (v.update !== undefined) {
      const dry = dryRun(v);
      if (!dry && !v.summary) error(t('cli.rubric.summaryExpected'));
      let change: unknown;
      try {
        change = JSON.parse(v.update);
      } catch (e) {
        error(t('cli.rubric.jsonInvalid', { message: (e as Error).message }));
      }
      const r = updateRubric(db, folder, change, { author: 'cli', summary: v.summary ?? '', dry_run: dry });
      if (v.json) return json({ ok: true, ...r });
      console.log(r.saved ? t('cli.rubric.saved', { version: r.version }) : t('cli.rubric.dry_run'));
      if (r.computed_examples.length) {
        console.log(t('cli.rubric.examplesBeforeAfter'));
        for (const e of r.computed_examples) {
          const before = e.before === null || e.before === undefined ? t('cli.rubric.new') : comma(e.before);
          console.log(`  ${before.padStart(7)} → ${comma(e.score).padEnd(4)} ${e.title}${e.company ? ` — ${e.company}` : ''}`);
        }
      }
      return showImpact(r.impact);
    }
    const g = v.version !== undefined ? versionRubric(db, whole(v.version, 'version')) : rubricRequired(db, folder);
    if (v.json) {
      return json({
        ok: true,
        file: pathRubric(folder),
        ...g,
        instructions_ai: instructionsAi(g.rubric),
        computed_examples: g.rubric.examples.map((e) => ({ title: e.title, company: e.company ?? null, ...scoreExample(g.rubric, e, g.version) })),
      });
    }
    const G = g.rubric;
    const language = languageCurrent();
    console.log(t('cli.rubric.title', { name: G.name, version: g.version, at: g.at.slice(0, 10), author: g.author, summary: g.summary }));
    console.log(t('cli.rubric.file', { path: pathRubric(folder), threshold: comma(G.threshold) }));
    const sum = G.criteria.reduce((s, c) => s + c.weight, 0);
    console.log(`\n${t('cli.rubric.criteria')}`);
    for (const c of G.criteria) {
      const source = (c.source === 'ai' ? t('cli.rubric.ai') : t('cli.rubric.computation')).padEnd(8);
      console.log(`  ${c.id.padEnd(14)} ${String(Math.round((c.weight / sum) * 100)).padStart(3)} %  ${source}  ${c.label}`);
    }
    const tt = G.scales.remote;
    const r = G.scales.compensation;
    console.log(`\n${t('cli.rubric.remote', { days: tt.onsite_days.join(' / '), unknown: tt.unknown })}`);
    console.log(
      t('cli.rubric.compensation', {
        reference: r.reference,
        floor: r.salary.floor,
        low: r.salary.target_low,
        high: r.salary.target_high,
        daily_rate: r.daily_rate.floor,
        fullRemote: r.daily_rate.floor_full_remote ? t('cli.rubric.fullRemote', { value: r.daily_rate.floor_full_remote }) : '',
        tjmLow: r.daily_rate.target_low,
        tjmHigh: r.daily_rate.target_high,
        unknown: r.unknown,
      }),
    );
    console.log(`\n${t('cli.rubric.rules')}`);
    for (const x of G.rules) {
      const effect = x.effect === 'zero' ? '0' : x.effect === 'cap' ? t('cli.breakdown.cap', { value: x.value }) : `${x.criterion} < ${x.threshold}`;
      console.log(`  ${x.active ? '●' : '○'} ${x.id.padEnd(18)} ${effect.padEnd(10)} ${x.label}`);
    }
    console.log(`\n${t('cli.rubric.inventory')}`);
    for (const n of ['strong', 'medium', 'light', 'zero'] as const) {
      const items = G.inventory.filter((x) => x.level === n).map((x) => x.technology);
      if (items.length) console.log(`  ${labelLevel(n, language).padEnd(6)} ${items.join(', ')}`);
    }
    if (G.examples.length) {
      console.log(`\n${t('cli.rubric.examples')}`);
      for (const e of G.examples) console.log(`  ${comma(scoreExample(G, e).score, 1).padStart(4)}  ${e.company ? `${e.company} — ` : ''}${e.title}`);
    }
    if (v.instructions) console.log(`\n${t('cli.rubric.instructions')}\n${[...G.instructions, ...instructionsAi(G)].map((x) => `- ${x}`).join('\n')}`);
  },

  rescore(args) {
    const { v } = analyze(args, {});
    const { config, db } = context(v);
    const r = rescore(db, config.dataDir);
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.rescore', { version: r.version }));
    showImpact(r.impact);
  },
};
