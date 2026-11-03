// Bandeau « À venir » de l'écran principal : échéances en retard et des 7 prochains jours, et statistiques.
import { ChartColumn } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type EcheanceOffre } from '../api.ts';
import { BadgeType, dateEvenement } from './Journal.tsx';

function Element({ e, choisir }: { e: EcheanceOffre; choisir: (id: number) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => choisir(e.offre_id)}
        className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-2 py-1 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 ${
          e.en_retard ? 'text-rose-900 dark:text-rose-200' : ''
        }`}
      >
        <span className="font-semibold whitespace-nowrap tabular-nums">{dateEvenement(e.le)}</span>
        <BadgeType type={e.type} />
        <span className="font-semibold">{e.entreprise ?? e.titre}</span>
        <span className="min-w-0 flex-1 break-words">{e.resume}</span>
      </button>
    </li>
  );
}

function Statistiques() {
  const q = useQuery({ queryKey: ['statistiques'], queryFn: api.statistiques });
  const s = q.data;
  if (!s) return null;
  const etapes: [string, number][] = [
    ['Envoyées', s.envoyees],
    ['Réponse', s.reponses],
    ['Entretien', s.entretiens],
    ['Proposition', s.propositions],
  ];
  return (
    <details className="relative" data-menu>
      <summary className="bouton cursor-pointer list-none">
        <ChartColumn className="size-4" aria-hidden="true" /> Statistiques
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-slate-300 bg-white p-3 text-sm shadow-lg dark:border-slate-600 dark:bg-slate-900">
        <h2 className="mb-2 font-bold">Candidatures par étape</h2>
        <ul className="space-y-1">
          {etapes.map(([nom, n]) => (
            <li key={nom} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2">
              <span>{nom}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                <span className="block h-full rounded-full bg-blue-700 dark:bg-blue-400" style={{ width: `${s.envoyees ? (n / s.envoyees) * 100 : 0}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-700 dark:text-slate-300">
          {s.delai_moyen_reponse_jours === null
            ? 'Délai avant la première réponse : pas assez de données datées.'
            : `Délai moyen avant la première réponse : ${s.delai_moyen_reponse_jours.toLocaleString('fr-FR')} j (${s.delai_base} candidature${s.delai_base > 1 ? 's' : ''}).`}
        </p>
      </div>
    </details>
  );
}

export function AVenir({ choisir }: { choisir: (id: number) => void }) {
  const q = useQuery({ queryKey: ['echeances'], queryFn: () => api.echeances(7) });
  const r = q.data;
  const rien = r && !r.en_retard.length && !r.a_venir.length;
  return (
    <section
      aria-labelledby="a-venir-titre"
      className="mb-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h2 id="a-venir-titre" className="font-bold">
          À venir
        </h2>
        {r && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {r.en_retard.length > 0 && <strong className="text-rose-800 dark:text-rose-300">{r.en_retard.length} en retard · </strong>}
            {r.a_venir.length} échéance{r.a_venir.length > 1 ? 's' : ''} d'ici 7 jours
          </p>
        )}
        <div className="ml-auto">
          <Statistiques />
        </div>
      </div>
      {q.isError && <p className="px-1 text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
      {rien && <p className="px-1 text-sm text-slate-600 dark:text-slate-400">Aucune échéance en retard ni dans les 7 prochains jours.</p>}
      {r && r.en_retard.length > 0 && (
        <div className="mt-1 rounded-md border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950">
          <h3 className="px-2 pt-1 text-xs font-bold tracking-wide text-rose-900 uppercase dark:text-rose-200">En retard</h3>
          <ul>
            {r.en_retard.map((e) => (
              <Element key={e.id} e={e} choisir={choisir} />
            ))}
          </ul>
        </div>
      )}
      {r && r.a_venir.length > 0 && (
        <ul className="mt-1">
          {r.a_venir.map((e) => (
            <Element key={e.id} e={e} choisir={choisir} />
          ))}
        </ul>
      )}
    </section>
  );
}
