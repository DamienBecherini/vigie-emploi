// Panneau « Réglages de la note » : poids, barèmes, règles bloquantes, inventaire, seuil, exemples de référence,
// aperçu de l'impact avant d'enregistrer, historique des versions et restauration.
import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NIVEAUX, noteExemple, validerGrille, type Grille, type Niveau } from '../../../src/core/grille.ts';
import { niveauAffiche, nombre, pourcent, t } from '../i18n/index.ts';
import { api, type ChangementNote, type Impact } from '../api.ts';
import { useDebounce } from '../etat.ts';
import { BadgeNote, formaterDate, formaterNote } from './Badges.tsx';

const virgule = (n: number, d = 1) => nombre(n, d);

/** Champ numérique : accepte la virgule ; une saisie vide ou invalide n'est pas reportée. */
function ChampNombre(props: {
  libelle: string;
  valeur: number | undefined;
  changer: (v: number | undefined) => void;
  pas?: number;
  min?: number;
  max?: number;
  vide?: boolean;
  aide?: string;
  className?: string;
}) {
  const id = useId();
  const [texte, setTexte] = useState(props.valeur === undefined ? '' : String(props.valeur).replace('.', ','));
  useEffect(() => {
    setTexte((t) => {
      const actuel = t.trim() === '' ? undefined : Number(t.replace(',', '.'));
      return actuel === props.valeur ? t : props.valeur === undefined ? '' : String(props.valeur).replace('.', ',');
    });
  }, [props.valeur]);
  return (
    <div className={props.className ?? 'w-28'}>
      <label htmlFor={id} className="etiquette">
        {props.libelle}
      </label>
      <input
        id={id}
        className="champ tabular-nums"
        inputMode="decimal"
        value={texte}
        aria-describedby={props.aide ? `${id}-aide` : undefined}
        onChange={(e) => {
          setTexte(e.target.value);
          const t = e.target.value.trim().replace(',', '.');
          if (t === '') {
            if (props.vide) props.changer(undefined);
            return;
          }
          const n = Number(t);
          if (Number.isFinite(n)) props.changer(n);
        }}
      />
      {props.aide && (
        <p id={`${id}-aide`} className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
          {props.aide}
        </p>
      )}
    </div>
  );
}

function Section({ titre, children, aide }: { titre: string; children: React.ReactNode; aide?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h3 id={id} className="font-bold">
        {titre}
      </h3>
      {aide && <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">{aide}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Poids({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const somme = g.criteres.reduce((s, c) => s + c.poids, 0);
  return (
    <Section titre={t('poids.titre')} aide={t('poids.aide')}>
      <ul className="space-y-2">
        {g.criteres.map((c, i) => {
          const pct = somme > 0 ? (c.poids / somme) * 100 : 0;
          return (
            <li key={c.id} className="grid grid-cols-[minmax(9rem,14rem)_1fr_3.5rem_3.5rem] items-center gap-2 text-sm">
              <label htmlFor={`poids-${c.id}`} title={c.description}>
                <span className="font-semibold">{c.libelle}</span>{' '}
                <span className="text-xs text-slate-600 dark:text-slate-400">({c.source === 'ia' ? t('poids.ia') : t('poids.calcul')})</span>
              </label>
              <input
                id={`poids-${c.id}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={c.poids}
                className="accent-blue-700 dark:accent-blue-400"
                onChange={(e) => maj((x) => void (x.criteres[i].poids = Number(e.target.value)))}
                aria-valuetext={t('poids.valeur', { poids: c.poids, pct: Math.round(pct) })}
              />
              <span className="text-right tabular-nums">{c.poids}</span>
              <span className="text-right font-semibold tabular-nums">{pourcent(pct)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        {t('poids.total')}<strong className="tabular-nums">{somme}</strong>{t('poids.normalise')}
        {somme === 0 && <span className="ml-1 text-rose-700 dark:text-rose-300">{t('poids.aucun')}</span>}
      </p>
    </Section>
  );
}

function Baremes({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const tt = g.baremes.teletravail;
  const r = g.baremes.remuneration;
  const idRef = useId();
  return (
    <Section titre={t('baremes.titre')} aide={t('baremes.aide')}>
      <h4 className="mb-1 text-sm font-semibold">{t('baremes.teletravail')}</h4>
      <div className="flex flex-wrap gap-2">
        {tt.jours_sur_site.map((v, j) => (
          <ChampNombre
            key={j}
            className="w-20"
            libelle={j === 0 ? t('baremes.remote') : t('baremes.jours', { n: j })}
            valeur={v}
            changer={(n) => n !== undefined && maj((x) => void (x.baremes.teletravail.jours_sur_site[j] = n))}
          />
        ))}
        <ChampNombre className="w-20" libelle={t('baremes.inconnu')} valeur={tt.inconnu} changer={(n) => n !== undefined && maj((x) => void (x.baremes.teletravail.inconnu = n))} />
      </div>

      <h4 className="mt-4 mb-1 text-sm font-semibold">{t('baremes.remuneration')}</h4>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <label htmlFor={idRef} className="etiquette">
            {t('baremes.reference')}
          </label>
          <select
            id={idRef}
            className="champ"
            value={r.reference}
            onChange={(e) => maj((x) => void (x.baremes.remuneration.reference = e.target.value as Grille['baremes']['remuneration']['reference']))}
          >
            <option value="milieu">{t('baremes.milieu')}</option>
            <option value="min">{t('baremes.bas')}</option>
            <option value="max">{t('baremes.haut')}</option>
          </select>
        </div>
        <ChampNombre className="w-24" libelle={t('baremes.inconnue')} valeur={r.inconnue} changer={(n) => n !== undefined && maj((x) => void (x.baremes.remuneration.inconnue = n))} />
      </div>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">{t('baremes.salaire')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['plancher', 'cible_basse', 'cible_haute'] as const).map((k) => (
            <ChampNombre
              key={k}
              libelle={{ plancher: t('baremes.plancher'), cible_basse: t('baremes.cibleBasse'), cible_haute: t('baremes.cibleHaute') }[k]}
              valeur={r.salaire[k]}
              changer={(n) => n !== undefined && maj((x) => void (x.baremes.remuneration.salaire[k] = n))}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">{t('baremes.tjm')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['plancher', 'plancher_full_remote', 'cible_basse', 'cible_haute'] as const).map((k) => (
            <ChampNombre
              key={k}
              className={k === 'plancher_full_remote' ? 'w-36' : 'w-28'}
              libelle={{ plancher: t('baremes.plancher'), plancher_full_remote: t('baremes.plancherFullRemote'), cible_basse: t('baremes.cibleBasse'), cible_haute: t('baremes.cibleHaute') }[k]}
              valeur={r.tjm[k]}
              vide={k === 'plancher_full_remote'}
              changer={(n) =>
                maj((x) => {
                  if (n === undefined) delete x.baremes.remuneration.tjm.plancher_full_remote;
                  else x.baremes.remuneration.tjm[k] = n;
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('baremes.aideCible')}</p>
    </Section>
  );
}

function Regles({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const [nouvelle, setNouvelle] = useState({ id: '', libelle: '' });
  return (
    <Section titre={t('regles.titre')} aide={t('regles.aide')}>
      <ul className="space-y-2">
        {g.regles.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2 dark:bg-slate-800/60">
            <label className="flex items-center gap-1.5 self-center text-sm">
              <input
                type="checkbox"
                className="size-4 accent-blue-700 dark:accent-blue-400"
                checked={r.actif}
                onChange={(e) => maj((x) => void (x.regles[i].actif = e.target.checked))}
              />
              {t('regles.active')}
            </label>
            <div className="min-w-52 flex-1">
              <label htmlFor={`regle-${r.id}`} className="etiquette">
                {r.id}
              </label>
              <input id={`regle-${r.id}`} className="champ" value={r.libelle} onChange={(e) => maj((x) => void (x.regles[i].libelle = e.target.value))} title={r.description} />
            </div>
            <div className="w-32">
              <label htmlFor={`effet-${r.id}`} className="etiquette">
                {t('regles.effet')}
              </label>
              <select
                id={`effet-${r.id}`}
                className="champ"
                value={r.effet}
                onChange={(e) =>
                  maj((x) => {
                    x.regles[i].effet = e.target.value as 'zero' | 'plafond' | 'plafond_critere';
                    if (x.regles[i].effet === 'plafond' && x.regles[i].valeur === undefined) x.regles[i].valeur = 3;
                    if (x.regles[i].effet === 'plafond_critere') {
                      x.regles[i].critere ??= x.criteres[0]?.id;
                      x.regles[i].seuil ??= 4;
                    }
                  })
                }
              >
                <option value="zero">{t('regles.zero')}</option>
                <option value="plafond">{t('regles.plafond')}</option>
                <option value="plafond_critere">{t('regles.plafondCritere')}</option>
              </select>
            </div>
            {r.effet === 'plafond_critere' && (
              <>
                <div className="w-40">
                  <label htmlFor={`critere-${r.id}`} className="etiquette">
                    {t('regles.critere')}
                  </label>
                  <select
                    id={`critere-${r.id}`}
                    className="champ"
                    value={r.critere ?? ''}
                    onChange={(e) => maj((x) => void (x.regles[i].critere = e.target.value))}
                  >
                    {g.criteres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.libelle}
                      </option>
                    ))}
                  </select>
                </div>
                <ChampNombre className="w-24" libelle={t('regles.sousSeuil')} valeur={r.seuil} changer={(n) => n !== undefined && maj((x) => void (x.regles[i].seuil = n))} />
              </>
            )}
            {r.effet === 'plafond' && (
              <ChampNombre className="w-24" libelle={t('regles.plafond')} valeur={r.valeur} changer={(n) => n !== undefined && maj((x) => void (x.regles[i].valeur = n))} />
            )}
            <button type="button" className="bouton" onClick={() => maj((x) => void x.regles.splice(i, 1))} aria-label={t('regles.supprimerLibelle', { libelle: r.libelle })}>
              {t('regles.supprimer')}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = nouvelle.id.trim().toLowerCase();
          if (!id || !nouvelle.libelle.trim() || g.regles.some((r) => r.id === id)) return;
          maj((x) => void x.regles.push({ id, libelle: nouvelle.libelle.trim(), description: '', effet: 'zero', actif: true }));
          setNouvelle({ id: '', libelle: '' });
        }}
      >
        <div className="w-40">
          <label htmlFor="regle-nouvelle-id" className="etiquette">
            {t('regles.identifiant')}
          </label>
          <input id="regle-nouvelle-id" className="champ" placeholder={t('regles.identifiantExemple')} value={nouvelle.id} onChange={(e) => setNouvelle({ ...nouvelle, id: e.target.value })} />
        </div>
        <div className="min-w-52 flex-1">
          <label htmlFor="regle-nouvelle-libelle" className="etiquette">
            {t('regles.libelle')}
          </label>
          <input id="regle-nouvelle-libelle" className="champ" value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} />
        </div>
        <button type="submit" className="bouton">
          {t('regles.ajouter')}
        </button>
      </form>
    </Section>
  );
}

function Inventaire({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const [filtre, setFiltre] = useState('');
  const [nouvelle, setNouvelle] = useState<{ techno: string; niveau: Niveau; precision: string }>({ techno: '', niveau: 'moyen', precision: '' });
  const f = filtre.trim().toLowerCase();
  const lignes = g.inventaire.map((x, i) => ({ x, i })).filter(({ x }) => !f || `${x.techno} ${x.precision ?? ''}`.toLowerCase().includes(f));
  const compte = (n: Niveau) => g.inventaire.filter((x) => x.niveau === n).length;
  return (
    <Section titre={t('inventaire.titre')} aide={t('inventaire.aide')}>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label htmlFor="inv-filtre" className="etiquette">
            {t('inventaire.filtrer')}
          </label>
          <input id="inv-filtre" type="search" className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {NIVEAUX.map((n) => `${niveauAffiche(n)} ${compte(n)}`).join(' · ')}
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('inventaire.titre')}</caption>
          <thead className="sticky top-0 bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th scope="col" className="px-2 py-1">
                {t('inventaire.techno')}
              </th>
              <th scope="col" className="px-2 py-1">
                {t('inventaire.niveau')}
              </th>
              <th scope="col" className="px-2 py-1">
                {t('inventaire.precision')}
              </th>
              <th scope="col" className="px-2 py-1">
                <span className="sr-only">{t('inventaire.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ x, i }) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-2 py-1">
                  <input aria-label={t('inventaire.techno')} className="champ" value={x.techno} onChange={(e) => maj((y) => void (y.inventaire[i].techno = e.target.value))} />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={t('inventaire.niveauDe', { techno: x.techno })}
                    className="champ w-24"
                    value={x.niveau}
                    onChange={(e) => maj((y) => void (y.inventaire[i].niveau = e.target.value as Niveau))}
                  >
                    {NIVEAUX.map((n) => (
                      <option key={n} value={n}>
                        {niveauAffiche(n)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={t('inventaire.precisionPour', { techno: x.techno })}
                    className="champ"
                    value={x.precision ?? ''}
                    onChange={(e) =>
                      maj((y) => {
                        if (e.target.value) y.inventaire[i].precision = e.target.value;
                        else delete y.inventaire[i].precision;
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" className="bouton" onClick={() => maj((y) => void y.inventaire.splice(i, 1))} aria-label={t('inventaire.retirer', { techno: x.techno })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="mt-2 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nouvelle.techno.trim()) return;
          maj((x) =>
            void x.inventaire.push({
              techno: nouvelle.techno.trim(),
              niveau: nouvelle.niveau,
              ...(nouvelle.precision.trim() ? { precision: nouvelle.precision.trim() } : {}),
            }),
          );
          setNouvelle({ techno: '', niveau: nouvelle.niveau, precision: '' });
        }}
      >
        <div className="min-w-40 flex-1">
          <label htmlFor="inv-techno" className="etiquette">
            {t('inventaire.nouvelle')}
          </label>
          <input id="inv-techno" className="champ" value={nouvelle.techno} onChange={(e) => setNouvelle({ ...nouvelle, techno: e.target.value })} />
        </div>
        <div className="w-28">
          <label htmlFor="inv-niveau" className="etiquette">
            {t('inventaire.niveau')}
          </label>
          <select id="inv-niveau" className="champ" value={nouvelle.niveau} onChange={(e) => setNouvelle({ ...nouvelle, niveau: e.target.value as Niveau })}>
            {NIVEAUX.map((n) => (
              <option key={n} value={n}>
                {niveauAffiche(n)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="inv-precision" className="etiquette">
            {t('inventaire.precision')}
          </label>
          <input id="inv-precision" className="champ" value={nouvelle.precision} onChange={(e) => setNouvelle({ ...nouvelle, precision: e.target.value })} />
        </div>
        <button type="submit" className="bouton">
          {t('inventaire.ajouter')}
        </button>
      </form>
    </Section>
  );
}

function Exemples({ g }: { g: Grille }) {
  return (
    <Section titre={t('exemples.titre')} aide={t('exemples.aide')}>
      <ul className="space-y-2">
        {g.exemples.map((e, i) => {
          const d = noteExemple(g, e);
          return (
            <li key={i} className="rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-800/60">
              <p className="flex flex-wrap items-center gap-2">
                <BadgeNote note={d.note} />
                <strong>{e.entreprise ? `${e.entreprise} — ` : ''}{e.titre}</strong>
                {e.conditions && <span className="text-slate-600 dark:text-slate-400">{e.conditions}</span>}
              </p>
              <p className="mt-1 text-slate-700 dark:text-slate-300">
                {d.criteres.map((c) => `${c.libelle} ${virgule(c.note)}`).join(' · ')}
                {d.regles.length > 0 && t('exemples.regle', { regles: d.regles.map((r) => r.libelle).join(', ') })}
              </p>
              {e.commentaire && <p className="mt-1 italic">{e.commentaire}</p>}
            </li>
          );
        })}
        {!g.exemples.length && <li className="text-sm text-slate-600 dark:text-slate-400">{t('exemples.aucun')}</li>}
      </ul>
    </Section>
  );
}

function ListeChangements({ titre, liste, choisir }: { titre: string; liste: ChangementNote[]; choisir: (id: number) => void }) {
  if (!liste.length) return null;
  return (
    <div className="mt-2">
      <h4 className="text-sm font-semibold">{titre}</h4>
      <ul className="text-sm">
        {liste.map((c) => (
          <li key={c.id}>
            <button type="button" className="rounded px-1 text-left hover:underline" onClick={() => choisir(c.id)}>
              <span className="tabular-nums">
                {formaterNote(c.avant)} → {formaterNote(c.apres)}
              </span>{' '}
              {c.entreprise ? `${c.entreprise} — ` : ''}
              {c.titre}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Apercu({ impact, chargement, erreur, choisir }: { impact?: Impact; chargement: boolean; erreur: string | null; choisir: (id: number) => void }) {
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-blue-300 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
      <h3 className="font-bold">{t('apercu.titre')}</h3>
      {erreur ? (
        <p className="text-sm text-rose-800 dark:text-rose-200">{erreur}</p>
      ) : chargement && !impact ? (
        <p className="text-sm">{t('apercu.calcul')}</p>
      ) : impact ? (
        <>
          <p className="text-sm">
            {t('apercu.changees', { n: impact.changees, total: impact.offres_recalculees })}{' '}
            {t('apercu.montent', { n: impact.montent.length, seuil: virgule(impact.seuil_apres) })}, {t('apercu.descendent', { n: impact.descendent.length })}
            {impact.offres_recalculees === 0 && t('apercu.anciennes')}
          </p>
          <ListeChangements titre={t('apercu.listeMontent')} liste={impact.montent} choisir={choisir} />
          <ListeChangements titre={t('apercu.listeDescendent')} liste={impact.descendent} choisir={choisir} />
        </>
      ) : null}
    </div>
  );
}

function Historique({ actuelle, restaurer }: { actuelle: number | null; restaurer: (v: number) => void }) {
  const q = useQuery({ queryKey: ['grille-historique', actuelle], queryFn: api.historiqueGrille });
  return (
    <Section titre={t('historique.titre')}>
      <ol className="space-y-1 text-sm">
        {(q.data ?? []).map((v) => (
          <li key={v.version} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold tabular-nums">v{v.version}</span>
            <span className="tabular-nums text-slate-600 dark:text-slate-400">
              {formaterDate(v.le.slice(0, 10))} {v.le.slice(11, 16)}
            </span>
            <span className="rounded-full bg-slate-200 px-2 text-xs dark:bg-slate-700">{v.auteur}</span>
            <span className="min-w-0 flex-1 break-words">{v.resume}</span>
            {v.version === actuelle ? (
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t('historique.courante')}</span>
            ) : (
              <button
                type="button"
                className="bouton"
                onClick={() => {
                  if (window.confirm(t('historique.confirmer', { version: v.version }))) restaurer(v.version);
                }}
              >
                {t('historique.restaurer')}
              </button>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Reglages({ fermer, choisir, annoncer }: { fermer: () => void; choisir: (id: number) => void; annoncer: (m: string) => void }) {
  const client = useQueryClient();
  const titre = useId();
  const entete = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: ['grille'], queryFn: api.grille });
  const [brouillon, setBrouillon] = useState<Grille | null>(null);
  const [resume, setResume] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const reference = q.data?.grille ?? null;
  useEffect(() => {
    if (reference) setBrouillon(structuredClone(reference));
  }, [reference]);
  useEffect(() => {
    entete.current?.focus({ preventScroll: true });
    // En capture : Échap ferme les réglages sans fermer aussi le détail d'offre ouvert dessous.
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      fermer();
    };
    window.addEventListener('keydown', clavier, true);
    return () => window.removeEventListener('keydown', clavier, true);
  }, [fermer]);

  const maj = (f: (g: Grille) => void) =>
    setBrouillon((g) => {
      if (!g) return g;
      const copie = structuredClone(g);
      f(copie);
      return copie;
    });

  const modifie = useMemo(() => Boolean(brouillon && reference && JSON.stringify(brouillon) !== JSON.stringify(reference)), [brouillon, reference]);
  const validation = useMemo(() => {
    if (!brouillon) return { grille: null, erreur: null };
    try {
      return { grille: validerGrille(brouillon, 'réglages'), erreur: null };
    } catch (e) {
      return { grille: null, erreur: (e as Error).message };
    }
  }, [brouillon]);
  const differe = useDebounce(modifie ? validation.grille : null, 350);
  const apercu = useQuery({
    queryKey: ['grille-apercu', JSON.stringify(differe)],
    queryFn: () => api.apercuGrille(differe!),
    enabled: differe !== null,
    placeholderData: (p) => p,
  });

  const rafraichir = () => {
    client.invalidateQueries({ queryKey: ['grille'] });
    client.invalidateQueries({ queryKey: ['grille-historique'] });
    client.invalidateQueries({ queryKey: ['offres'] });
    client.invalidateQueries({ queryKey: ['offre'] });
  };
  const enregistrer = useMutation({
    mutationFn: () => api.enregistrerGrille(validation.grille!, resume),
    onSuccess: (r) => {
      setResume('');
      setMessage(t('reglages.enregistree', { version: r.version, n: r.impact.changees }));
      annoncer(t('reglages.annonce', { version: r.version }));
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const restaurer = useMutation({
    mutationFn: (v: number) => api.restaurerGrille(v),
    onSuccess: (r) => {
      setMessage(t('reglages.restauree', { version: r.version, resume: r.resume, n: r.impact.changees }));
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titre}
        className="flex h-full w-full max-w-4xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="min-w-0 flex-1">
            <h2 id={titre} ref={entete} tabIndex={-1} className="text-lg font-bold">
              {t('reglages.titre')}
            </h2>
            {q.data?.version && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('reglages.version', { nom: reference?.nom, version: q.data.version, date: formaterDate(q.data.le?.slice(0, 10) ?? null), auteur: q.data.auteur, resume: q.data.resume })}
              </p>
            )}
          </div>
          <button type="button" className="bouton" onClick={fermer} aria-label={t('reglages.fermer')}>
            <X className="size-4" aria-hidden="true" /> {t('theme.fermer')}
          </button>
        </div>
        {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
        {q.data && !q.data.grille && (
          <p className="p-4 text-sm">
            {t('reglages.pasDeGrille1')}<code>vigie-emploi grille --init</code>{t('reglages.pasDeGrille2')}
            <code>profil/grille.json</code>{t('reglages.pasDeGrille3')}
          </p>
        )}
        {brouillon && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t('reglages.explication')}
            </p>
            <Poids g={brouillon} maj={maj} />
            <Section titre={t('reglages.seuilTitre')} aide={t('reglages.seuilAide')}>
              <ChampNombre libelle={t('reglages.seuil')} valeur={brouillon.seuil} changer={(n) => n !== undefined && maj((x) => void (x.seuil = n))} />
            </Section>
            <Baremes g={brouillon} maj={maj} />
            <Regles g={brouillon} maj={maj} />
            <Inventaire g={brouillon} maj={maj} />
            <Exemples g={validation.grille ?? reference!} />
            <Historique actuelle={q.data?.version ?? null} restaurer={(v) => restaurer.mutate(v)} />
          </div>
        )}
        {brouillon && (
          <form
            className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              enregistrer.mutate();
            }}
          >
            {modifie && <Apercu impact={apercu.data} chargement={apercu.isFetching} erreur={validation.erreur ?? (apercu.error ? (apercu.error as Error).message : null)} choisir={choisir} />}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <label htmlFor="resume-grille" className="etiquette">
                  {t('reglages.resume')}
                </label>
                <input
                  id="resume-grille"
                  className="champ"
                  placeholder={t('reglages.resumeExemple')}
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  disabled={!modifie}
                />
              </div>
              <button type="submit" className="bouton-principal" disabled={!modifie || !validation.grille || !resume.trim() || enregistrer.isPending}>
                {t('reglages.enregistrer')}
              </button>
              <button type="button" className="bouton" disabled={!modifie} onClick={() => reference && setBrouillon(structuredClone(reference))}>
                {t('reglages.annuler')}
              </button>
            </div>
            {message && (
              <p role="status" className="text-sm text-slate-700 dark:text-slate-300">
                {message}
              </p>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}
