// Drop-down menu of the offers table to show or hide its columns (the job title always stays).
import type { useReactTable } from '@tanstack/react-table';
import { Columns3 } from 'lucide-react';
import type { LineOffer } from '../api.ts';
import { t } from '../i18n/index.ts';

export function ChoiceColumns({ table }: { table: ReturnType<typeof useReactTable<LineOffer>> }) {
  return (
    <details className="relative" data-menu>
      <summary className="button cursor-pointer list-none">
        <Columns3 className="size-4" aria-hidden="true" /> {t('list.columns')}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-slate-300 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
        {table.getAllLeafColumns().map((col) => (
          <label key={col.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-blue-700 dark:accent-blue-400"
              checked={col.getIsVisible()}
              disabled={col.id === 'title'}
              onChange={col.getToggleVisibilityHandler()}
            />
            {String(col.columnDef.header)}
          </label>
        ))}
      </div>
    </details>
  );
}
