// Scoring instructions for the AI generated from the rubric (MCP tool "rubric", command "rubric").
import { decimal, t } from '../../i18n/index.ts';
import type { Rubric } from './schema.ts';

/** Scoring instructions generated from the rubric: what the AI must provide, and how. */
export function instructionsAi(g: Rubric): string[] {
  const ai = g.criteria.filter((c) => c.source === 'ai');
  const calc = g.criteria.filter((c) => c.source === 'computation');
  const sum = g.criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const pct = (p: number) => t('core.pages.percent', { pc: Math.round((p / sum) * 100) });
  return [
    t('core.instructions.scoreFinale'),
    t('core.instructions.criteria', { list: ai.map((c) => `${c.id} (${c.label}, ${pct(c.weight)})`).join(' ; ') }),
    t('core.instructions.computed', { n: calc.length, list: calc.map((c) => c.id).join(t('core.ni')) }) + t('core.instructions.inputs'),
    t('core.instructions.blockers', {
      list:
        g.rules
          .filter((r) => r.active && r.effect !== 'criterion_cap')
          .map((r) => `${r.id} = ${r.label} → ${r.effect === 'zero' ? '0' : t('core.cap', { value: decimal(r.value ?? 0) })}`)
          .join(' ; ') || t('core.noneFeminine'),
    }),
    t('core.instructions.technique'),
    t('core.instructions.examples'),
    t('core.instructions.threshold', { threshold: decimal(g.threshold) }),
  ];
}
