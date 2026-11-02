import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LIBELLES_STATUTS, STATUTS, type Statut } from '../../../src/core/statuts.ts';
import { api, type DetailOffre } from '../api.ts';
import { BadgeNote, BadgeStatut, formaterDate, formaterNote } from './Badges.tsx';
import { FichiersDuDossier, Journal } from './Journal.tsx';
import { BadgeAncienneGrille, DecompositionNote, EditeurSousNotes } from './Decomposition.tsx';

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-0.5 text-sm">
      <dt className="font-semibold text-slate-600 dark:text-slate-300">{libelle}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function EditeurTags({ offre }: { offre: DetailOffre }) {
  const client = useQueryClient();
  const id = useId();
  const [saisie, setSaisie] = useState('');
  const maj = useMutation({
    mutationFn: (tags: string[]) => api.tags(offre.id, tags),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['offre', offre.id] });
      client.invalidateQueries({ queryKey: ['offres'] });
      client.invalidateQueries({ queryKey: ['meta'] });
    },
  });
  const ajouter = () => {
    const nouveaux = saisie
      .split(/[,\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!nouveaux.length) return;
    maj.mutate([...new Set([...offre.tags, ...nouveaux])]);
    setSaisie('');
  };
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-1" aria-label="Tags de l'offre">
        {offre.tags.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">Aucun tag</li>}
        {offre.tags.map((t) => (
          <li key={t} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
            {t}
            <button
              type="button"
              className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
              aria-label={`Retirer le tag ${t}`}
              onClick={() => maj.mutate(offre.tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ajouter();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Ajouter des tags
        </label>
        <input id={id} className="champ" placeholder="nouveau-tag" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        <button type="submit" className="bouton">
          Ajouter
        </button>
      </form>
    </div>
  );
}

function EditeurLien({ offre }: { offre: DetailOffre }) {
  const client = useQueryClient();
  const id = useId();
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState(offre.url_canonique ?? '');
  const maj = useMutation({
    mutationFn: (url: string | null) => api.lien(offre.id, url),
    onSuccess: () => {
      setEdition(false);
      client.invalidateQueries({ queryKey: ['offre', offre.id] });
      client.invalidateQueries({ queryKey: ['offres'] });
    },
  });
  if (!edition) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {offre.url_canonique ? (
          <a className="break-all text-blue-700 underline dark:text-blue-300" href={offre.url_canonique} target="_blank" rel="noreferrer noopener">
            {offre.url_canonique}
          </a>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Aucun lien enregistré</span>
        )}
        <button
          type="button"
          className="bouton"
          onClick={() => {
            setSaisie(offre.url_canonique ?? '');
            setEdition(true);
          }}
        >
          {offre.url_canonique ? 'Modifier' : 'Ajouter un lien'}
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate(saisie.trim() || null);
      }}
    >
      <label htmlFor={id} className="sr-only">
        Lien de l'offre
      </label>
      <input id={id} className="champ min-w-0 flex-1" type="url" placeholder="https://…" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoFocus />
      <button type="submit" className="bouton">
        Enregistrer
      </button>
      <button type="button" className="bouton" onClick={() => setEdition(false)}>
        Annuler
      </button>
      {maj.isError && <p className="w-full text-sm text-rose-700 dark:text-rose-300">{(maj.error as Error).message}</p>}
    </form>
  );
}

/** « 6,5 » ou « 6.5 » → 6.5 ; vide → null ; texte invalide → NaN (refusé avant l'envoi). */
function lireNombre(s: string): number | null {
  const t = s.trim().replace(',', '.');
  return t === '' ? null : Number(t);
}

function useRafraichir(id: number) {
  const client = useQueryClient();
  return (d: DetailOffre) => {
    client.setQueryData(['offre', id], d);
    client.invalidateQueries({ queryKey: ['offres'] });
    client.invalidateQueries({ queryKey: ['meta'] });
  };
}

/** Saisie ou correction de la note : ajoute une entrée à l'historique (origine « interface »). */
function EditeurNote({ offre }: { offre: DetailOffre }) {
  const n = offre.notes[0];
  const base = useId();
  const rafraichir = useRafraichir(offre.id);
  const [edition, setEdition] = useState(false);
  const initial = () => ({
    note: n?.note === null || n?.note === undefined ? '' : formaterNote(n.note),
    note_brute: n?.note_brute === null || n?.note_brute === undefined ? '' : formaterNote(n.note_brute),
    penalites: n?.penalites ?? '',
    colle: n?.colle ?? '',
    ecarts: n?.ecarts ?? '',
  });
  const [s, setS] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = useMutation({
    mutationFn: () => {
      const note = lireNombre(s.note);
      const brute = lireNombre(s.note_brute);
      for (const [nom, v] of [
        ['Note', note],
        ['Note brute', brute],
      ] as const) {
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10)) throw new Error(`${nom} : nombre de 0 à 10 attendu`);
      }
      if (note === null) throw new Error('Note finale attendue');
      return api.noter(offre.id, { note, note_brute: brute, penalites: s.penalites, colle: s.colle, ecarts: s.ecarts });
    },
    onSuccess: (d) => {
      rafraichir(d);
      setEdition(false);
      setErreur(null);
    },
    onError: (e) => setErreur((e as Error).message),
  });
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
        {n ? 'Note globale (ancienne grille)' : 'Note globale'}
      </button>
    );
  }
  const champ = (cle: keyof ReturnType<typeof initial>, libelle: string, opts: { court?: boolean; long?: boolean } = {}) => (
    <div className={opts.court ? 'w-28 shrink-0' : 'w-full'}>
      <label htmlFor={`${base}-${cle}`} className="etiquette">
        {libelle}
      </label>
      {opts.long ? (
        <textarea id={`${base}-${cle}`} className="champ min-h-16" value={s[cle]} onChange={(e) => setS({ ...s, [cle]: e.target.value })} />
      ) : (
        <input
          id={`${base}-${cle}`}
          className="champ"
          inputMode={opts.court ? 'decimal' : undefined}
          value={s[cle]}
          onChange={(e) => setS({ ...s, [cle]: e.target.value })}
        />
      )}
    </div>
  );
  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label="Saisie de la note"
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {champ('note', 'Note /10', { court: true })}
        {champ('note_brute', 'Note brute', { court: true })}
        <div className="min-w-40 flex-1">{champ('penalites', 'Pénalités')}</div>
      </div>
      {champ('colle', 'Ce qui colle', { long: true })}
      {champ('ecarts', 'Écarts', { long: true })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton-principal" disabled={maj.isPending}>
          Enregistrer la note
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
    </form>
  );
}

type SaisieSuivi = { prochaine_action: string; envoyee_le: string; canal: string };

function suiviInitial(offre: DetailOffre): SaisieSuivi {
  const c = offre.candidature;
  return {
    prochaine_action: c?.prochaine_action ?? '',
    envoyee_le: c?.envoyee_le ? formaterDate(c.envoyee_le) : '',
    canal: c?.canal ?? '',
  };
}

/** Suivi de la candidature : prochaine action, date d'envoi, canal. */
function EditeurCandidature({ offre }: { offre: DetailOffre }) {
  const base = useId();
  const rafraichir = useRafraichir(offre.id);
  const initial = suiviInitial(offre);
  const [s, setS] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const cle = JSON.stringify(initial);
  useEffect(() => setS(JSON.parse(cle) as SaisieSuivi), [cle]);
  const maj = useMutation({
    mutationFn: () => {
      // Seulement ce qui a changé : une date d'envoi inchangée ne refait pas passer l'offre en « envoyée ».
      const champs: Record<string, string | null> = {};
      for (const k of ['prochaine_action', 'envoyee_le', 'canal'] as const) {
        if (s[k].trim() !== initial[k].trim()) champs[k] = s[k].trim() || null;
      }
      return api.candidature(offre.id, champs);
    },
    onSuccess: (d) => {
      rafraichir(d);
      setMessage('Candidature enregistrée.');
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const modifie = JSON.stringify(s) !== cle;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate();
      }}
    >
      <div>
        <label htmlFor={`${base}-action`} className="etiquette">
          Prochaine action
        </label>
        <textarea
          id={`${base}-action`}
          className="champ min-h-16"
          placeholder="Relancer le …, au 1er contact : …"
          value={s.prochaine_action}
          onChange={(e) => setS({ ...s, prochaine_action: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={`${base}-envoi`} className="etiquette">
            Envoyée le
          </label>
          <input
            id={`${base}-envoi`}
            className="champ"
            placeholder="JJ/MM/AAAA"
            value={s.envoyee_le}
            onChange={(e) => setS({ ...s, envoyee_le: e.target.value })}
            aria-describedby={`${base}-aide-envoi`}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor={`${base}-canal`} className="etiquette">
            Canal
          </label>
          <input id={`${base}-canal`} className="champ" value={s.canal} onChange={(e) => setS({ ...s, canal: e.target.value })} />
        </div>
      </div>
      <p id={`${base}-aide-envoi`} className="text-xs text-slate-600 dark:text-slate-400">
        Une date d'envoi fait passer une offre pas encore envoyée en « Envoyée ». Un champ vidé est effacé.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton" disabled={maj.isPending || !modifie}>
          Enregistrer la candidature
        </button>
        {message && (
          <span role="status" className="text-sm text-slate-700 dark:text-slate-300">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

function ChangementStatut({ offre }: { offre: DetailOffre }) {
  const client = useQueryClient();
  const idStatut = useId();
  const idCom = useId();
  const [statut, setStatut] = useState<Statut>(offre.statut);
  const [commentaire, setCommentaire] = useState('');
  useEffect(() => setStatut(offre.statut), [offre.statut]);
  const maj = useMutation({
    mutationFn: () => api.statut(offre.id, statut, commentaire),
    onSuccess: (d) => {
      client.setQueryData(['offre', offre.id], d);
      client.invalidateQueries({ queryKey: ['offres'] });
      client.invalidateQueries({ queryKey: ['meta'] });
      setCommentaire('');
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate();
      }}
    >
      <div className="flex gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={idStatut} className="etiquette">
            Nouveau statut
          </label>
          <select id={idStatut} className="champ" value={statut} onChange={(e) => setStatut(e.target.value as Statut)}>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUTS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor={idCom} className="etiquette">
            Commentaire
          </label>
          <input id={idCom} className="champ" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </div>
      </div>
      <div>
        <button type="submit" className="bouton" disabled={maj.isPending}>
          Enregistrer le statut
        </button>
        {maj.isError && <span className="ml-2 text-sm text-rose-700 dark:text-rose-300">{(maj.error as Error).message}</span>}
      </div>
    </form>
  );
}

function BoutonCandidater({ offre, annoncer }: { offre: DetailOffre; annoncer: (m: string) => void }) {
  const client = useQueryClient();
  const maj = useMutation({
    mutationFn: () => api.candidater(offre.id),
    onSuccess: async (r) => {
      client.setQueryData(['offre', offre.id], r.offre);
      client.invalidateQueries({ queryKey: ['offres'] });
      client.invalidateQueries({ queryKey: ['meta'] });
      try {
        await navigator.clipboard.writeText(r.commande);
        annoncer(`« ${r.commande} » copié dans le presse-papiers. Offre passée en Go.`);
      } catch {
        annoncer(`Copie impossible : tapez « ${r.commande} ». Offre passée en Go.`);
      }
    },
    onError: (e) => annoncer((e as Error).message),
  });
  return (
    <button type="button" className="bouton-principal" onClick={() => maj.mutate()} disabled={maj.isPending}>
      Candidater
    </button>
  );
}

export function Detail({ id, fermer, annoncer }: { id: number; fermer: () => void; annoncer: (m: string) => void }) {
  const titre = useId();
  const entete = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: ['offre', id], queryFn: () => api.offre(id) });
  useEffect(() => {
    entete.current?.focus({ preventScroll: true });
  }, [id]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);
  const o = q.data;
  const n = o?.notes[0];
  return (
    <aside
      role="complementary"
      aria-labelledby={titre}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <h2 id={titre} ref={entete} tabIndex={-1} className="text-lg leading-snug font-bold">
            {o ? o.titre || '(sans titre)' : 'Chargement…'}
          </h2>
          {o && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              {o.entreprise && <span className="font-semibold">{o.entreprise}</span>}
              <BadgeStatut statut={o.statut} />
              <BadgeNote note={o.note} />
              <span className="text-slate-500 dark:text-slate-400">#{o.id}</span>
            </p>
          )}
        </div>
        <button type="button" className="bouton" onClick={fermer} aria-label="Fermer le détail (Échap)">
          Fermer
        </button>
      </div>
      {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
      {o && (
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <BoutonCandidater offre={o} annoncer={annoncer} />
            {o.url_canonique && (
              <a className="bouton" href={o.url_canonique} target="_blank" rel="noreferrer noopener">
                Ouvrir l'offre ↗
              </a>
            )}
          </div>
          <dl>
            <Ligne libelle="Lien">
              <EditeurLien key={o.id} offre={o} />
            </Ligne>
            <Ligne libelle="Lieu">{o.lieu}</Ligne>
            <Ligne libelle="Contrat">{o.contrat}</Ligne>
            <Ligne libelle="Rémunération">{o.remuneration}</Ligne>
            <Ligne libelle="Télétravail">{o.teletravail}</Ligne>
            <Ligne libelle="Stack">{o.stack}</Ligne>
            <Ligne libelle="Source">{`${o.source} · ${o.id_site}`}</Ligne>
            <Ligne libelle="Reçue le">{formaterDate(o.recue_le)}</Ligne>
            <Ligne libelle="Publiée le">{o.publiee_le ? formaterDate(o.publiee_le) : null}</Ligne>
          </dl>

          <section aria-labelledby={`${titre}-note`}>
            <h3 id={`${titre}-note`} className="mb-2 font-bold">
              Note
            </h3>
            {n ? (
              <div className="space-y-1 rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <p className="flex flex-wrap items-center gap-x-2">
                  <strong>{formaterNote(n.note)}/10</strong>
                  {n.decomposition ? null : (
                    <>
                      <BadgeAncienneGrille />
                      {n.note_brute !== null && <span>brute {formaterNote(n.note_brute)}</span>}
                      {n.penalites && <span>pénalités : {n.penalites}</span>}
                    </>
                  )}
                  <span className="text-slate-600 dark:text-slate-400">
                    {formaterDate(n.notee_le)} ({n.origine})
                  </span>
                </p>
                {n.decomposition && <DecompositionNote note={n} />}
                {n.colle && (
                  <p>
                    <span className="font-semibold">Ce qui colle : </span>
                    {n.colle}
                  </p>
                )}
                {n.ecarts && (
                  <p>
                    <span className="font-semibold">Écarts : </span>
                    {n.ecarts}
                  </p>
                )}
                {o.notes.length > 1 && (
                  <p className="text-slate-600 dark:text-slate-400">{o.notes.length - 1} note(s) précédente(s)</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">Pas encore notée.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <EditeurSousNotes key={`sn-${o.id}`} offre={o} />
              <EditeurNote key={o.id} offre={o} />
            </div>
          </section>

          <section aria-labelledby={`${titre}-candidature`}>
            <h3 id={`${titre}-candidature`} className="mb-2 font-bold">
              Candidature
            </h3>
            {o.candidature && (
              <dl className="mb-2">
                <Ligne libelle="Dossier">{o.candidature.dossier}</Ligne>
                <Ligne libelle="CV">{o.candidature.cv}</Ligne>
                <Ligne libelle="Conditions">{o.candidature.conditions}</Ligne>
              </dl>
            )}
            <EditeurCandidature key={o.id} offre={o} />
          </section>

          <section aria-labelledby={`${titre}-journal`}>
            <h3 id={`${titre}-journal`} className="mb-2 font-bold">
              Journal{' '}
              {o.evenements.some((e) => e.en_retard) && (
                <span className="ml-1 rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">
                  {o.evenements.filter((e) => e.en_retard).length} en retard
                </span>
              )}
            </h3>
            <Journal key={o.id} offre={o} />
          </section>

          <section aria-labelledby={`${titre}-fichiers`}>
            <h3 id={`${titre}-fichiers`} className="mb-2 font-bold">
              Fichiers du dossier
            </h3>
            <FichiersDuDossier offre={o} />
          </section>

          <section aria-labelledby={`${titre}-tags`}>
            <h3 id={`${titre}-tags`} className="mb-2 font-bold">
              Tags
            </h3>
            <EditeurTags offre={o} />
          </section>

          <section aria-labelledby={`${titre}-statut`}>
            <h3 id={`${titre}-statut`} className="mb-2 font-bold">
              Statut
            </h3>
            <ChangementStatut offre={o} />
            <ol className="mt-3 space-y-1 border-l-2 border-slate-300 pl-3 text-sm dark:border-slate-600">
              {o.statuts.map((s) => (
                <li key={s.id}>
                  <span className="text-slate-600 tabular-nums dark:text-slate-400">{formaterDate(s.le.slice(0, 10))}</span>{' '}
                  <BadgeStatut statut={s.statut} /> {s.commentaire && <span className="break-words">{s.commentaire}</span>}
                </li>
              ))}
              {!o.statuts.length && <li className="text-slate-500 dark:text-slate-400">Aucun historique</li>}
            </ol>
          </section>

          <section aria-labelledby={`${titre}-desc`}>
            <h3 id={`${titre}-desc`} className="mb-2 font-bold">
              Description
            </h3>
            {o.description ? (
              <div className="text-sm leading-relaxed whitespace-pre-line">{o.description}</div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Pas de description en base{o.url_canonique ? ' : ouvrir l’offre sur le site.' : '.'}
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
