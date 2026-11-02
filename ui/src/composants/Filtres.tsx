import { useEffect, useId, useState } from 'react';
import { LIBELLES_STATUTS, STATUTS, type Statut } from '../../../src/core/statuts.ts';
import type { Meta } from '../api.ts';
import { CLES_FILTRES, useDebounce, type CleUrl } from '../etat.ts';

type Modifier = (maj: Partial<Record<CleUrl, string | null>>) => void;

/** Champ texte écrit dans l'URL après une courte pause de frappe. */
function ChampTexte(props: { cle: CleUrl; valeur: string; modifier: Modifier; libelle: string; type?: string; placeholder?: string; step?: string }) {
  const id = useId();
  const [local, setLocal] = useState(props.valeur);
  const differe = useDebounce(local, props.type === 'date' ? 0 : 350);
  useEffect(() => setLocal(props.valeur), [props.valeur]);
  useEffect(() => {
    if (differe !== props.valeur) props.modifier({ [props.cle]: differe || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [differe]);
  return (
    <div>
      <label htmlFor={id} className="etiquette">
        {props.libelle}
      </label>
      <input
        id={id}
        className="champ"
        type={props.type ?? 'text'}
        inputMode={props.type === 'number' ? 'decimal' : undefined}
        step={props.step}
        min={props.type === 'number' ? 0 : undefined}
        max={props.type === 'number' ? 10 : undefined}
        placeholder={props.placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
}

function Cases(props: {
  legende: string;
  cle: CleUrl;
  options: { valeur: string; libelle: string; n?: number }[];
  choisis: string[];
  modifier: Modifier;
}) {
  const basculer = (v: string) => {
    const s = new Set(props.choisis);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    props.modifier({ [props.cle]: [...s].join(',') || null, page: null });
  };
  if (!props.options.length) return null;
  return (
    <fieldset className="min-w-0">
      <legend className="etiquette">{props.legende}</legend>
      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-1">
        {props.options.map((o) => (
          <label key={o.valeur} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              className="size-4 accent-blue-700 dark:accent-blue-400"
              checked={props.choisis.includes(o.valeur)}
              onChange={() => basculer(o.valeur)}
            />
            <span className="flex-1 truncate">{o.libelle}</span>
            {o.n !== undefined && <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{o.n}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Filtres({ params, modifier, meta }: { params: URLSearchParams; modifier: Modifier; meta: Meta | undefined }) {
  const g = (k: CleUrl) => params.get(k) ?? '';
  const choisis = (k: CleUrl) => g(k).split(',').filter(Boolean);
  const nParStatut = new Map((meta?.statuts ?? []).map((s) => [s.valeur, s.n]));
  const actifs = CLES_FILTRES.filter((k) => params.has(k)).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Filtres{actifs ? ` (${actifs})` : ''}</h2>
        <button
          type="button"
          className="bouton"
          disabled={!actifs}
          onClick={() => modifier(Object.fromEntries([...CLES_FILTRES, 'page'].map((k) => [k, null])))}
        >
          Réinitialiser
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ChampTexte cle="noteMin" libelle="Note min." type="number" step="0.5" valeur={g('noteMin')} modifier={modifier} />
        <ChampTexte cle="noteMax" libelle="Note max." type="number" step="0.5" valeur={g('noteMax')} modifier={modifier} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-blue-700 dark:accent-blue-400"
          checked={g('sansNote') === '1'}
          onChange={(e) => modifier({ sansNote: e.target.checked ? '1' : null, page: null })}
        />
        Sans note seulement
      </label>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="etiquette">Reçue</legend>
        <ChampTexte cle="recueDepuis" libelle="depuis" type="date" valeur={g('recueDepuis')} modifier={modifier} />
        <ChampTexte cle="recueJusqua" libelle="jusqu'au" type="date" valeur={g('recueJusqua')} modifier={modifier} />
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="etiquette">Publiée</legend>
        <ChampTexte cle="publieeDepuis" libelle="depuis" type="date" valeur={g('publieeDepuis')} modifier={modifier} />
        <ChampTexte cle="publieeJusqua" libelle="jusqu'au" type="date" valeur={g('publieeJusqua')} modifier={modifier} />
      </fieldset>
      <Cases
        legende="Statut"
        cle="statut"
        choisis={choisis('statut')}
        modifier={modifier}
        options={STATUTS.map((s: Statut) => ({ valeur: s, libelle: LIBELLES_STATUTS[s], n: nParStatut.get(s) ?? 0 }))}
      />
      <Cases
        legende="Source"
        cle="source"
        choisis={choisis('source')}
        modifier={modifier}
        options={(meta?.sources ?? []).map((s) => ({ valeur: s.valeur, libelle: s.valeur, n: s.n }))}
      />
      <ChampTexte cle="contrat" libelle="Contrat contient" placeholder="CDI, Freelance…" valeur={g('contrat')} modifier={modifier} />
      <ChampTexte cle="teletravail" libelle="Télétravail contient" placeholder="remote, hybride…" valeur={g('teletravail')} modifier={modifier} />
      <Cases
        legende="Tags (tous requis)"
        cle="tag"
        choisis={choisis('tag')}
        modifier={modifier}
        options={(meta?.tags ?? []).map((s) => ({ valeur: s.valeur, libelle: s.valeur, n: s.n }))}
      />
    </div>
  );
}
