// Journal de la candidature (événements datés, échéances) et fichiers du dossier, dans le panneau de détail.
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LIBELLES_TYPES, TYPES_EVENEMENT, type Sens, type TypeEvenement } from '../../../src/core/statuts.ts';
import { api, urlFichier, type DetailOffre, type Evenement, type FichiersDossier, type SaisieEvenement } from '../api.ts';

const deux = (n: number) => String(n).padStart(2, '0');

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/** « 05/11/2026 » ou « 05/11/2026 à 14 h 30 ». */
export function dateEvenement(le: string): string {
  const m = le.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return le;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` à ${m[4]} h ${m[5]}` : ''}`;
}

function estFutur(date: string, heure: string): boolean {
  const j = aujourdhui();
  if (date !== j) return date > j;
  if (!heure) return false;
  const d = new Date();
  return heure > `${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

function taille(o: number): string {
  return o < 1024 ? `${o} o` : o < 1024 * 1024 ? `${Math.ceil(o / 1024)} Ko` : `${(o / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Nom court d'un fichier lié : relatif au dossier de candidature quand il y est. */
function nomFichier(chemin: string, dossier: string | null): string {
  const d = dossier?.replace(/\/+$/, '');
  return d && chemin.startsWith(`${d}/`) ? chemin.slice(d.length + 1) : chemin;
}

function useFichiers(id: number) {
  return useQuery({ queryKey: ['fichiers', id], queryFn: () => api.fichiers(id) });
}

function useRafraichirJournal(id: number) {
  const client = useQueryClient();
  return (d: DetailOffre) => {
    client.setQueryData(['offre', id], d);
    client.invalidateQueries({ queryKey: ['offres'] });
    client.invalidateQueries({ queryKey: ['echeances'] });
    client.invalidateQueries({ queryKey: ['statistiques'] });
  };
}

interface Saisie {
  type: TypeEvenement;
  sens: '' | Sens;
  date: string;
  heure: string;
  /** null : automatique (fait si la date est passée). */
  fait: boolean | null;
  resume: string;
  details: string;
  canal: string;
  interlocuteurs: string;
  montant: string;
  unite: string;
  jours: string;
  fichiers: string[];
}

function saisieDe(e: Evenement | null): Saisie {
  if (!e) {
    return {
      type: 'message',
      sens: 'envoye',
      date: aujourdhui(),
      heure: '',
      fait: null,
      resume: '',
      details: '',
      canal: '',
      interlocuteurs: '',
      montant: '',
      unite: '',
      jours: '',
      fichiers: [],
    };
  }
  return {
    type: e.type,
    sens: e.sens ?? '',
    date: e.le.slice(0, 10),
    heure: e.le.length > 10 ? e.le.slice(11, 16) : '',
    fait: e.fait,
    resume: e.resume,
    details: e.details ?? '',
    canal: e.canal ?? '',
    interlocuteurs: e.interlocuteurs ?? '',
    montant: e.montant === null ? '' : String(e.montant).replace('.', ','),
    unite: e.unite ?? '',
    jours: e.jours === null ? '' : String(e.jours).replace('.', ','),
    fichiers: e.fichiers,
  };
}

function nombre(s: string, nom: string): number | null {
  const t = s.trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${nom} : nombre attendu`);
  return n;
}

function versApi(s: Saisie): SaisieEvenement {
  if (!s.resume.trim()) throw new Error('Résumé attendu');
  if (!s.date) throw new Error('Date attendue');
  const vide = (t: string) => t.trim() || null;
  return {
    type: s.type,
    sens: s.sens || null,
    le: s.heure ? `${s.date}T${s.heure}` : s.date,
    fait: s.fait ?? !estFutur(s.date, s.heure),
    resume: s.resume.trim(),
    details: vide(s.details),
    canal: vide(s.canal),
    interlocuteurs: vide(s.interlocuteurs),
    montant: nombre(s.montant, 'Montant'),
    unite: vide(s.unite),
    jours: nombre(s.jours, 'Jours'),
    fichiers: s.fichiers,
  };
}

function FormulaireEvenement(props: {
  offre: DetailOffre;
  evenement: Evenement | null;
  fichiers: FichiersDossier | undefined;
  fermer: () => void;
}) {
  const base = useId();
  const rafraichir = useRafraichirJournal(props.offre.id);
  const [s, setS] = useState<Saisie>(() => saisieDe(props.evenement));
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = useMutation({
    mutationFn: () => {
      const e = versApi(s);
      return props.evenement ? api.modifierEvenement(props.evenement.id, e) : api.ajouterEvenement(props.offre.id, e);
    },
    onSuccess: (d) => {
      rafraichir(d);
      props.fermer();
    },
    onError: (e) => setErreur((e as Error).message),
  });
  const faitAuto = !estFutur(s.date, s.heure);
  const fait = s.fait ?? faitAuto;
  const disponibles = (props.fichiers?.fichiers ?? []).filter((f) => !s.fichiers.includes(f.chemin));
  const champ = (cle: 'canal' | 'interlocuteurs' | 'montant' | 'unite' | 'jours', libelle: string, opts: { court?: boolean; placeholder?: string } = {}) => (
    <div className={opts.court ? 'w-28 shrink-0' : 'min-w-40 flex-1'}>
      <label htmlFor={`${base}-${cle}`} className="etiquette">
        {libelle}
      </label>
      <input
        id={`${base}-${cle}`}
        className="champ"
        inputMode={cle === 'montant' || cle === 'jours' ? 'decimal' : undefined}
        placeholder={opts.placeholder}
        value={s[cle]}
        onChange={(e) => setS({ ...s, [cle]: e.target.value })}
      />
    </div>
  );
  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label={props.evenement ? "Modifier l'événement" : 'Ajouter un événement'}
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        maj.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <div className="w-44 shrink-0">
          <label htmlFor={`${base}-type`} className="etiquette">
            Type
          </label>
          <select
            id={`${base}-type`}
            className="champ"
            value={s.type}
            onChange={(e) => {
              const type = e.target.value as TypeEvenement;
              setS({ ...s, type, sens: type === 'message' && !s.sens ? 'envoye' : type === 'message' || type === 'proposition' ? s.sens : '' });
            }}
          >
            {TYPES_EVENEMENT.map((t) => (
              <option key={t} value={t}>
                {LIBELLES_TYPES[t]}
              </option>
            ))}
          </select>
        </div>
        {(s.type === 'message' || s.type === 'proposition') && (
          <div className="w-32 shrink-0">
            <label htmlFor={`${base}-sens`} className="etiquette">
              Sens
            </label>
            <select id={`${base}-sens`} className="champ" value={s.sens} onChange={(e) => setS({ ...s, sens: e.target.value as Saisie['sens'] })}>
              <option value="">—</option>
              <option value="envoye">Envoyé</option>
              <option value="recu">Reçu</option>
            </select>
          </div>
        )}
        <div className="w-40 shrink-0">
          <label htmlFor={`${base}-date`} className="etiquette">
            Date
          </label>
          <input id={`${base}-date`} type="date" className="champ" required value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />
        </div>
        <div className="w-28 shrink-0">
          <label htmlFor={`${base}-heure`} className="etiquette">
            Heure
          </label>
          <input id={`${base}-heure`} type="time" className="champ" value={s.heure} onChange={(e) => setS({ ...s, heure: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor={`${base}-resume`} className="etiquette">
          Résumé
        </label>
        <input
          id={`${base}-resume`}
          className="champ"
          required
          placeholder={s.type === 'message' ? 'Relance envoyée, réponse de la RH…' : 'Appel avec…, devis envoyé…'}
          value={s.resume}
          onChange={(e) => setS({ ...s, resume: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {champ('canal', 'Canal', { placeholder: 'LinkedIn, Malt, e-mail, Zoom…' })}
        {champ('interlocuteurs', 'Interlocuteurs')}
      </div>
      {s.type === 'proposition' && (
        <div className="flex flex-wrap gap-2">
          {champ('montant', 'Montant', { court: true, placeholder: '3 000' })}
          {champ('unite', 'Unité', { court: true, placeholder: '€ HT' })}
          {champ('jours', 'Jours', { court: true, placeholder: '6' })}
        </div>
      )}
      <div>
        <label htmlFor={`${base}-details`} className="etiquette">
          Détails
        </label>
        <textarea id={`${base}-details`} className="champ min-h-16" value={s.details} onChange={(e) => setS({ ...s, details: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${base}-fichier`} className="etiquette">
          Fichiers du dossier liés
        </label>
        {s.fichiers.length > 0 && (
          <ul className="mb-1 flex flex-wrap gap-1" aria-label="Fichiers liés">
            {s.fichiers.map((f) => (
              <li key={f} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
                {nomFichier(f, props.offre.candidature?.dossier ?? null)}
                <button
                  type="button"
                  className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
                  aria-label={`Retirer ${f}`}
                  onClick={() => setS({ ...s, fichiers: s.fichiers.filter((x) => x !== f) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {props.fichiers?.dossier ? (
          <select
            id={`${base}-fichier`}
            className="champ"
            value=""
            disabled={!disponibles.length}
            onChange={(e) => e.target.value && setS({ ...s, fichiers: [...s.fichiers, e.target.value] })}
          >
            <option value="">{disponibles.length ? 'Lier un fichier du dossier…' : 'Aucun autre fichier dans le dossier'}</option>
            {disponibles.map((f) => (
              <option key={f.chemin} value={f.chemin}>
                {f.nom}
              </option>
            ))}
          </select>
        ) : (
          <p id={`${base}-fichier`} className="text-xs text-slate-600 dark:text-slate-400">
            Pas de dossier de candidature : renseigner le dossier pour lier ses fichiers.
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-blue-700 dark:accent-blue-400"
          checked={fait}
          onChange={(e) => setS({ ...s, fait: e.target.checked === faitAuto && !props.evenement ? null : e.target.checked })}
        />
        Fait {fait ? '' : '— c’est une échéance (à faire)'}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton-principal" disabled={maj.isPending}>
          {props.evenement ? 'Enregistrer' : "Ajouter l'événement"}
        </button>
        <button type="button" className="bouton" onClick={props.fermer}>
          Annuler
        </button>
        {erreur && (
          <span role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            {erreur}
          </span>
        )}
      </div>
    </form>
  );
}

const COULEURS_TYPES: Record<TypeEvenement, string> = {
  message: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  entretien: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  test: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  proposition: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  decision: 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-slate-100',
  note: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function BadgeType({ type }: { type: TypeEvenement }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${COULEURS_TYPES[type]}`}>
      {LIBELLES_TYPES[type]}
    </span>
  );
}

function LigneEvenement({ offre, e, modifier }: { offre: DetailOffre; e: Evenement; modifier: () => void }) {
  const rafraichir = useRafraichirJournal(offre.id);
  const fait = useMutation({ mutationFn: (v: boolean) => api.marquerFait(e.id, v), onSuccess: rafraichir });
  const supprimer = useMutation({ mutationFn: () => api.supprimerEvenement(e.id), onSuccess: rafraichir });
  const infos = [
    e.canal,
    e.interlocuteurs,
    e.montant !== null ? `${e.montant.toLocaleString('fr-FR')} ${e.unite ?? ''}`.trim() : null,
    e.jours !== null ? `${e.jours.toLocaleString('fr-FR')} j` : null,
  ].filter(Boolean);
  const cadre = e.en_retard
    ? 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950'
    : e.echeance
      ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
      : 'border-slate-200 dark:border-slate-700';
  return (
    <li className={`rounded-md border p-2 text-sm ${cadre}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{dateEvenement(e.le)}</span>
        <BadgeType type={e.type} />
        {e.sens && <span className="text-xs text-slate-600 dark:text-slate-300">{e.sens === 'envoye' ? '→ envoyé' : '← reçu'}</span>}
        {e.en_retard && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">En retard</span>}
        {e.echeance && !e.en_retard && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-300 dark:text-slate-950">À faire</span>
        )}
      </div>
      <p className="mt-1 break-words">{e.resume}</p>
      {infos.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">{infos.join(' · ')}</p>}
      {e.details && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">Détails</summary>
          <p className="mt-1 text-sm whitespace-pre-line">{e.details}</p>
        </details>
      )}
      {e.fichiers.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Fichiers liés">
          {e.fichiers.map((f) => (
            <li key={f}>
              <a className="text-blue-700 underline dark:text-blue-300" href={urlFichier(f)} target="_blank" rel="noreferrer noopener">
                {nomFichier(f, offre.candidature?.dossier ?? null)}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {e.echeance ? (
          <button type="button" className="bouton" disabled={fait.isPending} onClick={() => fait.mutate(true)}>
            ✓ Marquer fait
          </button>
        ) : (
          <button type="button" className="bouton" disabled={fait.isPending} onClick={() => fait.mutate(false)} aria-label={`Rouvrir : ${e.resume}`}>
            Rouvrir
          </button>
        )}
        <button type="button" className="bouton" onClick={modifier} aria-label={`Modifier : ${e.resume}`}>
          Modifier
        </button>
        <button
          type="button"
          className="bouton"
          disabled={supprimer.isPending}
          aria-label={`Supprimer : ${e.resume}`}
          onClick={() => {
            if (window.confirm(`Supprimer l'événement « ${e.resume} » ?`)) supprimer.mutate();
          }}
        >
          Supprimer
        </button>
        <span className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400">{e.origine}</span>
      </div>
    </li>
  );
}

export function Journal({ offre }: { offre: DetailOffre }) {
  const fichiers = useFichiers(offre.id);
  const [edition, setEdition] = useState<'nouveau' | number | null>(null);
  const enCours = typeof edition === 'number' ? (offre.evenements.find((e) => e.id === edition) ?? null) : null;
  return (
    <div className="space-y-2">
      {edition === 'nouveau' ? (
        <FormulaireEvenement offre={offre} evenement={null} fichiers={fichiers.data} fermer={() => setEdition(null)} />
      ) : (
        <button type="button" className="bouton" onClick={() => setEdition('nouveau')}>
          + Ajouter un événement
        </button>
      )}
      {offre.evenements.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Journal vide.</p>
      ) : (
        <ol className="space-y-2" aria-label="Journal, échéances en tête">
          {offre.evenements.map((e) =>
            enCours?.id === e.id ? (
              <li key={e.id}>
                <FormulaireEvenement offre={offre} evenement={e} fichiers={fichiers.data} fermer={() => setEdition(null)} />
              </li>
            ) : (
              <LigneEvenement key={e.id} offre={offre} e={e} modifier={() => setEdition(e.id)} />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

export function FichiersDuDossier({ offre }: { offre: DetailOffre }) {
  const q = useFichiers(offre.id);
  if (q.isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Chargement…</p>;
  if (q.isError) return <p className="text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>;
  const f = q.data!;
  if (!f.dossier) return <p className="text-sm text-slate-600 dark:text-slate-400">Pas de dossier de candidature.</p>;
  if (!f.existe) return <p className="text-sm text-slate-600 dark:text-slate-400">Dossier {f.dossier} introuvable dans le dossier de données.</p>;
  return (
    <div>
      <p className="mb-1 text-xs text-slate-600 dark:text-slate-400">{f.dossier}</p>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
        {f.fichiers.map((x) => (
          <li key={x.chemin} className="flex flex-wrap items-baseline gap-x-3 px-2 py-1">
            <a className="min-w-0 flex-1 break-all text-blue-700 underline dark:text-blue-300" href={urlFichier(x.chemin)} target="_blank" rel="noreferrer noopener">
              {x.nom}
            </a>
            <span className="text-xs text-slate-600 tabular-nums dark:text-slate-400">
              {taille(x.taille)} · {new Date(x.modifie_le).toLocaleDateString('fr-FR')}
            </span>
          </li>
        ))}
        {!f.fichiers.length && <li className="px-2 py-1 text-slate-600 dark:text-slate-400">Dossier vide.</li>}
      </ul>
      {f.tronque && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Liste coupée : trop de fichiers.</p>}
    </div>
  );
}
