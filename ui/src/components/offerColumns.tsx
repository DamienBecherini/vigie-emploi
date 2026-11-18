// Columns of the offers table, their default visibility, and the classes of the job title column stuck to the left.
import type { ColumnDef, VisibilityState } from '@tanstack/react-table';
import type { LineOffer } from '../api.ts';
import { t } from '../i18n/index.ts';
import { BadgeScore, BadgeStatus, formatDate } from './Badges.tsx';

/** Columns of the table (labels in the current language: the application is remounted at each language change). */
export const columnDefs = (): ColumnDef<LineOffer>[] => [
  { id: 'score', accessorKey: 'score', header: t('col.score'), cell: (c) => <BadgeScore score={c.row.original.score} /> },
  { id: 'status', accessorKey: 'status', header: t('col.status'), cell: (c) => <BadgeStatus status={c.row.original.status} /> },
  {
    id: 'title',
    accessorKey: 'title',
    header: t('col.title'),
    cell: (c) => <span className="line-clamp-2 font-medium">{c.row.original.title || t('list.withoutTitle')}</span>,
  },
  { id: 'company', accessorKey: 'company', header: t('col.company'), cell: (c) => <span className="line-clamp-2">{c.row.original.company ?? '—'}</span> },
  { id: 'location', accessorKey: 'location', header: t('col.location'), cell: (c) => <span className="line-clamp-2">{c.row.original.location ?? '—'}</span> },
  { id: 'contract', accessorKey: 'contract', header: t('col.contract'), cell: (c) => c.row.original.contract ?? '—' },
  {
    id: 'compensation_min',
    accessorKey: 'compensation',
    header: t('col.compensation'),
    cell: (c) => <span className="line-clamp-2">{c.row.original.compensation ?? '—'}</span>,
  },
  { id: 'remote', accessorKey: 'remote', header: t('col.remote'), cell: (c) => <span className="line-clamp-2">{c.row.original.remote ?? '—'}</span> },
  { id: 'source', accessorKey: 'source', header: t('col.source') },
  {
    id: 'received_at',
    accessorKey: 'received_at',
    header: t('col.received'),
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDate(c.row.original.received_at)}</span>,
  },
  {
    id: 'published_at',
    accessorKey: 'published_at',
    header: t('col.published'),
    cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDate(c.row.original.published_at)}</span>,
  },
  {
    id: 'tags',
    accessorKey: 'tags',
    header: t('col.tags'),
    enableSorting: false,
    cell: (c) => (
      <span className="flex flex-wrap gap-1">
        {c.row.original.tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-200 px-1.5 text-xs dark:bg-slate-700">
            {t}
          </span>
        ))}
      </span>
    ),
  },
  {
    id: 'id',
    accessorKey: 'id',
    header: t('col.id'),
    cell: (c) => <span className="text-slate-500 tabular-nums dark:text-slate-400">{c.row.original.id}</span>,
  },
];

export const VISIBILITY_DEFAULT: VisibilityState = { location: true, contract: false, remote: true, published_at: false, id: false, tags: true };

/**
 * Job title column stuck to the left edge when the table scrolls horizontally. Its shadow (a gradient over the whole
 * height of each cell, so continuous from one line to the next) only appears when it is really stuck and
 * columns pass under it (data-stuck of the container, see HorizontalScroll).
 */
export const STUCK =
  'sticky left-0 z-[1] after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-3 after:bg-linear-to-r after:from-slate-900/15 after:to-transparent after:opacity-0 after:transition-opacity dark:after:from-black/60 group-data-[stuck=true]/scroll:after:opacity-100';
