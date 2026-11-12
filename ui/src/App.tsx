import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { basculerNiveau, ecrireNiveaux, lireNiveaux } from './tri.ts';
import { choisirLangue, langue, LANGUES, locale, nombre, t, type Langue } from './i18n/index.ts';
import { useParametres, usePreference, usePreferenceTexte, useDebounce, CLES_FILTRES } from './etat.ts';
import { BadgeNote, BadgeStatut, formaterDate } from './composants/Badges.tsx';
import { Filtres } from './composants/Filtres.tsx';
import { Detail } from './composants/Detail.tsx';
import { AVenir } from './composants/AVenir.tsx';
import { ActionsAgent, useNotifications } from './composants/ActionsAgent.tsx';
import { Reglages } from './composants/Reglages.tsx';
import { ChoixTheme, type Mode } from './composants/Theme.tsx';
import {
  appliquerPalette,
  PALETTE_CLAIRE_DEFAUT,
  PALETTE_SOMBRE_DEFAUT,
  PALETTES_CLAIRES,
  PALETTES_SOMBRES,
  PERSO_DEFAUT,
  trouverPalette,
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
  Palette as PaletteIcone,
  SlidersHorizontal,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const TAILLES = [25, 50, 100, 200, 500];

/** Colonnes du tableau (libellés dans la langue courante : l'application est remontée à chaque changement de langue). */
const colonnes = (): ColumnDef<LigneOffre>[] => [
  { id: 'note', accessorKey: 'note', header: t('col.note'), cell: (c) => <BadgeNote note={c.row.original.note} /> },
  { id: 'statut', accessorKey: 'statut', header: t('col.statut'), cell: (c) => <BadgeStatut statut={c.row.original.statut} /> },
  {
    id: 'titre',
    accessorKey: 'titre',
    header: t('col.titre'),
    cell: (c) => <span className="line-clamp-2 font-medium">{c.row.original.titre || t('liste.sansTitre')}</span>,
  },
  { id: 'entreprise', accessorKey: 'entreprise', header: t('col.entreprise'), cell: (c) => <span className="line-clamp-2">{c.row.original.entreprise ?? '—'}</span> },
  { id: 'lieu', accessorKey: 'lieu', header: t('col.lieu'), cell: (c) => <span className="line-clamp-2">{c.row.original.lieu ?? '—'}</span> },
  { id: 'contrat', accessorKey: 'contrat', header: t('col.contrat'), cell: (c) => c.row.original.contrat ?? '—' },
  {
    id: 'remuneration_min',
    accessorKey: 'remuneration',
    header: t('col.remuneration'),
    cell: (c) => <span className="line-clamp-2">{c.row.original.remuneration ?? '—'}</span>,
  },
  { id: 'teletravail', accessorKey: 'teletravail', header: t('col.teletravail'), cell: (c) => <span className="line-clamp-2">{c.row.original.teletravail ?? '—'}</span> },
  { id: 'source', accessorKey: 'source', header: t('col.source') },
  { id: 'recue_le', accessorKey: 'recue_le', header: t('col.recue'), cell: (c) => <span className="whitespace-nowrap tabular-nums">{formaterDate(c.row.original.recue_le)}</span> },
  { id: 'publiee_le', accessorKey: 'publiee_le', header: t('col.publiee'), cell: (c) => <span className="whitespace-nowrap tabular-nums">{formaterDate(c.row.original.publiee_le)}</span> },
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

const VISIBILITE_DEFAUT: VisibilityState = { lieu: true, contrat: false, teletravail: true, publiee_le: false, id: false, tags: true };

/** Recharge toutes les données depuis la base (modifications faites par la CLI ou une IA). */
function BoutonRafraichir() {
  const client = useQueryClient();
  const enCours = useIsFetching() > 0;
  return (
    <button
      type="button"
      className="bouton"
      onClick={() => client.invalidateQueries()}
      aria-label={t('entete.rafraichir')}
      title={t('entete.rafraichir')}
      aria-busy={enCours}
    >
      <RefreshCw className={`size-4 ${enCours ? 'animate-spin' : ''}`} aria-hidden="true" />
    </button>
  );
}

function useSombreSysteme(): boolean {
  const [sombre, setSombre] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const maj = () => setSombre(media.matches);
    media.addEventListener('change', maj);
    return () => media.removeEventListener('change', maj);
  }, []);
  return sombre;
}

function enregistrer(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(`postuler-juste:${cle}`, JSON.stringify(valeur));
  } catch {
    /* stockage indisponible : la préférence vaut pour la session */
  }
}

/** Langue de l'interface : le choix est mémorisé (localStorage) et l'emporte sur la configuration. */
function ChoixLangue() {
  const noms: Record<Langue, string> = { fr: 'Français', en: 'English' };
  // Codes courts dans l'en-tête (FR / EN), nom complet de la langue dans l'infobulle de chaque option.
  return (
    <select
      className="champ py-1 text-sm"
      style={{ width: 'auto' }}
      value={langue()}
      onChange={(e) => choisirLangue(e.target.value as Langue)}
      aria-label={t('entete.langue')}
      title={t('entete.langue')}
    >
      {LANGUES.map((l) => (
        <option key={l} value={l} lang={l} title={noms[l]}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function Preferences() {
  const [mode, setMode] = usePreferenceTexte('theme', 'systeme') as [Mode, (m: Mode) => void];
  const [paletteClaire, setPaletteClaire] = usePreferenceTexte('palette-claire', PALETTE_CLAIRE_DEFAUT);
  const [paletteSombre, setPaletteSombre] = usePreferenceTexte('palette-sombre', PALETTE_SOMBRE_DEFAUT);
  const [persoClaire, setPersoClaire] = usePreference<Palette>('palette-perso-claire', PERSO_DEFAUT);
  const [persoSombre, setPersoSombre] = usePreference<Palette>('palette-perso-sombre', PERSO_DEFAUT);
  const [zoom, setZoom] = usePreference<number>('zoom', 100);
  const [fenetre, setFenetre] = useState(false);
  const sombreSysteme = useSombreSysteme();
  const sombre = mode === 'sombre' || (mode === 'systeme' && sombreSysteme);
  const claire = trouverPalette(PALETTES_CLAIRES, paletteClaire, persoClaire);
  const foncee = trouverPalette(PALETTES_SOMBRES, paletteSombre, persoSombre);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', sombre);
    appliquerPalette(sombre ? foncee : claire);
    // Variables reprises par le script de index.html au chargement suivant (pas de flash de couleurs).
    enregistrer('palette-vars-claire', variablesPalette(claire));
    enregistrer('palette-vars-sombre', variablesPalette(foncee));
  }, [sombre, claire, foncee]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom}%`;
  }, [zoom]);
  const fermer = useCallback(() => setFenetre(false), []);
  return (
    <div className="flex items-center gap-1">
      <ChoixLangue />
      <button
        type="button"
        className="bouton"
        onClick={() => setMode(sombre ? 'clair' : 'sombre')}
        aria-label={sombre ? t('theme.versClair') : t('theme.versSombre')}
        title={sombre ? t('theme.versClair') : t('theme.versSombre')}
      >
        {sombre ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
      </button>
      <button type="button" className="bouton" onClick={() => setFenetre(true)} aria-haspopup="dialog" title={t('theme.palettes')}>
        <PaletteIcone className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">{t('theme.bouton')}</span>
      </button>
      <div role="group" aria-label={t('zoom.groupe')} className="flex items-center">
        <button type="button" className="bouton rounded-r-none" onClick={() => setZoom(Math.max(75, zoom - 10))} aria-label={t('zoom.reduire')} title={t('zoom.reduire')}>
          <ZoomOut className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="border-y border-slate-300 bg-white px-2 py-1 text-sm whitespace-nowrap tabular-nums hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          onClick={() => setZoom(100)}
          aria-live="polite"
          aria-label={t('zoom.taille', { zoom })}
          title={t('zoom.revenir')}
        >
          {zoom} %
        </button>
        <button type="button" className="bouton rounded-l-none" onClick={() => setZoom(Math.min(175, zoom + 10))} aria-label={t('zoom.agrandir')} title={t('zoom.agrandir')}>
          <ZoomIn className="size-4" aria-hidden="true" />
        </button>
      </div>
      {fenetre && (
        <ChoixTheme
          fermer={fermer}
          mode={mode}
          setMode={setMode}
          clair={{ palettes: PALETTES_CLAIRES, choisie: paletteClaire, choisir: setPaletteClaire, perso: persoClaire, setPerso: setPersoClaire }}
          sombre={{ palettes: PALETTES_SOMBRES, choisie: paletteSombre, choisir: setPaletteSombre, perso: persoSombre, setPerso: setPersoSombre }}
        />
      )}
    </div>
  );
}

function ChoixColonnes({ table }: { table: ReturnType<typeof useReactTable<LigneOffre>> }) {
  return (
    <details className="relative" data-menu>
      <summary className="bouton cursor-pointer list-none">
        <Columns3 className="size-4" aria-hidden="true" /> {t('liste.colonnes')}
      </summary>
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
  const [reglages, setReglages] = useState(false);
  const grille = useQuery({ queryKey: ['grille'], queryFn: api.grille });
  useNotifications();
  const seuil = String(grille.data?.grille?.seuil ?? 4.5);
  const [recherche, setRecherche] = useState(params.get('q') ?? '');
  const rechercheDifferee = useDebounce(recherche, 300);

  useEffect(() => {
    if ((params.get('q') ?? '') !== rechercheDifferee) modifier({ q: rechercheDifferee || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechercheDifferee]);

  const page = Number(params.get('page') ?? 1);
  const taille = Number(params.get('taille') ?? 50);
  // Tri sur un ou plusieurs niveaux : ?tri=recue_le:desc,note:desc (ancien format : ?tri=note&ordre=asc).
  const ordreDefaut = params.get('ordre') === 'asc' ? 'asc' : 'desc';
  const niveaux = useMemo(() => lireNiveaux(params.get('tri'), ordreDefaut), [params, ordreDefaut]);
  const tri = ecrireNiveaux(niveaux);
  const offreChoisie = params.get('offre') ? Number(params.get('offre')) : null;

  const requete = new URLSearchParams(params);
  requete.delete('offre');
  requete.set('tri', tri);
  requete.delete('ordre');
  if (!requete.has('taille')) requete.set('taille', String(taille));
  const cle = requete.toString();

  const columns = useMemo(colonnes, []);
  const liste = useQuery({ queryKey: ['offres', cle], queryFn: () => api.offres(requete), placeholderData: keepPreviousData });
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });

  const tri2: SortingState = useMemo(() => niveaux.map((n) => ({ id: n.colonne, desc: n.ordre === 'desc' })), [niveaux]);
  const table = useReactTable({
    data: liste.data?.offres ?? [],
    columns,
    manualSorting: true,
    manualPagination: true,
    pageCount: liste.data?.pages ?? 1,
    state: { sorting: tri2, columnVisibility: visibilite },
    onColumnVisibilityChange: (maj) => setVisibilite(typeof maj === 'function' ? maj(visibilite) : maj),
    onSortingChange: (maj) => {
      const s = typeof maj === 'function' ? maj(tri2) : maj;
      if (!s.length) modifier({ tri: null, ordre: null, page: null });
      else modifier({ tri: ecrireNiveaux(s.map((x) => ({ colonne: x.id, ordre: x.desc ? 'desc' : 'asc' }))), ordre: null, page: null });
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  });

  // Menus déroulants (<details data-menu>) : un clic ailleurs ou Échap les referme.
  useEffect(() => {
    const ouverts = () => document.querySelectorAll<HTMLDetailsElement>('details[data-menu][open]');
    const clic = (e: MouseEvent) => {
      for (const d of ouverts()) if (!d.contains(e.target as Node)) d.open = false;
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') for (const d of ouverts()) d.open = false;
    };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', clavier);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', clavier);
    };
  }, []);

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
    if (nom === 'bonnes') modifier({ ...vide, noteMin: seuil, statut: 'notee,go' });
    setRecherche('');
  };
  const raccourciActif =
    params.get('candidatures') === '1'
      ? 'candidatures'
      : params.get('statut') === STATUTS_A_TRAITER.join(',')
        ? 'a-traiter'
        : params.get('noteMin') === seuil && params.get('statut') === 'notee,go'
          ? 'bonnes'
          : CLES_FILTRES.some((k) => params.has(k))
            ? null
            : 'toutes';

  const total = liste.data?.total ?? 0;
  const pages = liste.data?.pages ?? 1;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#tableau" className="sr-only-focusable absolute top-2 left-2 z-50 rounded bg-blue-700 px-3 py-2 text-white">
        {t('entete.allerTableau')}
      </a>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-extrabold tracking-tight">
            postuler<span className="text-blue-700 dark:text-blue-400">-juste</span>
          </h1>
          <div className="min-w-48 flex-1">
            <label htmlFor="recherche" className="sr-only">
              {t('entete.rechercheLibelle')}
            </label>
            <input
              id="recherche"
              type="search"
              className="champ"
              placeholder={t('entete.recherche')}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <nav aria-label={t('entete.vues')} className="flex flex-wrap gap-1">
            {(
              [
                ['toutes', t('entete.toutes')],
                ['a-traiter', t('entete.aTraiter')],
                ['bonnes', t('entete.bonnes', { seuil: nombre(Number(seuil)) })],
                ['candidatures', t('entete.candidatures')],
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
          <button type="button" className="bouton" onClick={() => setReglages(true)} aria-haspopup="dialog">
            <SlidersHorizontal className="size-4" aria-hidden="true" /> {t('entete.reglages')}
          </button>
          <BoutonRafraichir />
          <Preferences />
        </div>
      </header>

      <div className="flex flex-1 gap-4 p-4">
        {filtresOuverts && (
          <aside aria-label={t('liste.filtres')} className="w-64 shrink-0 self-start rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <ActionsAgent className="mb-3 border-b border-slate-200 pb-3 dark:border-slate-800" />
            <Filtres params={params} modifier={modifier} meta={meta.data} />
          </aside>
        )}
        <main className="min-w-0 flex-1" id="tableau" tabIndex={-1}>
          {!filtresOuverts && <ActionsAgent className="mb-3 max-w-xs" />}
          <AVenir choisir={(id) => modifier({ offre: String(id) })} />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" className="bouton" aria-expanded={filtresOuverts} onClick={() => setFiltresOuverts(!filtresOuverts)}>
              <Funnel className="size-4" aria-hidden="true" /> {filtresOuverts ? t('liste.masquerFiltres') : t('liste.afficherFiltres')}
            </button>
            <p className="text-sm text-slate-700 dark:text-slate-300" aria-live="polite">
              {liste.isLoading ? t('liste.chargement') : t('liste.nbOffres', { n: total.toLocaleString(locale()) })}
              {liste.isFetching && !liste.isLoading ? t('liste.miseAJour') : ''}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <ChoixColonnes table={table} />
              <label className="flex items-center gap-1 text-sm">
                {t('liste.parPage')}
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
              <caption className="sr-only">
                {t('liste.legende', {
                  niveaux: niveaux
                    .map((n) => `${String(columns.find((c) => c.id === n.colonne)?.header ?? n.colonne)} (${n.ordre === 'asc' ? t('liste.croissant') : t('liste.decroissant')})`)
                    .join(t('liste.puis')),
                })}
              </caption>
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => {
                      const triable = h.column.getCanSort();
                      const sens = h.column.getIsSorted();
                      const rang = niveaux.findIndex((n) => n.colonne === h.column.id);
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
                              title={t('liste.titreTri')}
                              onClick={() => modifier({ tri: ecrireNiveaux(basculerNiveau(niveaux, h.column.id)), ordre: null, page: null })}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {sens === 'asc' ? (
                                <ArrowUp className="size-3.5" aria-hidden="true" />
                              ) : sens === 'desc' ? (
                                <ArrowDown className="size-3.5" aria-hidden="true" />
                              ) : (
                                <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                              )}
                              {niveaux.length > 1 && rang >= 0 && (
                                <span className="text-xs text-slate-500 dark:text-slate-400" aria-label={t('liste.niveauTri', { n: rang + 1 })}>
                                  {rang + 1}
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
                      {t('liste.aucune')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <nav aria-label={t('liste.pagination')} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" className="bouton" disabled={page <= 1} onClick={() => modifier({ page: null })}>
              <ChevronsLeft className="size-4" aria-hidden="true" /> {t('liste.premiere')}
            </button>
            <button type="button" className="bouton" disabled={page <= 1} onClick={() => modifier({ page: page - 1 > 1 ? String(page - 1) : null })}>
              <ChevronLeft className="size-4" aria-hidden="true" /> {t('liste.precedente')}
            </button>
            <span className="tabular-nums">
              {t('liste.page', { page, pages })}
            </span>
            <button type="button" className="bouton" disabled={page >= pages} onClick={() => modifier({ page: String(page + 1) })}>
              {t('liste.suivante')} <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <button type="button" className="bouton" disabled={page >= pages} onClick={() => modifier({ page: String(pages) })}>
              {t('liste.derniere')} <ChevronsRight className="size-4" aria-hidden="true" />
            </button>
          </nav>
        </main>
      </div>

      {offreChoisie !== null && <Detail id={offreChoisie} fermer={fermer} annoncer={annoncer} />}
      {reglages && (
        <Reglages
          fermer={() => setReglages(false)}
          annoncer={annoncer}
          choisir={(id) => {
            setReglages(false);
            modifier({ offre: String(id) });
          }}
        />
      )}

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
