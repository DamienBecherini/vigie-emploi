// Journal de la candidature (événements datés, échéances) et fichiers du dossier, dans le panneau de détail.
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TYPES_EVENEMENT, type Sens, type TypeEvenement } from '../../../src/core/statuts.ts';
import { api, urlFichier, type DetailOffre, type Evenement, type FichiersDossier, type SaisieEvenement } from '../api.ts';
import { dateCourte, nombre as nombreLocal, t, typeAffiche } from '../i18n/index.ts';

const deux = (n: number) => String(n).padStart(2, '0');

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

/** « 05/11/2026 » ou « 05/11/2026 à 14 h 30 » (anglais : « 05/11/2026 at 14:30 »). */
export function dateEvenement(le: string): string {
  const m = le.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return le;
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? t('journal.date', { date, heure: t('journal.heure', { h: m[4], m: m[5] }) }) : date;
}

function estFutur(date: string, heure: string): boolean {
  const j = aujourdhui();
  if (date !== j) return date > j;
  if (!heure) return false;
  const d = new Date();
  return heure > `${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

function taille(o: number): string {
  return o < 1024 ? t('fichiers.octets', { n: o }) : o < 1024 * 1024 ? t('fichiers.ko', { n: Math.ceil(o / 1024) }) : t('fichiers.mo', { n: nombreLocal(o / 1024 / 1024, 1) });
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
  const brut = s.trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!brut) return null;
  const n = Number(brut);
  if (!Number.isFinite(n)) throw new Error(t('journal.nombreAttendu', { nom }));
  return n;
}

function versApi(s: Saisie): SaisieEvenement {
  if (!s.resume.trim()) throw new Error(t('journal.resumeAttendu'));
  if (!s.date) throw new Error(t('journal.dateAttendue'));
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
    montant: nombre(s.montant, t('journal.montant')),
    unite: vide(s.unite),
    jours: nombre(s.jours, t('journal.jours')),
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
      aria-label={props.evenement ? t('journal.modifierEvenement') : t('journal.ajouterEvenement')}
      onSubmit={(e) => {
        e.preventDefault();
        setErreur(null);
        maj.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <div className="w-44 shrink-0">
          <label htmlFor={`${base}-type`} className="etiquette">
            {t('journal.type')}
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
            {TYPES_EVENEMENT.map((x) => (
              <option key={x} value={x}>
                {typeAffiche(x)}
              </option>
            ))}
          </select>
        </div>
        {(s.type === 'message' || s.type === 'proposition') && (
          <div className="w-32 shrink-0">
            <label htmlFor={`${base}-sens`} className="etiquette">
              {t('journal.sens')}
            </label>
            <select id={`${base}-sens`} className="champ" value={s.sens} onChange={(e) => setS({ ...s, sens: e.target.value as Saisie['sens'] })}>
              <option value="">—</option>
              <option value="envoye">{t('journal.envoye')}</option>
              <option value="recu">{t('journal.recu')}</option>
            </select>
          </div>
        )}
        <div className="w-40 shrink-0">
          <label htmlFor={`${base}-date`} className="etiquette">
            {t('journal.dateChamp')}
          </label>
          <input id={`${base}-date`} type="date" className="champ" required value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />
        </div>
        <div className="w-28 shrink-0">
          <label htmlFor={`${base}-heure`} className="etiquette">
            {t('journal.heureChamp')}
          </label>
          <input id={`${base}-heure`} type="time" className="champ" value={s.heure} onChange={(e) => setS({ ...s, heure: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor={`${base}-resume`} className="etiquette">
          {t('journal.resume')}
        </label>
        <input
          id={`${base}-resume`}
          className="champ"
          required
          placeholder={s.type === 'message' ? t('journal.exempleMessage') : t('journal.exempleAutre')}
          value={s.resume}
          onChange={(e) => setS({ ...s, resume: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {champ('canal', t('journal.canal'), { placeholder: t('journal.exempleCanal') })}
        {champ('interlocuteurs', t('journal.interlocuteurs'))}
      </div>
      {s.type === 'proposition' && (
        <div className="flex flex-wrap gap-2">
          {champ('montant', t('journal.montant'), { court: true, placeholder: t('journal.exempleMontant') })}
          {champ('unite', t('journal.unite'), { court: true, placeholder: t('journal.exempleUnite') })}
          {champ('jours', t('journal.jours'), { court: true, placeholder: '6' })}
        </div>
      )}
      <div>
        <label htmlFor={`${base}-details`} className="etiquette">
          {t('journal.details')}
        </label>
        <textarea id={`${base}-details`} className="champ min-h-16" value={s.details} onChange={(e) => setS({ ...s, details: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${base}-fichier`} className="etiquette">
          {t('journal.fichiersLies')}
        </label>
        {s.fichiers.length > 0 && (
          <ul className="mb-1 flex flex-wrap gap-1" aria-label={t('journal.listeFichiers')}>
            {s.fichiers.map((f) => (
              <li key={f} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
                {nomFichier(f, props.offre.candidature?.dossier ?? null)}
                <button
                  type="button"
                  className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
                  aria-label={t('journal.retirer', { fichier: f })}
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
            <option value="">{disponibles.length ? t('journal.lierFichier') : t('journal.aucunAutre')}</option>
            {disponibles.map((f) => (
              <option key={f.chemin} value={f.chemin}>
                {f.nom}
              </option>
            ))}
          </select>
        ) : (
          <p id={`${base}-fichier`} className="text-xs text-slate-600 dark:text-slate-400">
            {t('journal.sansDossier')}
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
        {t('journal.fait')} {fait ? '' : t('journal.echeance')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton-principal" disabled={maj.isPending}>
          {props.evenement ? t('commun.enregistrer') : t('journal.ajouter')}
        </button>
        <button type="button" className="bouton" onClick={props.fermer}>
          {t('commun.annuler')}
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
      {typeAffiche(type)}
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
    e.montant !== null ? `${nombreLocal(e.montant)} ${e.unite ?? ''}`.trim() : null,
    e.jours !== null ? t('journal.jourCourt', { n: nombreLocal(e.jours) }) : null,
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
        {e.sens && <span className="text-xs text-slate-600 dark:text-slate-300">{e.sens === 'envoye' ? t('journal.versEnvoye') : t('journal.versRecu')}</span>}
        {e.en_retard && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">{t('journal.enRetard')}</span>}
        {e.echeance && !e.en_retard && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-300 dark:text-slate-950">{t('journal.aFaire')}</span>
        )}
      </div>
      <p className="mt-1 break-words">{e.resume}</p>
      {infos.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">{infos.join(' · ')}</p>}
      {e.details && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">{t('journal.details')}</summary>
          <p className="mt-1 text-sm whitespace-pre-line">{e.details}</p>
        </details>
      )}
      {e.fichiers.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={t('journal.listeFichiers')}>
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
            {t('journal.marquerFait')}
          </button>
        ) : (
          <button type="button" className="bouton" disabled={fait.isPending} onClick={() => fait.mutate(false)} aria-label={t('journal.rouvrirLibelle', { resume: e.resume })}>
            {t('journal.rouvrir')}
          </button>
        )}
        <button type="button" className="bouton" onClick={modifier} aria-label={t('journal.modifierLibelle', { resume: e.resume })}>
          {t('journal.modifier')}
        </button>
        <button
          type="button"
          className="bouton"
          disabled={supprimer.isPending}
          aria-label={t('journal.supprimerLibelle', { resume: e.resume })}
          onClick={() => {
            if (window.confirm(t('journal.confirmer', { resume: e.resume }))) supprimer.mutate();
          }}
        >
          {t('journal.supprimer')}
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
          {t('journal.nouveau')}
        </button>
      )}
      {offre.evenements.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('journal.vide')}</p>
      ) : (
        <ol className="space-y-2" aria-label={t('journal.liste')}>
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
  if (q.isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('fichiers.chargement')}</p>;
  if (q.isError) return <p className="text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>;
  const f = q.data!;
  if (!f.dossier) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('fichiers.sansDossier')}</p>;
  if (!f.existe) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('fichiers.introuvable', { dossier: f.dossier })}</p>;
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
              {taille(x.taille)} · {dateCourte(new Date(x.modifie_le))}
            </span>
          </li>
        ))}
        {!f.fichiers.length && <li className="px-2 py-1 text-slate-600 dark:text-slate-400">{t('fichiers.vide')}</li>}
      </ul>
      {f.tronque && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('fichiers.tronque')}</p>}
    </div>
  );
}
