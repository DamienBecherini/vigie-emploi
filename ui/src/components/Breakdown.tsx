// Breakdown of a criteria-based score (detail panel) and correction of the sub-scores by hand.
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DetailOffer, type Score, type InputSubScores } from '../api.ts';
import { queryKeys } from '../queryKeys.ts';
import { formatScore } from './Badges.tsx';
import { flagShown, number, percent, t, type KeyUi } from '../i18n/index.ts';

const comma = (n: number, d = 2) => number(n, d);

const ORIGINS: Record<string, KeyUi> = { ai: 'origin.ai', interface: 'origin.interface', computation: 'origin.computation', neutral: 'origin.neutral' };

export function BadgeOldRubric() {
  return (
    <span
      className="inline-block rounded-full border border-slate-400 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-500 dark:text-slate-300"
      title={t('breakdown.oldTitle')}
    >
      {t('breakdown.old')}
    </span>
  );
}

/** Table criterion by criterion: sub-score, weight, contribution, justification; then rules and flags. */
export function BreakdownScore({ score }: { score: Score }) {
  const d = score.breakdown!;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('breakdown.legend')}</caption>
          <thead className="text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th scope="col" className="py-1 pr-2">
                {t('breakdown.criterion')}
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                {t('breakdown.subScore')}
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                {t('breakdown.weight')}
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                {t('breakdown.contribution')}
              </th>
              <th scope="col" className="py-1 pl-2">
                {t('breakdown.justification')}
              </th>
            </tr>
          </thead>
          <tbody>
            {d.criteria.map((c) => (
              <tr key={c.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                <th scope="row" className="py-1 pr-2 text-left font-semibold">
                  {c.label}
                  <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">{ORIGINS[c.origin] ? t(ORIGINS[c.origin]) : c.origin}</span>
                </th>
                <td className={`px-2 py-1 text-right font-semibold tabular-nums ${c.origin === 'neutral' ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                  {comma(c.score, 1)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{percent(c.normalized_weight * 100)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{comma(c.contribution)}</td>
                <td className="py-1 pl-2 break-words">{c.justification ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
              <th scope="row" className="py-1 pr-2 text-left">
                {t('breakdown.average')}
              </th>
              <td colSpan={3} className="px-2 py-1 text-right font-semibold tabular-nums">
                {comma(d.average)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {d.rules.length > 0 && (
        <ul className="text-sm">
          {d.rules.map((r) => (
            <li key={r.id} className="font-semibold text-rose-800 dark:text-rose-200">
              {t('breakdown.rule', { label: r.label, effect: r.effect === 'zero' ? t('breakdown.scoreA0') : t('breakdown.cap', { value: comma(r.value!) }) })}
              {!r.effective && <span className="font-normal">{t('breakdown.withoutEffect')}</span>}
            </li>
          ))}
        </ul>
      )}
      {d.ignored_blockers.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('breakdown.ignored', { rules: d.ignored_blockers.join(', ') })}</p>
      )}
      {d.flags.length > 0 && (
        <ul className="text-sm text-amber-900 dark:text-amber-200" aria-label={t('breakdown.flags')}>
          {d.flags.map((f) => (
            <li key={f.code}>⚑ {flagShown(f)}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {t('breakdown.exact', { exact: comma(d.exact_score, 3), score: formatScore(d.score), version: score.rubric_version })}
        {score.recalculated_at && t('breakdown.recalculated', { date: `${score.recalculated_at.slice(8, 10)}/${score.recalculated_at.slice(5, 7)}` })}
      </p>
    </div>
  );
}

type Line = { score: string; justification: string };

/** Correction of the sub-scores (AI criteria), of the inputs of the computed criteria and of the blocking rules. */
export function EditorSubScores({ offer }: { offer: DetailOffer }) {
  const client = useQueryClient();
  const base = useId();
  const g = useQuery({ queryKey: queryKeys.rubric(), queryFn: api.rubric });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = offer.scores[0];
  const rubric = g.data?.rubric;
  const initial = () => {
    const lines: Record<string, Line> = {};
    for (const c of rubric?.criteria.filter((x) => x.source === 'ai') ?? []) {
      const s = n?.input?.criteria[c.id];
      lines[c.id] = { score: s ? String(s.score).replace('.', ',') : '', justification: s?.justification ?? '' };
    }
    const e = n?.input?.inputs;
    return {
      lines,
      days: e?.onsite_days === undefined || e?.onsite_days === null ? '' : String(e.onsite_days),
      min: e?.salary_min ? String(e.salary_min) : '',
      max: e?.salary_max ? String(e.salary_max) : '',
      unit: e?.unit ?? 'year',
      blockers: new Set(n?.input?.blockers ?? []),
    };
  };
  const [s, setS] = useState(initial);
  const updated = useMutation({
    mutationFn: () => {
      const criteria: InputSubScores['criteria'] = {};
      for (const [id, l] of Object.entries(s.lines)) {
        const raw = l.score.trim().replace(',', '.');
        if (raw === '') {
          criteria[id] = null;
          continue;
        }
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0 || v > 10) throw new Error(t('subScores.invalid', { criterion: id }));
        criteria[id] = { score: v, justification: l.justification.trim() || null };
      }
      const count = (x: string) => (x.trim() ? Number(x.replace(/\s/g, '').replace(',', '.')) : null);
      // Only the modified sub-scores are sent: the others keep their origin (AI).
      const changed: NonNullable<InputSubScores['criteria']> = {};
      const before = initial();
      for (const [id, v] of Object.entries(criteria)) {
        const a = before.lines[id];
        if (a.score !== s.lines[id].score || a.justification !== s.lines[id].justification) changed[id] = v;
      }
      return api.subScores(offer.id, {
        criteria: changed,
        inputs: {
          onsite_days: s.days === '' ? null : Number(s.days),
          salary_min: count(s.min),
          salary_max: count(s.max),
          unit: count(s.min) === null && count(s.max) === null ? null : (s.unit as 'year'),
        },
        blockers: [...s.blockers],
      });
    },
    onSuccess: (d) => {
      client.setQueryData(queryKeys.offer(offer.id), d);
      client.invalidateQueries({ queryKey: queryKeys.offers() });
      setEditing(false);
      setError(null);
    },
    onError: (e) => setError((e as Error).message),
  });
  if (!rubric) return null;
  if (!editing) {
    return (
      <button
        type="button"
        className="button mt-2"
        onClick={() => {
          setS(initial());
          setError(null);
          setEditing(true);
        }}
      >
        {n?.breakdown ? t('subScores.fix') : t('subScores.score')}
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-3 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label={t('subScores.form')}
      onSubmit={(e) => {
        e.preventDefault();
        updated.mutate();
      }}
    >
      {rubric.criteria
        .filter((c) => c.source === 'ai')
        .map((c) => (
          <div key={c.id} className="flex flex-wrap gap-2">
            <div className="w-24 shrink-0">
              <label htmlFor={`${base}-${c.id}`} className="label" title={c.description}>
                {c.label}
              </label>
              <input
                id={`${base}-${c.id}`}
                className="field tabular-nums"
                inputMode="decimal"
                placeholder={t('subScores.example')}
                value={s.lines[c.id]?.score ?? ''}
                onChange={(e) => setS({ ...s, lines: { ...s.lines, [c.id]: { ...s.lines[c.id], score: e.target.value } } })}
              />
            </div>
            <div className="min-w-48 flex-1">
              <label htmlFor={`${base}-${c.id}-j`} className="label">
                {t('breakdown.justification')}
              </label>
              <input
                id={`${base}-${c.id}-j`}
                className="field"
                value={s.lines[c.id]?.justification ?? ''}
                onChange={(e) => setS({ ...s, lines: { ...s.lines, [c.id]: { ...s.lines[c.id], justification: e.target.value } } })}
              />
            </div>
          </div>
        ))}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-semibold">{t('subScores.computed')}</legend>
        <div className="w-36">
          <label htmlFor={`${base}-days`} className="label">
            {t('subScores.onsiteDays')}
          </label>
          <select id={`${base}-days`} className="field" value={s.days} onChange={(e) => setS({ ...s, days: e.target.value })}>
            <option value="">{t('subScores.perOffer')}</option>
            <option value="0">{t('subScores.fullRemote')}</option>
            {[1, 2, 3, 4, 5].map((j) => (
              <option key={j} value={j}>
                {t('subScores.daysWeek', { n: j })}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-min`} className="label">
            {t('subScores.salaryMin')}
          </label>
          <input
            id={`${base}-min`}
            className="field"
            inputMode="decimal"
            placeholder="55000"
            value={s.min}
            onChange={(e) => setS({ ...s, min: e.target.value })}
          />
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-max`} className="label">
            {t('subScores.salaryMax')}
          </label>
          <input
            id={`${base}-max`}
            className="field"
            inputMode="decimal"
            placeholder="65000"
            value={s.max}
            onChange={(e) => setS({ ...s, max: e.target.value })}
          />
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-unit`} className="label">
            {t('subScores.unit')}
          </label>
          <select id={`${base}-unit`} className="field" value={s.unit} onChange={(e) => setS({ ...s, unit: e.target.value as typeof s.unit })}>
            <option value="year">{t('subScores.byYear')}</option>
            <option value="month">{t('subScores.byMonth')}</option>
            <option value="day">{t('subScores.byDay')}</option>
            <option value="hour">{t('subScores.byHour')}</option>
          </select>
        </div>
      </fieldset>
      {rubric.rules.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">{t('subScores.rules')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {rubric.rules.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-blue-700 dark:accent-blue-400"
                  checked={s.blockers.has(r.id)}
                  onChange={(e) => {
                    const b = new Set(s.blockers);
                    if (e.target.checked) b.add(r.id);
                    else b.delete(r.id);
                    setS({ ...s, blockers: b });
                  }}
                />
                {r.label}
                {!r.active && <span className="text-xs text-slate-500 dark:text-slate-400">{t('subScores.inactive')}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="button-primary" disabled={updated.isPending}>
          {t('subScores.recompute')}
        </button>
        <button type="button" className="button" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
        {error && (
          <span role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            {error}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">{t('subScores.help')}</p>
    </form>
  );
}
