// Filters beside the table: a column on a large screen (with the agent actions above them), a drawer on a phone.
import { X } from 'lucide-react';
import type { Meta } from '../api.ts';
import { t } from '../i18n/index.ts';
import type { UpdateParameters } from '../state.ts';
import { ActionsAgent } from './ActionsAgent.tsx';
import { Filters } from './Filters.tsx';

export function FiltersPanel({
  narrow,
  filtersOpen,
  setDrawerFilters,
  params,
  update,
  meta,
}: {
  narrow: boolean;
  filtersOpen: boolean;
  setDrawerFilters: (open: boolean) => void;
  params: URLSearchParams;
  update: UpdateParameters;
  meta: Meta | undefined;
}) {
  return (
    <>
      {filtersOpen && !narrow && (
        <aside
          aria-label={t('list.filters')}
          className="w-64 shrink-0 self-start rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <ActionsAgent className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800" />
          <Filters params={params} update={update} meta={meta} />
        </aside>
      )}
      {filtersOpen && narrow && (
        <div className="fixed inset-0 z-40">
          {/* Page behind: darkened and blurred, so that the drawer stands out from it in the dark theme too. */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] dark:bg-black/55" aria-hidden="true" onClick={() => setDrawerFilters(false)} />
          <aside
            aria-label={t('list.filters')}
            className="absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col border-r border-slate-300 bg-white shadow-2xl shadow-black/50 dark:border-slate-500 dark:bg-slate-800 dark:shadow-black"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-600">
              <h2 className="font-semibold">{t('list.filters')}</h2>
              <button
                type="button"
                className="button"
                // biome-ignore lint/a11y/noAutofocus: the drawer has just been opened by the user, focus moves into it
                autoFocus
                onClick={() => setDrawerFilters(false)}
                aria-label={t('list.hideFilters')}
                title={t('list.hideFilters')}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <Filters params={params} update={update} meta={meta} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
