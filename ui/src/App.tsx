import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { STATUTS_A_TRAITER } from '../../src/core/statuts.ts';
import { api, type LigneOffre } from './api.ts';
import { useParametres, usePreference, usePreferenceTexte, useDebounce, CLES_FILTRES } from './etat.ts';
import { BadgeNote, BadgeStatut, formaterDate } from './composants/Badges.tsx';
import { Filtres } from './composants/Filtres.tsx';
import { Detail } from './composants/Detail.tsx';

const TAILLES = [25, 50, 100, 200, 500];

const COLONNES: ColumnDef<LigneOffre>[] = [
  { id: 'note', accessorKey: 'note', header: 'Note', cell: (c) => <BadgeNote note={c.row.original.note} /> },
  { id: 'statut', accessorKey: 'statut', header: 'Statut', cell: (c) => <BadgeStatut statut={c.row.original.statut} /> },
  {
    id: 'titre',
    accessorKey: 'titre',
    header: 'Intitulé',
    cell: (c) => <span className="line-clamp-2 font-medium">{c.row.original.titre || '(sans titre)'}</span>,
  },
  { id: 'entreprise', accessorKey: 'entreprise', header: 'Entreprise', cell: (c) => <span className="line-clamp-2">{c.row.original.entreprise ?? '—'}</span> },
  { id: 'lieu', accessorKey: 'lieu', header: 'Lieu', cell: (c) => <span className="line-clamp-2">{c.row.original.lieu ?? '—'}</span> },
  { id: 'contrat', accessorKey: 'contrat', header: 'Contrat', cell: (c) => c.row.original.contrat ?? '—' },
  {
    id: 'remuneration_min',
    accessorKey: 'remuneration',
    header: 'Rémunération',
    cell: (c) => <span className="line-clamp-2">{c.row.original.remuneration ?? '—'}</span>,
  },
  { id: 'teletravail', accessorKey: 'teletravail', header: 'Télétravail', cell: (c) => <span className="line-clamp-2">{c.row.original.teletravail ?? '—'}</span> },
  { id: 'source', accessorKey: 'source', header: 'Source' },
  { id: 'recue_le', accessorKey: 'recue_le', header: 'Reçue', cell: (c) => <span className="whitespace-nowrap tabular-nums">{formaterDate(c.row.original.recue_le)}</span> },
  { id: 'publiee_le', accessorKey: 'publiee_le', header: 'Publiée', cell: (c) => <span className="whitespace-nowrap tabular-nums">{formaterDate(c.row.original.publiee_le)}</span> },
  {
    id: 'tags',
    accessorKey: 'tags',
    header: 'Tags',
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
  { id: 'id', accessorKey: 'id', header: 'N°', cell: (c) => <span className="text-slate-500 tabular-nums dark:text-slate-400">{c.row.original.id}</span> },
];

const VISIBILITE_DEFAUT: VisibilityState = { lieu: true, contrat: false, teletravail: true, publiee_le: false, id: false, tags: true };

function Preferences() {
  const [theme, setTheme] = usePreferenceTexte('theme', 'systeme');
  const [zoom, setZoom] = usePreference<number>('zoom', 100);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const appliquer = () =>
      document.documentElement.classList.toggle('dark', theme === 'sombre' || (theme === 'systeme' && media.matches));
    appliquer();
    media.addEventListener('change', appliquer);
    return () => media.removeEventListener('change', appliquer);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom}%`;
  }, [zoom]);
  const suivant = { systeme: 'clair', clair: 'sombre', sombre: 'systeme' } as Record<string, string>;
  const libelle = { systeme: 'Thème : système', clair: 'Thème : clair', sombre: 'Thème : sombre' } as Record<string, string>;
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="bouton" onClick={() => setTheme(suivant[theme] ?? 'systeme')} aria-label={`${libelle[theme]} (changer)`}>
        {theme === 'sombre' ? '☾' : theme === 'clair' ? '☀' : '◐'} <span className="hidden sm:inline">{libelle[theme]}</span>
      </button>
      <div role="group" aria-label="Taille du texte" className="flex items-center">
        <button type="button" className="bouton rounded-r-none" onClick={() => setZoom(Math.max(75, zoom - 10))} aria-label="Réduire le texte">
          A−
        </button>
        <span className="border-y border-slate-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-800" aria-live="polite">
          {zoom} %
        </span>
        <button type="button" className="bouton rounded-l-none" onClick={() => setZoom(Math.min(175, zoom + 10))} aria-label="Agrandir le texte">
          A+
        </button>
      </div>
    </div>
  );
}

function ChoixColonnes({ table }: { table: ReturnType<typeof useReactTable<LigneOffre>> }) {
  return (
    <details className="relative">
      <summary className="bouton cursor-pointer list-none">Colonnes</summary>
      <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-slate-300 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
        {table.getAllLeafColumns().map((col) => (
          <label key={col.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-blue-700 dark:accent-blue-400"
              checked={col.getIsVisible()}
              disabled={col.id === 'titre'}
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
  const [params, modifier] = useParametres();
  const [visibilite, setVisibilite] = usePreference<VisibilityState>('colonnes', VISIBILITE_DEFAUT);
  const [filtresOuverts, setFiltresOuverts] = usePreference<boolean>('filtres-ouverts', true);
  const [annonce, setAnnonce] = useState('');
  const [recherche, setRecherche] = useState(params.get('q') ?? '');
  const rechercheDifferee = useDebounce(recherche, 300);

  useEffect(() => {
    if ((params.get('q') ?? '') !== rechercheDifferee) modifier({ q: rechercheDifferee || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechercheDifferee]);

  const page = Number(params.get('page') ?? 1);
  const taille = Number(params.get('taille') ?? 50);
  const tri = params.get('tri') ?? 'recue_le';
  const ordre = params.get('ordre') === 'asc' ? 'asc' : 'desc';
  const offreChoisie = params.get('offre') ? Number(params.get('offre')) : null;

  const requete = new URLSearchParams(params);
  requete.delete('offre');
  if (!requete.has('tri')) requete.set('tri', tri);
  if (!requete.has('taille')) requete.set('taille', String(taille));
  const cle = requete.toString();

  const liste = useQuery({ queryKey: ['offres', cle], queryFn: () => api.offres(requete), placeholderData: keepPreviousData });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });

  const tri2: SortingState = useMemo(() => [{ id: tri, desc: ordre === 'desc' }], [tri, ordre]);
  const table = useReactTable({
    data: liste.data?.offres ?? [],
    columns: COLONNES,
    manualSorting: true,
    manualPagination: true,
    pageCount: liste.data?.pages ?? 1,
    state: { sorting: tri2, columnVisibility: visibilite },
    onColumnVisibilityChange: (maj) => setVisibilite(typeof maj === 'function' ? maj(visibilite) : maj),
    onSortingChange: (maj) => {
      const s = typeof maj === 'function' ? maj(tri2) : maj;
      const premier = s[0];
      if (!premier) modifier({ tri: null, ordre: null, page: null });
      else modifier({ tri: premier.id, ordre: premier.desc ? 'desc' : 'asc', page: null });
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  });

  const fermer = useCallback(() => modifier({ offre: null }), [modifier]);
  const annoncer = useCallback((m: string) => {
    setAnnonce(m);
    window.setTimeout(() => setAnnonce((a) => (a === m ? '' : a)), 6000);
  }, []);

  const raccourci = (nom: 'toutes' | 'a-traiter' | 'candidatures' | 'bonnes') => {
    const vide = Object.fromEntries([...CLES_FILTRES, 'page'].map((k) => [k, null])) as Record<string, null>;
    if (nom === 'toutes') modifier(vide);
    if (nom === 'a-traiter') modifier({ ...vide, statut: STATUTS_A_TRAITER.join(',') });
    if (nom === 'candidatures') modifier({ ...vide, candidatures: '1' });
    if (nom === 'bonnes') modifier({ ...vide, noteMin: '4.5', statut: 'notee,go' });
    setRecherche('');
  };
  const raccourciActif =
    params.get('candidatures') === '1'
      ? 'candidatures'
      : params.get('statut') === STATUTS_A_TRAITER.join(',')
        ? 'a-traiter'
        : params.get('noteMin') === '4.5' && params.get('statut') === 'notee,go'
          ? 'bonnes'
          : CLES_FILTRES.some((k) => params.has(k))
            ? null
            : 'toutes';

  const total = liste.data?.total ?? 0;
  const pages = liste.data?.pages ?? 1;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#tableau" className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-blue-700 px-3 py-2 text-white">
        Aller au tableau
      </a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-extrabold tracking-tight">
            cap<span className="text-blue-700 dark:text-blue-400">-emploi</span>
          </h1>
          <div className="min-w-48 flex-1">
            <label htmlFor="recherche" className="sr-only">
              Rechercher dans les offres
            </label>
            <input
              id="recherche"
              type="search"
              className="champ"
              placeholder="Rechercher (intitulé, entreprise, description, stack)…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <nav aria-label="Vues rapides" className="flex flex-wrap gap-1">
            {(
              [
                ['toutes', 'Toutes'],
                ['a-traiter', 'À traiter'],
                ['bonnes', 'Notées ≥ 4,5'],
                ['candidatures', 'Mes candidatures'],
              ] as const
            ).map(([nom, libelle]) => (
              <button
                key={nom}
                type="button"
                className={`bouton ${raccourciActif === nom ? 'bouton-actif' : ''}`}
                aria-pressed={raccourciActif === nom}
                onClick={() => raccourci(nom)}
              >
                {libelle}
              </button>
            ))}
          </nav>
          <Preferences />
        </div>
      </header>

      <div className="flex flex-1 gap-4 p-4">
        {filtresOuverts && (
          <aside aria-label="Filtres" className="w-64 shrink-0 self-start rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <Filtres params={params} modifier={modifier} meta={meta.data} />
          </aside>
        )}
        <main className="min-w-0 flex-1" id="tableau" tabIndex={-1}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" className="bouton" aria-expanded={filtresOuverts} onClick={() => setFiltresOuverts(!filtresOuverts)}>
              {filtresOuverts ? 'Masquer les filtres' : 'Afficher les filtres'}
            </button>
            <p className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
              {liste.isLoading ? 'Chargement…' : `${total.toLocaleString('fr-FR')} offre${total > 1 ? 's' : ''}`}
              {liste.isFetching && !liste.isLoading ? ' · mise à jour…' : ''}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <ChoixColonnes table={table} />
              <label className="flex items-center gap-1 text-sm">
                Par page
                <select
                  className="champ w-20"
                  value={taille}
                  onChange={(e) => modifier({ taille: e.target.value === '50' ? null : e.target.value, page: null })}
                >
                  {TAILLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {liste.isError && (
            <p role="alert" className="mb-2 rounded border border-rose-300 bg-rose-50 p-2 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
              {(liste.error as Error).message}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Offres, triées par {tri} ({ordre === 'asc' ? 'croissant' : 'décroissant'})</caption>
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const triable = h.column.getCanSort();
                      const sens = h.column.getIsSorted();
                      return (
                        <th
                          key={h.id}
                          scope="col"
                          aria-sort={sens === 'asc' ? 'ascending' : sens === 'desc' ? 'descending' : 'none'}
                          className="px-2 py-2 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200"
                        >
                          {triable ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded hover:underline"
                              onClick={() =>
                                modifier({
                                  tri: h.column.id,
                                  ordre: sens === 'desc' ? 'asc' : 'desc',
                                  page: null,
                                })
                              }
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <span aria-hidden="true" className="text-xs">
                                {sens === 'asc' ? '▲' : sens === 'desc' ? '▼' : '↕'}
                              </span>
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => {
                  const choisie = r.original.id === offreChoisie;
                  return (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      aria-selected={choisie}
                      onClick={() => modifier({ offre: String(r.original.id) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          modifier({ offre: String(r.original.id) });
                        }
                      }}
                      className={`cursor-pointer border-t border-slate-200 align-top hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                        choisie ? 'bg-blue-100 dark:bg-blue-950' : ''
                      }`}
                    >
                      {r.getVisibleCells().map((c) => (
                        <td key={c.id} className={`px-2 py-1.5 ${c.column.id === 'titre' ? 'min-w-64' : ''}`}>
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {!liste.isLoading && total === 0 && (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length} className="p-6 text-center text-slate-600 dark:text-slate-400">
                      Aucune offre ne correspond aux filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="bouton" disabled={page <= 1} onClick={() => modifier({ page: null })}>
              « Première
            </button>
            <button type="button" className="bouton" disabled={page <= 1} onClick={() => modifier({ page: page - 1 > 1 ? String(page - 1) : null })}>
              ‹ Précédente
            </button>
            <span className="tabular-nums">
              Page {page} / {pages}
            </span>
            <button type="button" className="bouton" disabled={page >= pages} onClick={() => modifier({ page: String(page + 1) })}>
              Suivante ›
            </button>
            <button type="button" className="bouton" disabled={page >= pages} onClick={() => modifier({ page: String(pages) })}>
              Dernière »
            </button>
          </nav>
        </main>
      </div>

      {offreChoisie !== null && <Detail id={offreChoisie} fermer={fermer} annoncer={annoncer} />}

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg transition-opacity dark:bg-slate-100 dark:text-slate-900 ${
          annonce ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {annonce}
      </div>
    </div>
  );
}
