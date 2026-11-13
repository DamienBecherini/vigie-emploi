import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { STATUSES_TO_PROCESS } from '../../src/core/statuses.ts';
import { api, type LineOffer } from './api.ts';
import { toggleLevel, writeLevels, readLevels } from './sort.ts';
import { chooseLanguage, language, LANGUAGES, locale, NAMES_LANGUAGES, number, t, type Language } from './i18n/index.ts';
import { useParameters, usePreference, usePreferenceText, useDebounce, KEYS_FILTERS } from './state.ts';
import { BadgeScore, BadgeStatus, formatDate } from './components/Badges.tsx';
import { Filters } from './components/Filters.tsx';
import { ScrollHorizontal } from './components/ScrollHorizontal.tsx';
import { StickyHeader } from './components/StickyHeader.tsx';
import { Detail } from './components/Detail.tsx';
import { Upcoming } from './components/Upcoming.tsx';
import { ActionsAgent, useNotifications } from './components/ActionsAgent.tsx';
import { Settings } from './components/Settings.tsx';
import { ChoiceTheme, type Mode } from './components/Theme.tsx';
import {
  applyPalette,
  PALETTE_LIGHT_DEFAULT,
  PALETTE_DARK_DEFAULT,
  PALETTES_LIGHT,
  PALETTES_DARK,
  PERSONAL_DEFAULT,
  findPalette,
  variablesPalette,
  type Palette,
} from './theme.ts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Funnel,
  RefreshCw,
  Moon,
  Palette as PaletteIcon,
  SlidersHorizontal,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const SIZES = [25, 50, 100, 200, 500];

/** Colonnes du tableau (libellés dans la langue courante : l'application est remontée à chaque changement de langue). */
const columnDefs = (): ColumnDef<LineOffer>[] => [
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
  { id: 'received_at', accessorKey: 'received_at', header: t('col.received'), cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDate(c.row.original.received_at)}</span> },
  { id: 'published_at', accessorKey: 'published_at', header: t('col.published'), cell: (c) => <span className="whitespace-nowrap tabular-nums">{formatDate(c.row.original.published_at)}</span> },
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
  { id: 'id', accessorKey: 'id', header: t('col.id'), cell: (c) => <span className="text-slate-500 tabular-nums dark:text-slate-400">{c.row.original.id}</span> },
];

const VISIBILITY_DEFAULT: VisibilityState = { location: true, contract: false, remote: true, published_at: false, id: false, tags: true };

/** Recharge toutes les données depuis la base (modifications faites par la CLI ou une IA). */
function ButtonRefresh() {
  const client = useQueryClient();
  const inProgress = useIsFetching() > 0;
  return (
    <button
      type="button"
      className="button"
      onClick={() => client.invalidateQueries()}
      aria-label={t('header.refresh')}
      title={t('header.refresh')}
      aria-busy={inProgress}
    >
      <RefreshCw className={`size-4 ${inProgress ? 'animate-spin' : ''}`} aria-hidden="true" />
    </button>
  );
}

/** Écran étroit (téléphone, moins de 768 px) : les filtres passent dans un tiroir au lieu d'une colonne. */
const NARROW_SCREEN = '(max-width: 767px)';

/**
 * Colonne Intitulé collée au bord gauche quand le tableau défile horizontalement. Son ombre (un dégradé sur toute la
 * hauteur de chaque cellule, donc continu d'une ligne à l'autre) n'apparaît que lorsqu'elle est réellement collée et
 * que des colonnes passent dessous (data-collee du conteneur, voir DefilementHorizontal).
 */
const STUCK =
  'sticky left-0 z-[1] after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-3 after:bg-linear-to-r after:from-slate-900/15 after:to-transparent after:opacity-0 after:transition-opacity dark:after:from-black/60 group-data-[stuck=true]/scroll:after:opacity-100';

function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_SCREEN).matches);
  useEffect(() => {
    const media = window.matchMedia(NARROW_SCREEN);
    const updated = () => setNarrow(media.matches);
    media.addEventListener('change', updated);
    return () => media.removeEventListener('change', updated);
  }, []);
  return narrow;
}

function useDarkSystem(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updated = () => setDark(media.matches);
    media.addEventListener('change', updated);
    return () => media.removeEventListener('change', updated);
  }, []);
  return dark;
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`vigie-emploi:${key}`, JSON.stringify(value));
  } catch {
    /* stockage indisponible : la préférence vaut pour la session */
  }
}

/** Langue de l'interface : le choix est mémorisé (localStorage) et l'emporte sur la configuration. */
function ChoiceLanguage() {
  // Codes courts dans l'en-tête (FR / EN), nom complet de la langue dans l'infobulle de chaque option.
  return (
    <select
      className="field py-1 text-sm"
      style={{ width: 'auto' }}
      value={language()}
      onChange={(e) => chooseLanguage(e.target.value as Language)}
      aria-label={t('header.language')}
      title={t('header.language')}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l} lang={l} title={NAMES_LANGUAGES[l]}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function Preferences() {
  const [mode, setMode] = usePreferenceText('theme', 'system') as [Mode, (m: Mode) => void];
  const [paletteLight, setPaletteLight] = usePreferenceText('palette-light', PALETTE_LIGHT_DEFAULT);
  const [paletteDark, setPaletteDark] = usePreferenceText('palette-dark', PALETTE_DARK_DEFAULT);
  const [personalLight, setPersonalLight] = usePreference<Palette>('palette-personal-light', PERSONAL_DEFAULT);
  const [personalDark, setPersonalDark] = usePreference<Palette>('palette-personal-dark', PERSONAL_DEFAULT);
  const [zoom, setZoom] = usePreference<number>('zoom', 100);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const darkSystem = useDarkSystem();
  const dark = mode === 'dark' || (mode === 'system' && darkSystem);
  const light = findPalette(PALETTES_LIGHT, paletteLight, personalLight);
  const darkPalette = findPalette(PALETTES_DARK, paletteDark, personalDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    applyPalette(dark ? darkPalette : light);
    // Variables reprises par le script de index.html au chargement suivant (pas de flash de couleurs).
    save('palette-vars-light', variablesPalette(light));
    save('palette-vars-dark', variablesPalette(darkPalette));
  }, [dark, light, darkPalette]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom}%`;
  }, [zoom]);
  const close = useCallback(() => setDrawerOpen(false), []);
  return (
    <div className="flex items-center gap-1">
      <ChoiceLanguage />
      <button
        type="button"
        className="button"
        onClick={() => setMode(dark ? 'light' : 'dark')}
        aria-label={dark ? t('theme.toLight') : t('theme.toDark')}
        title={dark ? t('theme.toLight') : t('theme.toDark')}
      >
        {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      </button>
      <button type="button" className="button" onClick={() => setDrawerOpen(true)} aria-haspopup="dialog" title={t('theme.palettes')}>
        <PaletteIcon className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{t('theme.button')}</span>
      </button>
      <div role="group" aria-label={t('zoom.group')} className="flex items-center">
        <button type="button" className="button rounded-r-none" onClick={() => setZoom(Math.max(75, zoom - 10))} aria-label={t('zoom.collapse')} title={t('zoom.collapse')}>
          <ZoomOut className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="border-y border-slate-300 bg-white px-2 py-1 text-sm whitespace-nowrap tabular-nums hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          onClick={() => setZoom(100)}
          aria-live="polite"
          aria-label={t('zoom.size', { zoom })}
          title={t('zoom.back')}
        >
          {zoom} %
        </button>
        <button type="button" className="button rounded-l-none" onClick={() => setZoom(Math.min(175, zoom + 10))} aria-label={t('zoom.expand')} title={t('zoom.expand')}>
          <ZoomIn className="size-4" aria-hidden="true" />
        </button>
      </div>
      {drawerOpen && (
        <ChoiceTheme
          close={close}
          mode={mode}
          setMode={setMode}
          light={{ palettes: PALETTES_LIGHT, chosen: paletteLight, choose: setPaletteLight, personal: personalLight, setPersonal: setPersonalLight }}
          dark={{ palettes: PALETTES_DARK, chosen: paletteDark, choose: setPaletteDark, personal: personalDark, setPersonal: setPersonalDark }}
        />
      )}
    </div>
  );
}

function ChoiceColumns({ table }: { table: ReturnType<typeof useReactTable<LineOffer>> }) {
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

export function App() {
  const [params, update] = useParameters();
  const [visibility, setVisibility] = usePreference<VisibilityState>('columns', VISIBILITY_DEFAULT);
  // Colonne des filtres sur grand écran (préférence retenue) ; tiroir fermé par défaut sur téléphone.
  const [columnFilters, setColumnFilters] = usePreference<boolean>('filters-open', true);
  const [drawerFilters, setDrawerFilters] = useState(false);
  const narrow = useNarrowScreen();
  const filtersOpen = narrow ? drawerFilters : columnFilters;
  const setFiltersOpen = narrow ? setDrawerFilters : setColumnFilters;
  useEffect(() => {
    if (!narrow || !drawerFilters) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerFilters(false);
    };
    document.addEventListener('keydown', onKey);
    // La page derrière le tiroir ne défile pas.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [narrow, drawerFilters]);
  const [ad, setAd] = useState('');
  const [settings, setSettings] = useState(false);
  const rubric = useQuery({ queryKey: ['rubric'], queryFn: api.rubric });
  useNotifications();
  const threshold = String(rubric.data?.rubric?.threshold ?? 4.5);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const searchDeferred = useDebounce(search, 300);

  useEffect(() => {
    if ((params.get('q') ?? '') !== searchDeferred) update({ q: searchDeferred || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDeferred]);

  const page = Number(params.get('page') ?? 1);
  const size = Number(params.get('size') ?? 50);

  // Repères de mise en page : en-tête de l'application (et sa rangée collée en fenêtre étroite), barre au-dessus du
  // tableau (cible de la remontée au changement de page), tableau et son conteneur à défilement horizontal.
  const headerRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Partie collée de l'en-tête : tout l'en-tête sur grand écran, la rangée de recherche en fenêtre étroite. */
  const partStuck = useCallback(() => {
    const header = headerRef.current;
    return header && getComputedStyle(header).display !== 'contents' ? header : lineRef.current;
  }, []);
  const lowHeader = useCallback(() => partStuck()?.getBoundingClientRect().bottom ?? 0, [partStuck]);
  // Hauteur de la partie collée dans --header-height : la copie collée de l'en-tête du tableau se place dessous (CSS).
  useEffect(() => {
    const updated = () => document.documentElement.style.setProperty('--header-height', `${partStuck()?.offsetHeight ?? 0}px`);
    updated();
    const obs = new ResizeObserver(updated);
    for (const el of [headerRef.current, lineRef.current]) if (el) obs.observe(el);
    window.addEventListener('resize', updated);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', updated);
    };
  }, [partStuck]);
  // La remontée attend les lignes de la nouvelle page (effet plus bas, après la requête) : une page plus courte
  // (souvent la dernière) réduit la hauteur du document à leur arrivée, ce qui recale le défilement et casserait
  // une remontée lancée trop tôt.
  const pagePrevious = useRef(page);
  const scrollUpPending = useRef(false);
  if (pagePrevious.current !== page) {
    pagePrevious.current = page;
    scrollUpPending.current = true;
  }
  // Tri sur un ou plusieurs niveaux : ?tri=recue_le:desc,note:desc (ancien format : ?tri=note&ordre=asc).
  const orderDefault = params.get('order') === 'asc' ? 'asc' : 'desc';
  const levels = useMemo(() => readLevels(params.get('sort'), orderDefault), [params, orderDefault]);
  const sort = writeLevels(levels);
  const offerChosen = params.get('offer') ? Number(params.get('offer')) : null;

  const request = new URLSearchParams(params);
  request.delete('offer');
  request.set('sort', sort);
  request.delete('order');
  if (!request.has('size')) request.set('size', String(size));
  const key = request.toString();

  const columns = useMemo(columnDefs, []);
  const list = useQuery({ queryKey: ['offers', key], queryFn: () => api.offers(request), placeholderData: keepPreviousData });

  // Changement de page : une fois les lignes de la nouvelle page affichées (plus les données de l'ancienne gardées en
  // attendant), si la barre au-dessus du tableau est sortie de l'écran, on remonte jusqu'à elle, sous l'en-tête collé.
  const pageReady = list.data !== undefined && !list.isPlaceholderData;
  useEffect(() => {
    if (!scrollUpPending.current || !pageReady) return;
    scrollUpPending.current = false;
    const bar = barRef.current;
    if (!bar) return;
    const subHeader = lowHeader() + 8;
    const high = bar.getBoundingClientRect().top;
    if (high >= subHeader) return;
    // Saut immédiat (pas d'animation) : on veut voir tout de suite le haut de la nouvelle page, et une animation est
    // interrompue par le navigateur quand la hauteur du contenu change encore (recalage du défilement).
    window.scrollTo({ top: window.scrollY + high - subHeader, behavior: 'instant' });
  }, [pageReady, list.data, page, lowHeader]);
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });

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

  // Menus déroulants (<details data-menu>) : un clic ailleurs ou Échap les referme.
  useEffect(() => {
    const open = () => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]');
    const onClick = (e: MouseEvent) => {
      for (const d of open()) if (!d.contains(e.target as Node)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') for (const d of open()) d.open = false;
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const close = useCallback(() => update({ offer: null }), [update]);
  const announce = useCallback((m: string) => {
    setAd(m);
    window.setTimeout(() => setAd((a) => (a === m ? '' : a)), 6000);
  }, []);

  const shortcut = (name: 'all' | 'to-process' | 'applications' | 'good') => {
    const empty = Object.fromEntries([...KEYS_FILTERS, 'page'].map((k) => [k, null])) as Record<string, null>;
    if (name === 'all') update(empty);
    if (name === 'to-process') update({ ...empty, status: STATUSES_TO_PROCESS.join(',') });
    if (name === 'applications') update({ ...empty, applications: '1' });
    if (name === 'good') update({ ...empty, scoreMin: threshold, status: 'scored,go' });
    setSearch('');
  };
  const shortcutActive =
    params.get('applications') === '1'
      ? 'applications'
      : params.get('status') === STATUSES_TO_PROCESS.join(',')
        ? 'to-process'
        : params.get('scoreMin') === threshold && params.get('status') === 'scored,go'
          ? 'good'
          : KEYS_FILTERS.some((k) => params.has(k))
            ? null
            : 'all';

  const total = list.data?.total ?? 0;
  const pages = list.data?.pages ?? 1;

  /** Lignes de l'en-tête du tableau ; `copie` : celles de la copie collée (EnteteColle), hors de l'ordre de tabulation. */
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
                    <span className="text-xs text-slate-500 dark:text-slate-400" aria-label={t('list.levelSort', { n: rank + 1 })}>
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
    <div className="flex min-h-screen flex-col">
      <a href="#table" className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-blue-700 px-3 py-2 text-white">
        {t('header.goTable')}
      </a>
      {/* Grand écran : tout l'en-tête reste collé en haut, sur une ligne. Fenêtre étroite : seule la rangée logo +
          recherche reste collée ; vues et boutons défilent avec la page (l'en-tête et son bloc deviennent « contents »). */}
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
            <input
              id="search"
              type="search"
              className="field"
              placeholder={t('header.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          <button type="button" className="button" onClick={() => setSettings(true)} aria-haspopup="dialog">
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {t('header.settings')}
          </button>
          <ButtonRefresh />
          <Preferences />
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-4 p-2 sm:p-4">
        {filtersOpen && !narrow && (
          <aside aria-label={t('list.filters')} className="w-64 shrink-0 self-start rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <ActionsAgent className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800" />
            <Filters params={params} update={update} meta={meta.data} />
          </aside>
        )}
        {filtersOpen && narrow && (
          <div className="fixed inset-0 z-40">
            {/* Page derrière : assombrie et floutée, pour que le tiroir s'en détache aussi en thème sombre. */}
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
                  autoFocus
                  onClick={() => setDrawerFilters(false)}
                  aria-label={t('list.hideFilters')}
                  title={t('list.hideFilters')}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <Filters params={params} update={update} meta={meta.data} />
              </div>
            </aside>
          </div>
        )}
        <main className="min-w-0 flex-1" id="table" tabIndex={-1}>
          {(narrow || !filtersOpen) && <ActionsAgent className="mb-3 max-w-xs" />}
          <Upcoming choose={(id) => update({ offer: String(id) })} />
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
                <select
                  className="field w-20"
                  value={size}
                  onChange={(e) => update({ size: e.target.value === '50' ? null : e.target.value, page: null })}
                >
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

          {/* Bloc du tableau : la copie collée de l'en-tête (EnteteColle) ne dépasse pas sa fin. */}
          <div>
          <StickyHeader tableRef={tableRef} scrollRef={scrollRef} lines={linesHeader(true)} />
          <ScrollHorizontal
            refContainer={scrollRef}
            shadowLeft={false}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <table ref={tableRef} className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {t('list.legend', {
                  levels: levels
                    .map((n) => `${String(columns.find((c) => c.id === n.column)?.header ?? n.column)} (${n.order === 'asc' ? t('list.ascending') : t('list.descending')})`)
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
                        // Intitulé collé : fond hérité de la ligne (survol, sélection) pour masquer les colonnes qui passent dessous.
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
          </ScrollHorizontal>
          </div>

          <nav aria-label={t('list.pagination')} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: null })}>
              <ChevronsLeft className="size-4" aria-hidden="true" /> {t('list.first')}
            </button>
            <button type="button" className="button" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}>
              <ChevronLeft className="size-4" aria-hidden="true" /> {t('list.previous')}
            </button>
            <span className="tabular-nums">
              {t('list.page', { page, pages })}
            </span>
            <button type="button" className="button" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
              {t('list.next')} <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className="button" disabled={page >= pages} onClick={() => update({ page: String(pages) })}>
              {t('list.last')} <ChevronsRight className="size-4" aria-hidden="true" />
            </button>
          </nav>
        </main>
      </div>

      {offerChosen !== null && <Detail id={offerChosen} close={close} announce={announce} />}
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
