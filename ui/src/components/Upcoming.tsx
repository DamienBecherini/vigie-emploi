// "Upcoming" banner of the main screen: overdue deadlines and those of the next 7 days, and statistics.
// Beyond 10 deadlines, the list scrolls; showing the statistics is remembered (localStorage).
import { useLayoutEffect, useRef, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type DeadlineOffer } from '../api.ts';
import { usePreference } from '../state.ts';
import { BadgeType, dateEvent } from './Journal.tsx';
import { ShadowsVertical, useShadowsVertical } from './ShadowsVertical.tsx';
import { number, t } from '../i18n/index.ts';

/** Number of deadlines visible before the scroll bar. */
const VISIBLE = 10;

function Element({ e, choose }: { e: DeadlineOffer; choose: (id: number) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => choose(e.offer_id)}
        className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-2 py-1 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 ${
          e.overdue ? 'text-rose-900 dark:text-rose-200' : ''
        }`}
      >
        <span className="font-semibold whitespace-nowrap tabular-nums">{dateEvent(e.at)}</span>
        <BadgeType type={e.type} />
        <span className="font-semibold">{e.company ?? e.title}</span>
        {/* Minimum width: without room next to the date and the company, the whole summary goes to the next line. */}
        <span className="min-w-[min(14rem,100%)] flex-1 break-words">{e.summary}</span>
      </button>
    </li>
  );
}

function Statistics() {
  const q = useQuery({ queryKey: ['statistics'], queryFn: api.statistics });
  const s = q.data;
  if (!s) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('stats.loading')}</p>;
  const steps: [string, number][] = [
    [t('stats.sent'), s.sent],
    [t('stats.reply'), s.replies],
    [t('stats.interview'), s.interviews],
    [t('stats.proposal'), s.proposals],
  ];
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950">
      <h3 className="mb-2 font-bold">{t('stats.title')}</h3>
      <ul className="space-y-1">
        {steps.map(([name, n]) => (
          <li key={name} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2">
            <span>{name}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-blue-700 dark:bg-blue-400"
                style={{ width: `${s.sent ? (n / s.sent) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-slate-700 dark:text-slate-300">
        {s.average_reply_days === null
          ? t('stats.notEnough')
          : t('stats.timeout', { days: number(s.average_reply_days), n: s.reply_sample_size })}
      </p>
    </div>
  );
}

/** Maximum height of the list: that of the first VISIBLE deadlines (lines of variable height). */
function useLimitedHeight(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const lines = el.querySelectorAll('li');
      if (lines.length <= VISIBLE) return setMax(null);
      const last = lines[VISIBLE - 1];
      const high = el.getBoundingClientRect().top - el.scrollTop;
      setMax(Math.ceil(last.getBoundingClientRect().bottom - high) + 4);
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [dependency]);
  return { ref, max };
}

export function Upcoming({ choose }: { choose: (id: number) => void }) {
  const q = useQuery({ queryKey: ['deadlines'], queryFn: () => api.deadlines(7) });
  const r = q.data;
  const nothing = r && !r.overdue.length && !r.upcoming.length;
  const [stats, setStats] = usePreference<boolean>('statistics-visible', false);
  const { ref, max } = useLimitedHeight(r);
  const shadows = useShadowsVertical(ref, Boolean(max));
  return (
    <section
      aria-labelledby="upcoming-title"
      className="mb-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h2 id="upcoming-title" className="font-bold">
          {t('upcoming.title')}
        </h2>
        {r && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {r.overdue.length > 0 && <strong className="text-rose-800 dark:text-rose-300">{t('upcoming.overdueCount', { n: r.overdue.length })}</strong>}
            {t('upcoming.deadlines', { n: r.upcoming.length })}
          </p>
        )}
        <button type="button" className="button ml-auto" aria-pressed={stats} onClick={() => setStats(!stats)}>
          <ChartColumn className="size-4" aria-hidden="true" /> {stats ? t('upcoming.hideStats') : t('upcoming.stats')}
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-96">
          {q.isError && <p className="px-1 text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
          {nothing && (
            <p className="px-1 text-sm text-slate-600 dark:text-slate-400">{t('upcoming.nothing')}</p>
          )}
          {/* Scrolling list: never more than 40 % of the screen, framed, shaded at the top / bottom when hidden
              deadlines remain on that side, and on a phone a free strip on the right to scroll the page with the thumb. */}
          <div className={max ? 'relative mt-1 max-md:mr-10' : ''}>
          <div
            ref={ref}
            className={max ? 'overflow-y-auto rounded-md border border-slate-200 p-1 pr-1 dark:border-slate-700' : ''}
            style={max ? { maxHeight: `min(${max}px, 40vh)` } : undefined}
            tabIndex={max ? 0 : undefined}
            aria-label={max ? t('upcoming.scrolling') : undefined}
          >
            {r && r.overdue.length > 0 && (
              <div className="mt-1 rounded-md border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950">
                <h3 className="px-2 pt-1 text-xs font-bold tracking-wide text-rose-900 uppercase dark:text-rose-200">{t('upcoming.overdue')}</h3>
                <ul>
                  {r.overdue.map((e) => (
                    <Element key={e.id} e={e} choose={choose} />
                  ))}
                </ul>
              </div>
            )}
            {r && r.upcoming.length > 0 && (
              <ul className="mt-1">
                {r.upcoming.map((e) => (
                  <Element key={e.id} e={e} choose={choose} />
                ))}
              </ul>
            )}
          </div>
          {max && <ShadowsVertical {...shadows} />}
          </div>
        </div>
        {/* Statistics under the header (near their button) as long as room is lacking; to the right of the list on a large screen. */}
        {stats && (
          <div className="order-first mt-1 w-full lg:order-none lg:w-80">
            <Statistics />
          </div>
        )}
      </div>
    </section>
  );
}
