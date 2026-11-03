import { LIBELLES_STATUTS, type Statut } from '../../../src/core/statuts.ts';

const COULEURS: Record<Statut, string> = {
  nouvelle: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  'a-lire': 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  notee: 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100',
  ecartee: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  go: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  // Violet fixe : ne suit pas l'accent de la palette (sinon trop proche de « Go » avec un accent chaud).
  envoyee: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  relancee: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  entretien: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  refus: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100',
  close: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  abandonnee: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function BadgeStatut({ statut }: { statut: Statut }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${COULEURS[statut] ?? ''}`}>
      {LIBELLES_STATUTS[statut] ?? statut}
    </span>
  );
}

export function formaterNote(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function BadgeNote({ note }: { note: number | null }) {
  if (note === null) return <span className="text-slate-500 dark:text-slate-400" aria-label="sans note">—</span>;
  const c =
    note >= 6
      ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-950'
      : note >= 4.5
        ? 'bg-amber-200 text-amber-950 dark:bg-amber-300 dark:text-slate-950'
        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
  return (
    <span className={`inline-block min-w-9 rounded px-1.5 py-0.5 text-center text-sm font-bold tabular-nums ${c}`}>
      {formaterNote(note)}
    </span>
  );
}

export function formaterDate(d: string | null): string {
  if (!d) return '—';
  const m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return d;
  return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`;
}
