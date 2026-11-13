// Bandeau « À venir » de l'écran principal : échéances en retard et des 7 prochains jours, et statistiques.
// Au-delà de 10 échéances, la liste défile ; l'affichage des statistiques est retenu (localStorage).
import { useLayoutEffect, useRef, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type EcheanceOffre } from '../api.ts';
import { usePreference } from '../etat.ts';
import { BadgeType, dateEvenement } from './Journal.tsx';
import { OmbresVerticales, useOmbresVerticales } from './OmbresVerticales.tsx';
import { nombre, t } from '../i18n/index.ts';

/** Nombre d'échéances visibles avant la barre de défilement. */
const VISIBLES = 10;

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
        {/* Largeur minimale : sans place à côté de la date et de l'entreprise, le résumé passe à la ligne entier. */}
        <span className="min-w-[min(14rem,100%)] flex-1 break-words">{e.resume}</span>
      </button>
    </li>
  );
}

function Statistiques() {
  const q = useQuery({ queryKey: ['statistiques'], queryFn: api.statistiques });
  const s = q.data;
  if (!s) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('stats.chargement')}</p>;
  const etapes: [string, number][] = [
    [t('stats.envoyees'), s.envoyees],
    [t('stats.reponse'), s.reponses],
    [t('stats.entretien'), s.entretiens],
    [t('stats.proposition'), s.propositions],
  ];
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950">
      <h3 className="mb-2 font-bold">{t('stats.titre')}</h3>
      <ul className="space-y-1">
        {etapes.map(([nom, n]) => (
          <li key={nom} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2">
            <span>{nom}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-blue-700 dark:bg-blue-400"
                style={{ width: `${s.envoyees ? (n / s.envoyees) * 100 : 0}%` }}
              />
            </span>
            <span className="text-right font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-slate-700 dark:text-slate-300">
        {s.delai_moyen_reponse_jours === null
          ? t('stats.pasAssez')
          : t('stats.delai', { jours: nombre(s.delai_moyen_reponse_jours), n: s.delai_base })}
      </p>
    </div>
  );
}

/** Hauteur maximale de la liste : celle des VISIBLES premières échéances (lignes de hauteur variable). */
function useHauteurLimitee(dependance: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => {
      const lignes = el.querySelectorAll('li');
      if (lignes.length <= VISIBLES) return setMax(null);
      const derniere = lignes[VISIBLES - 1];
      const haut = el.getBoundingClientRect().top - el.scrollTop;
      setMax(Math.ceil(derniere.getBoundingClientRect().bottom - haut) + 4);
    };
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
  }, [dependance]);
  return { ref, max };
}

export function AVenir({ choisir }: { choisir: (id: number) => void }) {
  const q = useQuery({ queryKey: ['echeances'], queryFn: () => api.echeances(7) });
  const r = q.data;
  const rien = r && !r.en_retard.length && !r.a_venir.length;
  const [stats, setStats] = usePreference<boolean>('statistiques-visibles', false);
  const { ref, max } = useHauteurLimitee(r);
  const ombres = useOmbresVerticales(ref, Boolean(max));
  return (
    <section
      aria-labelledby="a-venir-titre"
      className="mb-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h2 id="a-venir-titre" className="font-bold">
          {t('avenir.titre')}
        </h2>
        {r && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {r.en_retard.length > 0 && <strong className="text-rose-800 dark:text-rose-300">{t('avenir.enRetard', { n: r.en_retard.length })}</strong>}
            {t('avenir.echeances', { n: r.a_venir.length })}
          </p>
        )}
        <button type="button" className="bouton ml-auto" aria-pressed={stats} onClick={() => setStats(!stats)}>
          <ChartColumn className="size-4" aria-hidden="true" /> {stats ? t('avenir.masquerStats') : t('avenir.stats')}
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-96">
          {q.isError && <p className="px-1 text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
          {rien && (
            <p className="px-1 text-sm text-slate-600 dark:text-slate-400">{t('avenir.rien')}</p>
          )}
          {/* Liste qui défile : jamais plus de 40 % de l'écran, encadrée, ombrée en haut / en bas quand il reste des
              échéances cachées de ce côté, et sur téléphone une bande libre à droite pour faire défiler la page au pouce. */}
          <div className={max ? 'relative mt-1 max-md:mr-10' : ''}>
          <div
            ref={ref}
            className={max ? 'overflow-y-auto rounded-md border border-slate-200 p-1 pr-1 dark:border-slate-700' : ''}
            style={max ? { maxHeight: `min(${max}px, 40vh)` } : undefined}
            tabIndex={max ? 0 : undefined}
            aria-label={max ? t('avenir.defilante') : undefined}
          >
            {r && r.en_retard.length > 0 && (
              <div className="mt-1 rounded-md border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950">
                <h3 className="px-2 pt-1 text-xs font-bold tracking-wide text-rose-900 uppercase dark:text-rose-200">{t('avenir.retard')}</h3>
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
          </div>
          {max && <OmbresVerticales {...ombres} />}
          </div>
        </div>
        {/* Statistiques sous l'en-tête (près de leur bouton) tant que la place manque ; à droite de la liste sur grand écran. */}
        {stats && (
          <div className="order-first mt-1 w-full lg:order-none lg:w-80">
            <Statistiques />
          </div>
        )}
      </div>
    </section>
  );
}
