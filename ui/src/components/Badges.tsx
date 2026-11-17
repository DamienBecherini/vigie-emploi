import type { Status } from '../../../src/core/statuses.ts';
import { number, statusShown, t } from '../i18n/index.ts';

const COLORS: Record<Status, string> = {
  new: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  'to-read': 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  scored: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  dismissed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  go: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  // Fixed violet: does not follow the palette's accent (otherwise too close to "Go" with a warm accent).
  sent: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  'followed-up': 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  interview: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
  closed: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  withdrawn: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function BadgeStatus({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${COLORS[status] ?? ''}`}>
      {statusShown(status)}
    </span>
  );
}

export function formatScore(n: number | null): string {
  return n === null ? '—' : number(n, 1);
}

export function BadgeScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-500 dark:text-slate-400" role="img" aria-label={t('badge.unscored')}>—</span>;
  const c =
    score >= 6
      ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-950'
      : score >= 4.5
        ? 'bg-amber-200 text-amber-950 dark:bg-amber-300 dark:text-slate-950'
        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
  return (
    <span className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-sm font-bold tabular-nums ${c}`}>
      {formatScore(score)}
    </span>
  );
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  const m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return d;
  return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`;
}
