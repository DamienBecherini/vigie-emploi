// Panneau « Réglages de la note » : poids, barèmes, règles bloquantes, inventaire, seuil, exemples de référence,
// aperçu de l'impact avant d'enregistrer, historique des versions et restauration.
import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEVELS, scoreExample, validateRubric, type Rubric, type Level } from '../../../src/core/rubric.ts';
import { levelShown, number, percent, t } from '../i18n/index.ts';
import { api, type ChangeScore, type Impact } from '../api.ts';
import { useDebounce } from '../state.ts';
import { BadgeScore, formatDate, formatScore } from './Badges.tsx';

const comma = (n: number, d = 1) => number(n, d);

/** Champ numérique : accepte la virgule ; une saisie vide ou invalide n'est pas reportée. */
function FieldNumber(props: {
  label: string;
  value: number | undefined;
  change: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  empty?: boolean;
  help?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value).replace('.', ','));
  useEffect(() => {
    setText((t) => {
      const current = t.trim() === '' ? undefined : Number(t.replace(',', '.'));
      return current === props.value ? t : props.value === undefined ? '' : String(props.value).replace('.', ',');
    });
  }, [props.value]);
  return (
    <div className={props.className ?? 'w-28'}>
      <label htmlFor={id} className="label">
        {props.label}
      </label>
      <input
        id={id}
        className="field tabular-nums"
        inputMode="decimal"
        value={text}
        aria-describedby={props.help ? `${id}-help` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const t = e.target.value.trim().replace(',', '.');
          if (t === '') {
            if (props.empty) props.change(undefined);
            return;
          }
          const n = Number(t);
          if (Number.isFinite(n)) props.change(n);
        }}
      />
      {props.help && (
        <p id={`${id}-help`} className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          {props.help}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, help }: { title: string; children: React.ReactNode; help?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h3 id={id} className="font-bold">
        {title}
      </h3>
      {help && <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">{help}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Weight({ g, updated }: { g: Rubric; updated: (f: (g: Rubric) => void) => void }) {
  const sum = g.criteria.reduce((s, c) => s + c.weight, 0);
  return (
    <Section title={t('weight.title')} help={t('weight.help')}>
      <ul className="space-y-2">
        {g.criteria.map((c, i) => {
          const pct = sum > 0 ? (c.weight / sum) * 100 : 0;
          return (
            <li key={c.id} className="grid grid-cols-[minmax(9rem,14rem)_1fr_3.5rem_3.5rem] items-center gap-2 text-sm">
              <label htmlFor={`poids-${c.id}`} title={c.description}>
                <span className="font-semibold">{c.label}</span>{' '}
                <span className="text-xs text-slate-600 dark:text-slate-400">({c.source === 'ai' ? t('weight.ai') : t('weight.computation')})</span>
              </label>
              <input
                id={`poids-${c.id}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={c.weight}
                className="accent-blue-700 dark:accent-blue-400"
                onChange={(e) => updated((x) => void (x.criteria[i].weight = Number(e.target.value)))}
                aria-valuetext={t('weight.value', { weight: c.weight, pct: Math.round(pct) })}
              />
              <span className="text-right tabular-nums">{c.weight}</span>
              <span className="text-right font-semibold tabular-nums">{percent(pct)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        {t('weight.total')}<strong className="tabular-nums">{sum}</strong>{t('weight.normalized')}
        {sum === 0 && <span className="ml-1 text-rose-700 dark:text-rose-300">{t('weight.none')}</span>}
      </p>
    </Section>
  );
}

function Scales({ g, updated }: { g: Rubric; updated: (f: (g: Rubric) => void) => void }) {
  const tt = g.scales.remote;
  const r = g.scales.compensation;
  const idRef = useId();
  return (
    <Section title={t('scales.title')} help={t('scales.help')}>
      <h4 className="mb-1 text-sm font-semibold">{t('scales.remote')}</h4>
      <div className="flex flex-wrap gap-2">
        {tt.onsite_days.map((v, j) => (
          <FieldNumber
            key={j}
            className="w-20"
            label={j === 0 ? t('scales.fullRemote') : t('scales.days', { n: j })}
            value={v}
            change={(n) => n !== undefined && updated((x) => void (x.scales.remote.onsite_days[j] = n))}
          />
        ))}
        <FieldNumber className="w-20" label={t('scales.unknownRemote')} value={tt.unknown} change={(n) => n !== undefined && updated((x) => void (x.scales.remote.unknown = n))} />
      </div>

      <h4 className="mt-4 mb-1 text-sm font-semibold">{t('scales.compensation')}</h4>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <label htmlFor={idRef} className="label">
            {t('scales.reference')}
          </label>
          <select
            id={idRef}
            className="field"
            value={r.reference}
            onChange={(e) => updated((x) => void (x.scales.compensation.reference = e.target.value as Rubric['scales']['compensation']['reference']))}
          >
            <option value="middle">{t('scales.middle')}</option>
            <option value="min">{t('scales.low')}</option>
            <option value="max">{t('scales.high')}</option>
          </select>
        </div>
        <FieldNumber className="w-24" label={t('scales.unknownPay')} value={r.unknown} change={(n) => n !== undefined && updated((x) => void (x.scales.compensation.unknown = n))} />
      </div>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">{t('scales.salary')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['floor', 'target_low', 'target_high'] as const).map((k) => (
            <FieldNumber
              key={k}
              label={{ floor: t('scales.floor'), target_low: t('scales.targetLow'), target_high: t('scales.targetHigh') }[k]}
              value={r.salary[k]}
              change={(n) => n !== undefined && updated((x) => void (x.scales.compensation.salary[k] = n))}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">{t('scales.daily_rate')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['floor', 'floor_full_remote', 'target_low', 'target_high'] as const).map((k) => (
            <FieldNumber
              key={k}
              className={k === 'floor_full_remote' ? 'w-36' : 'w-28'}
              label={{ floor: t('scales.floor'), floor_full_remote: t('scales.floorFullRemote'), target_low: t('scales.targetLow'), target_high: t('scales.targetHigh') }[k]}
              value={r.daily_rate[k]}
              empty={k === 'floor_full_remote'}
              change={(n) =>
                updated((x) => {
                  if (n === undefined) delete x.scales.compensation.daily_rate.floor_full_remote;
                  else x.scales.compensation.daily_rate[k] = n;
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('scales.helpTarget')}</p>
    </Section>
  );
}

function Rules({ g, updated }: { g: Rubric; updated: (f: (g: Rubric) => void) => void }) {
  const [draft, setDraft] = useState({ id: '', label: '' });
  return (
    <Section title={t('rules.title')} help={t('rules.help')}>
      <ul className="space-y-2">
        {g.rules.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
            <label className="flex items-center gap-1.5 self-center text-sm">
              <input
                type="checkbox"
                className="size-4 accent-blue-700 dark:accent-blue-400"
                checked={r.active}
                onChange={(e) => updated((x) => void (x.rules[i].active = e.target.checked))}
              />
              {t('rules.active')}
            </label>
            <div className="min-w-52 flex-1">
              <label htmlFor={`regle-${r.id}`} className="label">
                {r.id}
              </label>
              <input id={`regle-${r.id}`} className="field" value={r.label} onChange={(e) => updated((x) => void (x.rules[i].label = e.target.value))} title={r.description} />
            </div>
            <div className="w-32">
              <label htmlFor={`effet-${r.id}`} className="label">
                {t('rules.effect')}
              </label>
              <select
                id={`effet-${r.id}`}
                className="field"
                value={r.effect}
                onChange={(e) =>
                  updated((x) => {
                    x.rules[i].effect = e.target.value as 'zero' | 'cap' | 'criterion_cap';
                    if (x.rules[i].effect === 'cap' && x.rules[i].value === undefined) x.rules[i].value = 3;
                    if (x.rules[i].effect === 'criterion_cap') {
                      x.rules[i].criterion ??= x.criteria[0]?.id;
                      x.rules[i].threshold ??= 4;
                    }
                  })
                }
              >
                <option value="zero">{t('rules.zero')}</option>
                <option value="cap">{t('rules.cap')}</option>
                <option value="criterion_cap">{t('rules.criterionCap')}</option>
              </select>
            </div>
            {r.effect === 'criterion_cap' && (
              <>
                <div className="w-40">
                  <label htmlFor={`critere-${r.id}`} className="label">
                    {t('rules.criterion')}
                  </label>
                  <select
                    id={`critere-${r.id}`}
                    className="field"
                    value={r.criterion ?? ''}
                    onChange={(e) => updated((x) => void (x.rules[i].criterion = e.target.value))}
                  >
                    {g.criteria.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <FieldNumber className="w-24" label={t('rules.subThreshold')} value={r.threshold} change={(n) => n !== undefined && updated((x) => void (x.rules[i].threshold = n))} />
              </>
            )}
            {r.effect === 'cap' && (
              <FieldNumber className="w-24" label={t('rules.cap')} value={r.value} change={(n) => n !== undefined && updated((x) => void (x.rules[i].value = n))} />
            )}
            <button type="button" className="button" onClick={() => updated((x) => void x.rules.splice(i, 1))} aria-label={t('rules.deleteLabel', { label: r.label })}>
              {t('rules.delete')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = draft.id.trim().toLowerCase();
          if (!id || !draft.label.trim() || g.rules.some((r) => r.id === id)) return;
          updated((x) => void x.rules.push({ id, label: draft.label.trim(), description: '', effect: 'zero', active: true }));
          setDraft({ id: '', label: '' });
        }}
      >
        <div className="w-40">
          <label htmlFor="rule-new-id" className="label">
            {t('rules.identifier')}
          </label>
          <input id="rule-new-id" className="field" placeholder={t('rules.identifierExample')} value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
        </div>
        <div className="min-w-52 flex-1">
          <label htmlFor="rule-new-label" className="label">
            {t('rules.label')}
          </label>
          <input id="rule-new-label" className="field" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <button type="submit" className="button">
          {t('rules.add')}
        </button>
      </form>
    </Section>
  );
}

function Inventory({ g, updated }: { g: Rubric; updated: (f: (g: Rubric) => void) => void }) {
  const [filter, setFilter] = useState('');
  const [draftTech, setDraftTech] = useState<{ technology: string; level: Level; precision: string }>({ technology: '', level: 'medium', precision: '' });
  const f = filter.trim().toLowerCase();
  const lines = g.inventory.map((x, i) => ({ x, i })).filter(({ x }) => !f || `${x.technology} ${x.precision ?? ''}`.toLowerCase().includes(f));
  const count = (n: Level) => g.inventory.filter((x) => x.level === n).length;
  return (
    <Section title={t('inventory.title')} help={t('inventory.help')}>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label htmlFor="inv-filter" className="label">
            {t('inventory.filter')}
          </label>
          <input id="inv-filter" type="search" className="field" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {LEVELS.map((n) => `${levelShown(n)} ${count(n)}`).join(' · ')}
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('inventory.title')}</caption>
          <thead className="sticky top-0 bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th scope="col" className="px-2 py-1">
                {t('inventory.technology')}
              </th>
              <th scope="col" className="px-2 py-1">
                {t('inventory.level')}
              </th>
              <th scope="col" className="px-2 py-1">
                {t('inventory.precision')}
              </th>
              <th scope="col" className="px-2 py-1">
                <span className="sr-only">{t('inventory.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ x, i }) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-2 py-1">
                  <input aria-label={t('inventory.technology')} className="field" value={x.technology} onChange={(e) => updated((y) => void (y.inventory[i].technology = e.target.value))} />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={t('inventory.levelOf', { technology: x.technology })}
                    className="field w-24"
                    value={x.level}
                    onChange={(e) => updated((y) => void (y.inventory[i].level = e.target.value as Level))}
                  >
                    {LEVELS.map((n) => (
                      <option key={n} value={n}>
                        {levelShown(n)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={t('inventory.precisionPour', { technology: x.technology })}
                    className="field"
                    value={x.precision ?? ''}
                    onChange={(e) =>
                      updated((y) => {
                        if (e.target.value) y.inventory[i].precision = e.target.value;
                        else delete y.inventory[i].precision;
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" className="button" onClick={() => updated((y) => void y.inventory.splice(i, 1))} aria-label={t('inventory.remove', { technology: x.technology })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draftTech.technology.trim()) return;
          updated((x) =>
            void x.inventory.push({
              technology: draftTech.technology.trim(),
              level: draftTech.level,
              ...(draftTech.precision.trim() ? { precision: draftTech.precision.trim() } : {}),
            }),
          );
          setDraftTech({ technology: '', level: draftTech.level, precision: '' });
        }}
      >
        <div className="min-w-40 flex-1">
          <label htmlFor="inv-technology" className="label">
            {t('inventory.new')}
          </label>
          <input id="inv-technology" className="field" value={draftTech.technology} onChange={(e) => setDraftTech({ ...draftTech, technology: e.target.value })} />
        </div>
        <div className="w-28">
          <label htmlFor="inv-level" className="label">
            {t('inventory.level')}
          </label>
          <select id="inv-level" className="field" value={draftTech.level} onChange={(e) => setDraftTech({ ...draftTech, level: e.target.value as Level })}>
            {LEVELS.map((n) => (
              <option key={n} value={n}>
                {levelShown(n)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="inv-precision" className="label">
            {t('inventory.precision')}
          </label>
          <input id="inv-precision" className="field" value={draftTech.precision} onChange={(e) => setDraftTech({ ...draftTech, precision: e.target.value })} />
        </div>
        <button type="submit" className="button">
          {t('inventory.add')}
        </button>
      </form>
    </Section>
  );
}

function Examples({ g }: { g: Rubric }) {
  return (
    <Section title={t('examples.title')} help={t('examples.help')}>
      <ul className="space-y-2">
        {g.examples.map((e, i) => {
          const d = scoreExample(g, e);
          return (
            <li key={i} className="rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-800/60">
              <p className="flex flex-wrap items-center gap-2">
                <BadgeScore score={d.score} />
                <strong>{e.company ? `${e.company} — ` : ''}{e.title}</strong>
                {e.conditions && <span className="text-slate-600 dark:text-slate-400">{e.conditions}</span>}
              </p>
              <p className="mt-1 text-slate-700 dark:text-slate-300">
                {d.criteria.map((c) => `${c.label} ${comma(c.score)}`).join(' · ')}
                {d.rules.length > 0 && t('examples.rule', { rules: d.rules.map((r) => r.label).join(', ') })}
              </p>
              {e.comment && <p className="mt-1 italic">{e.comment}</p>}
            </li>
          );
        })}
        {!g.examples.length && <li className="text-sm text-slate-600 dark:text-slate-400">{t('examples.none')}</li>}
      </ul>
    </Section>
  );
}

function ListChanges({ title, list, choose }: { title: string; list: ChangeScore[]; choose: (id: number) => void }) {
  if (!list.length) return null;
  return (
    <div className="mt-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="text-sm">
        {list.map((c) => (
          <li key={c.id}>
            <button type="button" className="rounded px-1 text-left hover:underline" onClick={() => choose(c.id)}>
              <span className="tabular-nums">
                {formatScore(c.before)} → {formatScore(c.after)}
              </span>{' '}
              {c.company ? `${c.company} — ` : ''}
              {c.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Preview({ impact, loading, error, choose }: { impact?: Impact; loading: boolean; error: string | null; choose: (id: number) => void }) {
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-blue-300 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
      <h3 className="font-bold">{t('preview.title')}</h3>
      {error ? (
        <p className="text-sm text-rose-800 dark:text-rose-200">{error}</p>
      ) : loading && !impact ? (
        <p className="text-sm">{t('preview.computation')}</p>
      ) : impact ? (
        <>
          <p className="text-sm">
            {t('preview.changed', { n: impact.changed, total: impact.offers_recalculated })}{' '}
            {t('preview.rising', { n: impact.rising.length, threshold: comma(impact.threshold_after) })}, {t('preview.falling', { n: impact.falling.length })}
            {impact.offers_recalculated === 0 && t('preview.old')}
          </p>
          <ListChanges title={t('preview.listRising')} list={impact.rising} choose={choose} />
          <ListChanges title={t('preview.listFalling')} list={impact.falling} choose={choose} />
        </>
      ) : null}
    </div>
  );
}

function History({ current, restore }: { current: number | null; restore: (v: number) => void }) {
  const q = useQuery({ queryKey: ['rubric-history', current], queryFn: api.historyRubric });
  return (
    <Section title={t('history.title')}>
      <ol className="space-y-1 text-sm">
        {(q.data ?? []).map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">v{v.version}</span>
            <span className="tabular-nums text-slate-600 dark:text-slate-400">
              {formatDate(v.at.slice(0, 10))} {v.at.slice(11, 16)}
            </span>
            <span className="rounded-full bg-slate-200 px-2 text-xs dark:bg-slate-700">{v.author}</span>
            <span className="min-w-0 flex-1 break-words">{v.summary}</span>
            {v.version === current ? (
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t('history.current')}</span>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (window.confirm(t('history.confirm', { version: v.version }))) restore(v.version);
                }}
              >
                {t('history.restore')}
              </button>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Settings({ close, choose, announce: announce }: { close: () => void; choose: (id: number) => void; announce: (m: string) => void }) {
  const client = useQueryClient();
  const title = useId();
  const header = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: ['rubric'], queryFn: api.rubric });
  const [workingCopy, setWorkingCopy] = useState<Rubric | null>(null);
  const [summary, setSummary] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const reference = q.data?.rubric ?? null;
  useEffect(() => {
    if (reference) setWorkingCopy(structuredClone(reference));
  }, [reference]);
  useEffect(() => {
    header.current?.focus({ preventScroll: true });
    // En capture : Échap ferme les réglages sans fermer aussi le détail d'offre ouvert dessous.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);

  const updated = (f: (g: Rubric) => void) =>
    setWorkingCopy((g) => {
      if (!g) return g;
      const copy = structuredClone(g);
      f(copy);
      return copy;
    });

  const modified = useMemo(() => Boolean(workingCopy && reference && JSON.stringify(workingCopy) !== JSON.stringify(reference)), [workingCopy, reference]);
  const validation = useMemo(() => {
    if (!workingCopy) return { rubric: null, error: null };
    try {
      return { rubric: validateRubric(workingCopy, 'réglages'), error: null };
    } catch (e) {
      return { rubric: null, error: (e as Error).message };
    }
  }, [workingCopy]);
  const deferred = useDebounce(modified ? validation.rubric : null, 350);
  const preview = useQuery({
    queryKey: ['rubric-preview', JSON.stringify(deferred)],
    queryFn: () => api.previewRubric(deferred!),
    enabled: deferred !== null,
    placeholderData: (p) => p,
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ['rubric'] });
    client.invalidateQueries({ queryKey: ['rubric-history'] });
    client.invalidateQueries({ queryKey: ['offers'] });
    client.invalidateQueries({ queryKey: ['offer'] });
  };
  const save = useMutation({
    mutationFn: () => api.saveRubric(validation.rubric!, summary),
    onSuccess: (r) => {
      setSummary('');
      setMessage(t('settings.saved', { version: r.version, n: r.impact.changed }));
      announce(t('settings.ad', { version: r.version }));
      refresh();
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const restore = useMutation({
    mutationFn: (v: number) => api.restoreRubric(v),
    onSuccess: (r) => {
      setMessage(t('settings.restored', { version: r.version, summary: r.summary, n: r.impact.changed }));
      refresh();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        className="flex h-full w-full max-w-4xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <h2 id={title} ref={header} tabIndex={-1} className="text-lg font-bold">
              {t('settings.title')}
            </h2>
            {q.data?.version && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('settings.version', { name: reference?.name, version: q.data.version, date: formatDate(q.data.at?.slice(0, 10) ?? null), author: q.data.author, summary: q.data.summary })}
              </p>
            )}
          </div>
          <button type="button" className="button" onClick={close} aria-label={t('settings.close')}>
            <X className="size-4" aria-hidden="true" /> {t('theme.close')}
          </button>
        </div>
        {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
        {q.data && !q.data.rubric && (
          <p className="p-4 text-sm">
            {t('settings.notOfRubric1')}<code>vigie-emploi grille --init</code>{t('settings.notOfRubric2')}
            <code>profil/grille.json</code>{t('settings.notOfRubric3')}
          </p>
        )}
        {workingCopy && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t('settings.explanation')}
            </p>
            <Weight g={workingCopy} updated={updated} />
            <Section title={t('settings.thresholdTitle')} help={t('settings.thresholdHelp')}>
              <FieldNumber label={t('settings.threshold')} value={workingCopy.threshold} change={(n) => n !== undefined && updated((x) => void (x.threshold = n))} />
            </Section>
            <Scales g={workingCopy} updated={updated} />
            <Rules g={workingCopy} updated={updated} />
            <Inventory g={workingCopy} updated={updated} />
            <Examples g={validation.rubric ?? reference!} />
            <History current={q.data?.version ?? null} restore={(v) => restore.mutate(v)} />
          </div>
        )}
        {workingCopy && (
          <form
            className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {modified && <Preview impact={preview.data} loading={preview.isFetching} error={validation.error ?? (preview.error ? (preview.error as Error).message : null)} choose={choose} />}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <label htmlFor="summary-rubric" className="label">
                  {t('settings.summary')}
                </label>
                <input
                  id="summary-rubric"
                  className="field"
                  placeholder={t('settings.summaryExample')}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={!modified}
                />
              </div>
              <button type="submit" className="button-primary" disabled={!modified || !validation.rubric || !summary.trim() || save.isPending}>
                {t('settings.save')}
              </button>
              <button type="button" className="button" disabled={!modified} onClick={() => reference && setWorkingCopy(structuredClone(reference))}>
                {t('settings.cancel')}
              </button>
            </div>
            {message && (
              <p role="status" className="text-sm text-slate-700 dark:text-slate-300">
                {message}
              </p>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}
