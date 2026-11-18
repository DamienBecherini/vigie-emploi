import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { Mail, SlidersHorizontal } from 'lucide-react';
import { api } from './api.ts';
import { number, t } from './i18n/index.ts';
import { queryKeys } from './queryKeys.ts';
import { useParameters, usePreference } from './state.ts';
import { useFiltersOpen } from './hooks/useFiltersOpen.ts';
import { useMenusClose } from './hooks/useMenusClose.ts';
import { useOffersList } from './hooks/useOffersList.ts';
import { useScrollUpOnPageChange } from './hooks/useScrollUpOnPageChange.ts';
import { useSearch } from './hooks/useSearch.ts';
import { useShortcuts } from './hooks/useShortcuts.ts';
import { useStickyHeader } from './hooks/useStickyHeader.ts';
import { ActionsAgent, useNotifications } from './components/ActionsAgent.tsx';
import { ButtonRefresh } from './components/ButtonRefresh.tsx';
import { Detail } from './components/Detail.tsx';
import { FiltersPanel } from './components/FiltersPanel.tsx';
import { Mailbox } from './components/Mailbox.tsx';
import { OffersTable } from './components/OffersTable.tsx';
import { VISIBILITY_DEFAULT } from './components/offerColumns.tsx';
import { Preferences } from './components/Preferences.tsx';
import { Settings } from './components/Settings.tsx';
import { Upcoming } from './components/Upcoming.tsx';

export function App() {
  const [params, update] = useParameters();
  const [visibility, setVisibility] = usePreference<VisibilityState>('columns', VISIBILITY_DEFAULT);
  const { narrow, filtersOpen, setFiltersOpen, setDrawerFilters } = useFiltersOpen();
  const [ad, setAd] = useState('');
  const [settings, setSettings] = useState(false);
  const [mailbox, setMailbox] = useState(false);
  const rubric = useQuery({ queryKey: queryKeys.rubric(), queryFn: api.rubric });
  useNotifications();
  const threshold = String(rubric.data?.rubric?.threshold ?? 4.5);
  const [search, setSearch] = useSearch(params, update);

  const { headerRef, lineRef, lowHeader } = useStickyHeader();
  const { page, size, levels, offerChosen, list } = useOffersList(params);
  const barRef = useScrollUpOnPageChange(page, list, lowHeader);
  const meta = useQuery({ queryKey: queryKeys.meta(), queryFn: api.meta });
  useMenusClose();

  const close = useCallback(() => update({ offer: null }), [update]);
  const announce = useCallback((m: string) => {
    setAd(m);
    window.setTimeout(() => setAd((a) => (a === m ? '' : a)), 6000);
  }, []);

  const { shortcut, shortcutActive } = useShortcuts(params, update, threshold, setSearch);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#table" className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-blue-700 px-3 py-2 text-white">
        {t('header.goTable')}
      </a>
      {/* Large screen: the whole header stays stuck at the top, on one line. Narrow window: only the logo +
          search row stays stuck; views and buttons scroll with the page (the header and its block become "contents"). */}
      <header
        ref={headerRef}
        className="max-md:contents md:sticky md:top-0 md:z-10 md:border-b md:border-slate-200 md:bg-white/95 md:px-4 md:py-2 md:backdrop-blur md:dark:border-slate-800 md:dark:bg-slate-900/95"
      >
        <div className="max-md:contents md:flex md:flex-wrap md:items-center md:gap-3">
          <div
            ref={lineRef}
            className="flex items-center gap-3 max-md:sticky max-md:top-0 max-md:z-10 max-md:border-b max-md:border-slate-200 max-md:bg-white/95 max-md:px-4 max-md:py-2 max-md:backdrop-blur md:contents dark:max-md:border-slate-800 dark:max-md:bg-slate-900/95"
          >
            <h1 className="text-lg font-extrabold tracking-tight">
              vigie<span className="text-blue-700 dark:text-blue-400">-emploi</span>
            </h1>
            <div className="min-w-48 flex-1">
              <label htmlFor="search" className="sr-only">
                {t('header.searchLabel')}
              </label>
              <input id="search" type="search" className="field" placeholder={t('header.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 max-md:border-b max-md:border-slate-200 max-md:px-4 max-md:py-2 md:contents dark:max-md:border-slate-800">
            <nav aria-label={t('header.views')} className="flex flex-wrap gap-1">
              {(
                [
                  ['all', t('header.all')],
                  ['to-process', t('header.toProcess')],
                  ['good', t('header.good', { threshold: number(Number(threshold)) })],
                  ['applications', t('header.applications')],
                ] as const
              ).map(([name, label]) => (
                <button
                  key={name}
                  type="button"
                  className={`button ${shortcutActive === name ? 'button-active' : ''}`}
                  aria-pressed={shortcutActive === name}
                  onClick={() => shortcut(name)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <button type="button" className="button" onClick={() => setMailbox(true)} aria-haspopup="dialog">
              <Mail className="size-4" aria-hidden="true" /> {t('header.mail')}
            </button>
            <button type="button" className="button" onClick={() => setSettings(true)} aria-haspopup="dialog">
              <SlidersHorizontal className="size-4" aria-hidden="true" /> {t('header.settings')}
            </button>
            <ButtonRefresh />
            <Preferences />
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-4 p-2 sm:p-4">
        <FiltersPanel narrow={narrow} filtersOpen={filtersOpen} setDrawerFilters={setDrawerFilters} params={params} update={update} meta={meta.data} />
        <main className="min-w-0 flex-1" id="table" tabIndex={-1}>
          {(narrow || !filtersOpen) && <ActionsAgent className="mb-3 max-w-xs" />}
          <Upcoming choose={(id) => update({ offer: String(id) })} />
          <OffersTable
            list={list}
            levels={levels}
            page={page}
            size={size}
            offerChosen={offerChosen}
            visibility={visibility}
            setVisibility={setVisibility}
            update={update}
            filtersOpen={filtersOpen}
            setFiltersOpen={setFiltersOpen}
            barRef={barRef}
          />
        </main>
      </div>

      {offerChosen !== null && <Detail id={offerChosen} close={close} announce={announce} />}
      {mailbox && <Mailbox close={() => setMailbox(false)} announce={announce} />}
      {settings && (
        <Settings
          close={() => setSettings(false)}
          announce={announce}
          choose={(id) => {
            setSettings(false);
            update({ offer: String(id) });
          }}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg transition-opacity dark:bg-slate-100 dark:text-slate-900 ${
          ad ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {ad}
      </div>
    </div>
  );
}
