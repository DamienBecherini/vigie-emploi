// Décomposition d'une note à critères (panneau de détail) et correction des sous-notes à la main.
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DetailOffre, type Note, type SaisieSousNotes } from '../api.ts';
import { formaterNote } from './Badges.tsx';

const virgule = (n: number, d = 2) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });

const ORIGINES: Record<string, string> = { ia: 'IA', interface: 'saisie à la main', calcul: 'barème', neutre: 'valeur neutre' };

export function BadgeAncienneGrille() {
  return (
    <span
      className="inline-block rounded-full border border-slate-400 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-500 dark:text-slate-300"
      title="Note globale donnée avant la grille à critères : elle n'est pas recalculée quand la grille change"
    >
      ancienne grille
    </span>
  );
}

/** Tableau critère par critère : sous-note, poids, contribution, justification ; puis règles et drapeaux. */
export function DecompositionNote({ note }: { note: Note }) {
  const d = note.decomposition!;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Décomposition de la note</caption>
          <thead className="text-left text-slate-600 dark:text-slate-300">
            <tr>
              <th scope="col" className="py-1 pr-2">
                Critère
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Sous-note
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Poids
              </th>
              <th scope="col" className="px-2 py-1 text-right">
                Apport
              </th>
              <th scope="col" className="py-1 pl-2">
                Justification
              </th>
            </tr>
          </thead>
          <tbody>
            {d.criteres.map((c) => (
              <tr key={c.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                <th scope="row" className="py-1 pr-2 text-left font-semibold">
                  {c.libelle}
                  <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">{ORIGINES[c.origine] ?? c.origine}</span>
                </th>
                <td className={`px-2 py-1 text-right font-semibold tabular-nums ${c.origine === 'neutre' ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                  {virgule(c.note, 1)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{Math.round(c.poids_normalise * 100)} %</td>
                <td className="px-2 py-1 text-right tabular-nums">{virgule(c.contribution)}</td>
                <td className="py-1 pl-2 break-words">{c.justification ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
              <th scope="row" className="py-1 pr-2 text-left">
                Moyenne pondérée
              </th>
              <td colSpan={3} className="px-2 py-1 text-right font-semibold tabular-nums">
                {virgule(d.moyenne)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {d.regles.length > 0 && (
        <ul className="text-sm">
          {d.regles.map((r) => (
            <li key={r.id} className="font-semibold text-rose-800 dark:text-rose-200">
              Règle bloquante : {r.libelle} → {r.effet === 'zero' ? 'note à 0' : `plafond ${virgule(r.valeur!)}`}
              {!r.effective && <span className="font-normal"> (sans effet : la moyenne est déjà en dessous)</span>}
            </li>
          ))}
        </ul>
      )}
      {d.bloquants_ignores.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Règles signalées mais inactives ou retirées de la grille : {d.bloquants_ignores.join(', ')}</p>
      )}
      {d.drapeaux.length > 0 && (
        <ul className="text-sm text-amber-900 dark:text-amber-200" aria-label="Drapeaux">
          {d.drapeaux.map((f) => (
            <li key={f.code}>⚑ {f.message}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Note exacte {virgule(d.note_exacte, 3)}, affichée {formaterNote(d.note)} · grille v{note.grille_version}
        {note.recalculee_le && ` · recalculée le ${note.recalculee_le.slice(8, 10)}/${note.recalculee_le.slice(5, 7)}`}
      </p>
    </div>
  );
}

type Ligne = { note: string; justification: string };

/** Correction des sous-notes (critères IA), des entrées des critères calculés et des règles bloquantes. */
export function EditeurSousNotes({ offre }: { offre: DetailOffre }) {
  const client = useQueryClient();
  const base = useId();
  const g = useQuery({ queryKey: ['grille'], queryFn: api.grille });
  const [edition, setEdition] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const n = offre.notes[0];
  const grille = g.data?.grille;
  const initial = () => {
    const lignes: Record<string, Ligne> = {};
    for (const c of grille?.criteres.filter((x) => x.source === 'ia') ?? []) {
      const s = n?.saisie?.criteres[c.id];
      lignes[c.id] = { note: s ? String(s.note).replace('.', ',') : '', justification: s?.justification ?? '' };
    }
    const e = n?.saisie?.entrees;
    return {
      lignes,
      jours: e?.jours_sur_site === undefined || e?.jours_sur_site === null ? '' : String(e.jours_sur_site),
      min: e?.salaire_min ? String(e.salaire_min) : '',
      max: e?.salaire_max ? String(e.salaire_max) : '',
      unite: e?.unite ?? 'an',
      bloquants: new Set(n?.saisie?.bloquants ?? []),
    };
  };
  const [s, setS] = useState(initial);
  const maj = useMutation({
    mutationFn: () => {
      const criteres: SaisieSousNotes['criteres'] = {};
      for (const [id, l] of Object.entries(s.lignes)) {
        const t = l.note.trim().replace(',', '.');
        if (t === '') {
          criteres[id] = null;
          continue;
        }
        const v = Number(t);
        if (!Number.isFinite(v) || v < 0 || v > 10) throw new Error(`${id} : sous-note de 0 à 10 attendue`);
        criteres[id] = { note: v, justification: l.justification.trim() || null };
      }
      const nb = (x: string) => (x.trim() ? Number(x.replace(/\s/g, '').replace(',', '.')) : null);
      // Seules les sous-notes modifiées sont envoyées : les autres gardent leur origine (IA).
      const changees: NonNullable<SaisieSousNotes['criteres']> = {};
      const avant = initial();
      for (const [id, v] of Object.entries(criteres)) {
        const a = avant.lignes[id];
        if (a.note !== s.lignes[id].note || a.justification !== s.lignes[id].justification) changees[id] = v;
      }
      return api.sousNotes(offre.id, {
        criteres: changees,
        entrees: {
          jours_sur_site: s.jours === '' ? null : Number(s.jours),
          salaire_min: nb(s.min),
          salaire_max: nb(s.max),
          unite: nb(s.min) === null && nb(s.max) === null ? null : (s.unite as 'an'),
        },
        bloquants: [...s.bloquants],
      });
    },
    onSuccess: (d) => {
      client.setQueryData(['offre', offre.id], d);
      client.invalidateQueries({ queryKey: ['offres'] });
      setEdition(false);
      setErreur(null);
    },
    onError: (e) => setErreur((e as Error).message),
  });
  if (!grille) return null;
  if (!edition) {
    return (
      <button
        type="button"
        className="bouton mt-2"
        onClick={() => {
          setS(initial());
          setErreur(null);
          setEdition(true);
        }}
      >
        {n?.decomposition ? 'Corriger les sous-notes' : 'Noter par critères'}
      </button>
    );
  }
  return (
    <form
      className="mt-2 space-y-3 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label="Correction des sous-notes"
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate();
      }}
    >
      {grille.criteres
        .filter((c) => c.source === 'ia')
        .map((c) => (
          <div key={c.id} className="flex flex-wrap gap-2">
            <div className="w-24 shrink-0">
              <label htmlFor={`${base}-${c.id}`} className="etiquette" title={c.description}>
                {c.libelle}
              </label>
              <input
                id={`${base}-${c.id}`}
                className="champ tabular-nums"
                inputMode="decimal"
                placeholder="0 à 10"
                value={s.lignes[c.id]?.note ?? ''}
                onChange={(e) => setS({ ...s, lignes: { ...s.lignes, [c.id]: { ...s.lignes[c.id], note: e.target.value } } })}
              />
            </div>
            <div className="min-w-48 flex-1">
              <label htmlFor={`${base}-${c.id}-j`} className="etiquette">
                Justification
              </label>
              <input
                id={`${base}-${c.id}-j`}
                className="champ"
                value={s.lignes[c.id]?.justification ?? ''}
                onChange={(e) => setS({ ...s, lignes: { ...s.lignes, [c.id]: { ...s.lignes[c.id], justification: e.target.value } } })}
              />
            </div>
          </div>
        ))}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-semibold">Données des critères calculés (vide : déduites de l'offre)</legend>
        <div className="w-36">
          <label htmlFor={`${base}-jours`} className="etiquette">
            Jours sur site
          </label>
          <select id={`${base}-jours`} className="champ" value={s.jours} onChange={(e) => setS({ ...s, jours: e.target.value })}>
            <option value="">Selon l'offre</option>
            <option value="0">0 (full remote)</option>
            {[1, 2, 3, 4, 5].map((j) => (
              <option key={j} value={j}>
                {j} j / semaine
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-min`} className="etiquette">
            Salaire min
          </label>
          <input id={`${base}-min`} className="champ" inputMode="decimal" placeholder="55000" value={s.min} onChange={(e) => setS({ ...s, min: e.target.value })} />
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-max`} className="etiquette">
            Salaire max
          </label>
          <input id={`${base}-max`} className="champ" inputMode="decimal" placeholder="65000" value={s.max} onChange={(e) => setS({ ...s, max: e.target.value })} />
        </div>
        <div className="w-28">
          <label htmlFor={`${base}-unite`} className="etiquette">
            Unité
          </label>
          <select id={`${base}-unite`} className="champ" value={s.unite} onChange={(e) => setS({ ...s, unite: e.target.value as typeof s.unite })}>
            <option value="an">€ / an</option>
            <option value="mois">€ / mois</option>
            <option value="jour">€ / jour</option>
            <option value="heure">€ / heure</option>
          </select>
        </div>
      </fieldset>
      {grille.regles.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Règles bloquantes qui s'appliquent</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {grille.regles.map((r) => (
              <label key={r.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-blue-700 dark:accent-blue-400"
                  checked={s.bloquants.has(r.id)}
                  onChange={(e) => {
                    const b = new Set(s.bloquants);
                    if (e.target.checked) b.add(r.id);
                    else b.delete(r.id);
                    setS({ ...s, bloquants: b });
                  }}
                />
                {r.libelle}
                {!r.actif && <span className="text-xs text-slate-500 dark:text-slate-400">(inactive)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton-principal" disabled={maj.isPending}>
          Recalculer et enregistrer
        </button>
        <button type="button" className="bouton" onClick={() => setEdition(false)}>
          Annuler
        </button>
        {erreur && (
          <span role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            {erreur}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">Une nouvelle note s'ajoute à l'historique (origine interface) ; la note finale reste calculée.</p>
    </form>
  );
}
