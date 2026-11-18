// Table of the offers: bar above it (filters button, count, columns, page size), header rows and their stuck copy,
// lines of the current page, and the pagination bar. The sort and the page are written into the URL.
import { useMemo, useRef, type RefObject } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Funnel } from 'lucide-react';
import { locale, t } from '../i18n/index.ts';
import { toggleLevel, writeLevels, type Level } from '../sort.ts';
import type { UpdateParameters } from '../state.ts';
import type { OffersList } from '../hooks/useOffersList.ts';
import { ChoiceColumns } from './ChoiceColumns.tsx';
import { HorizontalScroll } from './HorizontalScroll.tsx';
import { StickyHeader } from './StickyHeader.tsx';
import { columnDefs, STUCK } from './offerColumns.tsx';

const SIZES = [25, 50, 100, 200, 500];

export function OffersTable({
  list,
  levels,
  page,
  size,
  offerChosen,
  visibility,
  setVisibility,
  update,
  filtersOpen,
  setFiltersOpen,
  barRef,
}: {
  list: OffersList;
  levels: Level[];
  page: number;
  size: number;
  offerChosen: number | null;
  visibility: VisibilityState;
  setVisibility: (v: VisibilityState) => void;
  update: UpdateParameters;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  /** Bar above the table: target of the scroll-up on page change. */
  barRef: RefObject<HTMLDivElement | null>;
}) {
  // Table and its horizontal scroll container (measured by the stuck copy of the header).
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(columnDefs, []);

  const tri2: SortingState = useMemo(() => levels.map((n) => ({ id: n.column, desc: n.order === 'desc' })), [levels]);
  const table = useReactTable({
    data: list.data?.offers ?? [],
    columns,
    manualSorting: true,
    manualPagination: true,
    pageCount: list.data?.pages ?? 1,
    state: { sorting: tri2, columnVisibility: visibility },
    onColumnVisibilityChange: (updated) => setVisibility(typeof updated === 'function' ? updated(visibility) : updated),
    onSortingChange: (updated) => {
      const s = typeof updated === 'function' ? updated(tri2) : updated;
      if (!s.length) update({ sort: null, order: null, page: null });
      else update({ sort: writeLevels(s.map((x) => ({ column: x.id, order: x.desc ? 'desc' : 'asc' }))), order: null, page: null });
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  });

  const total = list.data?.total ?? 0;
  const pages = list.data?.pages ?? 1;

  /** Lines of the table header; `copy`: those of the stuck copy (StickyHeader), out of the tab order. */
  const linesHeader = (copy: boolean) =>
    table.getHeaderGroups().map((hg) => (
      <tr key={hg.id}>
        {hg.headers.map((h) => {
          const sortable = h.column.getCanSort();
          const direction = h.column.getIsSorted();
          const rank = levels.findIndex((n) => n.column === h.column.id);
          return (
            <th
              key={h.id}
              scope="col"
              data-column-stuck={!copy && h.column.id === 'title' ? '' : undefined}
              aria-sort={copy ? undefined : direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
              className={`bg-slate-100 px-2 py-2 font-semibold whitespace-nowrap text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${h.column.id === 'title' ? STUCK : ''}`}
            >
              {sortable ? (
                <button
                  type="button"
                  tabIndex={copy ? -1 : undefined}
                  className="inline-flex items-center gap-1 rounded hover:underline"
                  title={t('list.titleSort')}
                  onClick={() => update({ sort: writeLevels(toggleLevel(levels, h.column.id)), order: null, page: null })}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {direction === 'asc' ? (
                    <ArrowUp className="size-3.5" aria-hidden="true" />
                  ) : direction === 'desc' ? (
                    <ArrowDown className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                  )}
                  {levels.length > 1 && rank >= 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400" role="img" aria-label={t('list.levelSort', { n: rank + 1 })}>
                      {rank + 1}
                    </span>
                  )}
                </button>
              ) : (
                flexRender(h.column.columnDef.header, h.getContext())
              )}
            </th>
          );
        })}
      </tr>
    ));

  return (
    <>
      <div ref={barRef} className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Funnel className="size-4" aria-hidden="true" /> {filtersOpen ? t('list.hideFilters') : t('list.showFilters')}
        </button>
        <p className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
          {list.isLoading ? t('list.loading') : t('list.countOffers', { n: total.toLocaleString(locale()) })}
          {list.isFetching && !list.isLoading ? t('list.miseToDay') : ''}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <ChoiceColumns table={table} />
          <label className="flex items-center gap-1 text-sm">
            {t('list.byPage')}
            <select className="field w-20" value={size} onChange={(e) => update({ size: e.target.value === '50' ? null : e.target.value, page: null })}>
              {SIZES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {list.isError && (
        <p role="alert" className="mb-2 rounded border border-rose-300 bg-rose-50 p-2 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
          {(list.error as Error).message}
        </p>
      )}

      {/* Table block: the stuck copy of the header (StickyHeader) does not go beyond its end. */}
      <div>
        <StickyHeader tableRef={tableRef} scrollRef={scrollRef} lines={linesHeader(true)} />
        <HorizontalScroll
          refContainer={scrollRef}
          shadowLeft={false}
          className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <table ref={tableRef} className="w-full border-collapse text-sm">
            <caption className="sr-only">
              {t('list.legend', {
                levels: levels
                  .map(
                    (n) =>
                      `${String(columns.find((c) => c.id === n.column)?.header ?? n.column)} (${n.order === 'asc' ? t('list.ascending') : t('list.descending')})`,
                  )
                  .join(t('list.then')),
              })}
            </caption>
            <thead className="bg-slate-100 text-left dark:bg-slate-800">{linesHeader(false)}</thead>
            <tbody>
              {table.getRowModel().rows.map((r) => {
                const chosen = r.original.id === offerChosen;
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    aria-selected={chosen}
                    onClick={() => update({ offer: String(r.original.id) })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        update({ offer: String(r.original.id) });
                      }
                    }}
                    className={`cursor-pointer border-t border-slate-200 align-top hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                      chosen ? 'bg-blue-100 dark:bg-blue-950' : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    {r.getVisibleCells().map((c) => (
                      // Stuck job title: background inherited from the line (hover, selection) to hide the columns passing under it.
                      <td key={c.id} className={`px-2 py-1.5 ${c.column.id === 'title' ? `min-w-64 max-md:min-w-44 ${STUCK} bg-inherit` : ''}`}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!list.isLoading && total === 0 && (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="p-6 text-center text-slate-600 dark:text-slate-400">
                    {t('list.none')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>

      <nav aria-label={t('list.pagination')} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: null })}>
          <ChevronsLeft className="size-4" aria-hidden="true" /> {t('list.first')}
        </button>
        <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}>
          <ChevronLeft className="size-4" aria-hidden="true" /> {t('list.previous')}
        </button>
        <span className="tabular-nums">{t('list.page', { page, pages })}</span>
        <button type="button" className="button" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
          {t('list.next')} <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className="button" disabled={page >= pages} onClick={() => update({ page: String(pages) })}>
          {t('list.last')} <ChevronsRight className="size-4" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}
