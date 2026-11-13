import { ExternalLink, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STATUTS, type Statut } from '../../../src/core/statuts.ts';
import { statutAffiche, t } from '../i18n/index.ts';
import { api, urlFichier, type DetailOffre } from '../api.ts';
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

/**
 * CV de la candidature : lien qui l'ouvre dans un nouvel onglet (servi par /api/fichier, seulement dans le dossier de
 * données). Un chemin absolu ou hors de l'espace n'est pas servi : il reste affiché en texte.
 */
function LienCv({ chemin }: { chemin: string }) {
  const relatif = chemin.replace(/\\/g, '/');
  if (/^([a-z]:|\/)/i.test(relatif) || relatif.split('/').includes('..')) return <>{chemin}</>;
  const nom = relatif.split('/').pop() ?? relatif;
  return (
    <a className="break-all text-blue-700 underline dark:text-blue-300" href={urlFichier(relatif)} target="_blank" rel="noreferrer noopener" title={relatif}>
      {nom}
    </a>
  );
}

/**
 * Dossier de la candidature : lien vers sa fiche (dossier-candidature.md, sinon le premier .md du dossier), affichée
 * mise en forme par /api/fichier. Un navigateur ne peut pas ouvrir un dossier local depuis une page web : sans fiche,
 * le chemin reste en texte (les fichiers du dossier sont listés plus bas).
 */
function LienDossier({ offreId, dossier }: { offreId: number; dossier: string }) {
  const q = useQuery({ queryKey: ['fichiers', offreId], queryFn: () => api.fichiers(offreId) });
  const md = q.data?.fichiers ?? [];
  const fiche = md.find((f) => f.nom === 'dossier-candidature.md') ?? md.find((f) => f.nom.toLowerCase().endsWith('.md'));
  if (!fiche) return <>{dossier}</>;
  return (
    <a className="break-all text-blue-700 underline dark:text-blue-300" href={urlFichier(fiche.chemin)} target="_blank" rel="noreferrer noopener" title={fiche.chemin}>
      {dossier.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? dossier}
    </a>
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
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!nouveaux.length) return;
    maj.mutate([...new Set([...offre.tags, ...nouveaux])]);
    setSaisie('');
  };
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-1" aria-label={t('tags.liste')}>
        {offre.tags.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">{t('tags.aucun')}</li>}
        {offre.tags.map((x) => (
          <li key={x} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
            {x}
            <button
              type="button"
              className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
              aria-label={t('tags.retirer', { tag: x })}
              onClick={() => maj.mutate(offre.tags.filter((y) => y !== x))}
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
          {t('tags.ajouterLibelle')}
        </label>
        <input id={id} className="champ" placeholder={t('tags.nouveau')} value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        <button type="submit" className="bouton">
          {t('tags.ajouter')}
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
          <span className="text-slate-500 dark:text-slate-400">{t('lien.aucun')}</span>
        )}
        <button
          type="button"
          className="bouton"
          onClick={() => {
            setSaisie(offre.url_canonique ?? '');
            setEdition(true);
          }}
        >
          {offre.url_canonique ? t('lien.modifier') : t('lien.ajouter')}
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
        {t('lien.libelle')}
      </label>
      <input id={id} className="champ min-w-0 flex-1" type="url" placeholder="https://…" value={saisie} onChange={(e) => setSaisie(e.target.value)} autoFocus />
      <button type="submit" className="bouton">
        {t('commun.enregistrer')}
      </button>
      <button type="button" className="bouton" onClick={() => setEdition(false)}>
        {t('commun.annuler')}
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
        [t('note.sur10'), note],
        [t('note.brute'), brute],
      ] as const) {
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10)) throw new Error(t('note.nombre', { nom }));
      }
      if (note === null) throw new Error(t('note.finaleAttendue'));
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
        {n ? t('note.globaleAncienne') : t('note.globale')}
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
      aria-label={t('note.saisie')}
      onSubmit={(e) => {
        e.preventDefault();
        maj.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {champ('note', t('note.sur10'), { court: true })}
        {champ('note_brute', t('note.brute'), { court: true })}
        <div className="min-w-40 flex-1">{champ('penalites', t('note.penalites'))}</div>
      </div>
      {champ('colle', t('note.colle'), { long: true })}
      {champ('ecarts', t('note.ecarts'), { long: true })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton-principal" disabled={maj.isPending}>
          {t('note.enregistrer')}
        </button>
        <button type="button" className="bouton" onClick={() => setEdition(false)}>
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
      setMessage(t('candidature.enregistree'));
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
          {t('candidature.prochaineAction')}
        </label>
        <textarea
          id={`${base}-action`}
          className="champ min-h-16"
          placeholder={t('candidature.prochaineExemple')}
          value={s.prochaine_action}
          onChange={(e) => setS({ ...s, prochaine_action: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={`${base}-envoi`} className="etiquette">
            {t('candidature.envoyeeLe')}
          </label>
          <input
            id={`${base}-envoi`}
            className="champ"
            placeholder={t('candidature.formatDate')}
            value={s.envoyee_le}
            onChange={(e) => setS({ ...s, envoyee_le: e.target.value })}
            aria-describedby={`${base}-aide-envoi`}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor={`${base}-canal`} className="etiquette">
            {t('candidature.canal')}
          </label>
          <input id={`${base}-canal`} className="champ" value={s.canal} onChange={(e) => setS({ ...s, canal: e.target.value })} />
        </div>
      </div>
      <p id={`${base}-aide-envoi`} className="text-xs text-slate-600 dark:text-slate-400">
        {t('candidature.aide')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="bouton" disabled={maj.isPending || !modifie}>
          {t('candidature.enregistrer')}
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={idStatut} className="etiquette">
            {t('detail.nouveauStatut')}
          </label>
          <select id={idStatut} className="champ" value={statut} onChange={(e) => setStatut(e.target.value as Statut)}>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {statutAffiche(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={idCom} className="etiquette">
            {t('detail.commentaire')}
          </label>
          <input id={idCom} className="champ" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </div>
        <button type="submit" className="bouton" disabled={maj.isPending}>
          {t('detail.enregistrerStatut')}
        </button>
      </div>
      {maj.isError && <span className="text-sm text-rose-700 dark:text-rose-300">{(maj.error as Error).message}</span>}
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
        annoncer(t('detail.copie', { commande: r.commande }));
      } catch {
        annoncer(t('detail.copieImpossible', { commande: r.commande }));
      }
    },
    onError: (e) => annoncer((e as Error).message),
  });
  return (
    <button type="button" className="bouton-principal" onClick={() => maj.mutate()} disabled={maj.isPending}>
      <Send className="size-4" aria-hidden="true" /> {t('detail.candidater')}
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
  // Un clic hors du panneau le ferme, sauf sur une ligne du tableau (qui ouvre une autre offre),
  // dans un menu déroulant ou dans une fenêtre modale ouverte par-dessus (réglages).
  const panneau = useRef<HTMLElement>(null);
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      const cible = e.target as Element | null;
      if (e.button !== 0 || !cible?.isConnected || panneau.current?.contains(cible)) return;
      if (cible.closest('tbody tr, details[data-menu], [aria-modal="true"]')) return;
      fermer();
    };
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [fermer]);
  const o = q.data;
  const n = o?.notes[0];
  return (
    <aside
      ref={panneau}
      role="complementary"
      aria-labelledby={titre}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <h2 id={titre} ref={entete} tabIndex={-1} className="text-lg leading-snug font-bold">
            {o ? o.titre || t('liste.sansTitre') : t('detail.chargement')}
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
        <button type="button" className="bouton" onClick={fermer} aria-label={t('detail.fermerEchap')}>
          <X className="size-4" aria-hidden="true" /> {t('detail.fermer')}
        </button>
      </div>
      {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
      {o && (
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <BoutonCandidater offre={o} annoncer={annoncer} />
            {o.url_canonique && (
              <a className="bouton" href={o.url_canonique} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-4" aria-hidden="true" /> {t('detail.ouvrirOffre')}
              </a>
            )}
          </div>
          <section aria-labelledby={`${titre}-statut`}>
            <h3 id={`${titre}-statut`} className="mb-2 font-bold">
              {t('detail.statut')}
            </h3>
            <ChangementStatut offre={o} />
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-400">{t('detail.historique', { n: o.statuts.length })}</summary>
              <ol className="mt-2 space-y-1 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
              {o.statuts.map((s) => (
                <li key={s.id}>
                  <span className="text-slate-600 tabular-nums dark:text-slate-400">{formaterDate(s.le.slice(0, 10))}</span>{' '}
                  <BadgeStatut statut={s.statut} /> {s.commentaire && <span className="break-words">{s.commentaire}</span>}
                </li>
              ))}
              {!o.statuts.length && <li className="text-slate-500 dark:text-slate-400">{t('detail.aucunHistorique')}</li>}
              </ol>
            </details>
          </section>
          <dl>
            <Ligne libelle={t('detail.lien')}>
              <EditeurLien key={o.id} offre={o} />
            </Ligne>
            <Ligne libelle={t('detail.lieu')}>{o.lieu}</Ligne>
            <Ligne libelle={t('detail.contrat')}>{o.contrat}</Ligne>
            <Ligne libelle={t('detail.remuneration')}>{o.remuneration}</Ligne>
            <Ligne libelle={t('detail.teletravail')}>{o.teletravail}</Ligne>
            <Ligne libelle={t('detail.stack')}>{o.stack}</Ligne>
            <Ligne libelle={t('detail.source')}>{`${o.source} · ${o.id_site}`}</Ligne>
            <Ligne libelle={t('detail.recueLe')}>{formaterDate(o.recue_le)}</Ligne>
            <Ligne libelle={t('detail.publieeLe')}>{o.publiee_le ? formaterDate(o.publiee_le) : null}</Ligne>
          </dl>

          <section aria-labelledby={`${titre}-note`}>
            <h3 id={`${titre}-note`} className="mb-2 font-bold">
              {t('detail.note')}
            </h3>
            {n ? (
              <div className="space-y-1 rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <p className="flex flex-wrap items-center gap-x-2">
                  <strong>{formaterNote(n.note)}/10</strong>
                  {n.decomposition ? null : (
                    <>
                      <BadgeAncienneGrille />
                      {n.note_brute !== null && <span>{t('detail.brute', { note: formaterNote(n.note_brute) })}</span>}
                      {n.penalites && <span>{t('detail.penalites', { texte: n.penalites })}</span>}
                    </>
                  )}
                  <span className="text-slate-600 dark:text-slate-400">
                    {formaterDate(n.notee_le)} ({n.origine})
                  </span>
                </p>
                {n.decomposition && <DecompositionNote note={n} />}
                {n.colle && (
                  <p>
                    <span className="font-semibold">{t('detail.colle')}</span>
                    {n.colle}
                  </p>
                )}
                {n.ecarts && (
                  <p>
                    <span className="font-semibold">{t('detail.ecarts')}</span>
                    {n.ecarts}
                  </p>
                )}
                {o.notes.length > 1 && (
                  <p className="text-slate-600 dark:text-slate-400">{t('detail.precedentes', { n: o.notes.length - 1 })}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('detail.pasNotee')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <EditeurSousNotes key={`sn-${o.id}`} offre={o} />
              <EditeurNote key={o.id} offre={o} />
            </div>
          </section>

          <section aria-labelledby={`${titre}-candidature`}>
            <h3 id={`${titre}-candidature`} className="mb-2 font-bold">
              {t('detail.candidature')}
            </h3>
            {o.candidature && (
              <dl className="mb-2">
                <Ligne libelle={t('detail.dossier')}>
                  {o.candidature.dossier && <LienDossier offreId={o.id} dossier={o.candidature.dossier} />}
                </Ligne>
                <Ligne libelle={t('detail.cv')}>{o.candidature.cv && <LienCv chemin={o.candidature.cv} />}</Ligne>
                <Ligne libelle={t('detail.conditions')}>{o.candidature.conditions}</Ligne>
              </dl>
            )}
            <EditeurCandidature key={o.id} offre={o} />
          </section>

          <section aria-labelledby={`${titre}-journal`}>
            <h3 id={`${titre}-journal`} className="mb-2 font-bold">
              {t('detail.journal')}{' '}
              {o.evenements.some((e) => e.en_retard) && (
                <span className="ml-1 rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">
                  {t('detail.enRetard', { n: o.evenements.filter((e) => e.en_retard).length })}
                </span>
              )}
            </h3>
            <Journal key={o.id} offre={o} />
          </section>

          <section aria-labelledby={`${titre}-fichiers`}>
            <h3 id={`${titre}-fichiers`} className="mb-2 font-bold">
              {t('detail.fichiers')}
            </h3>
            <FichiersDuDossier offre={o} />
          </section>

          <section aria-labelledby={`${titre}-tags`}>
            <h3 id={`${titre}-tags`} className="mb-2 font-bold">
              {t('detail.tags')}
            </h3>
            <EditeurTags offre={o} />
          </section>


          <section aria-labelledby={`${titre}-desc`}>
            <h3 id={`${titre}-desc`} className="mb-2 font-bold">
              {t('detail.description')}
            </h3>
            {o.description ? (
              <div className="text-sm leading-relaxed whitespace-pre-line">{o.description}</div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {o.url_canonique ? t('detail.sansDescriptionLien') : t('detail.sansDescription')}
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
