// Panneau « Réglages de la note » : poids, barèmes, règles bloquantes, inventaire, seuil, exemples de référence,
// aperçu de l'impact avant d'enregistrer, historique des versions et restauration.
import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LIBELLES_NIVEAUX, NIVEAUX, noteExemple, validerGrille, type Grille, type Niveau } from '../../../src/core/grille.ts';
import { api, type ChangementNote, type Impact } from '../api.ts';
import { useDebounce } from '../etat.ts';
import { BadgeNote, formaterDate, formaterNote } from './Badges.tsx';

const virgule = (n: number, d = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: d });

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
    <Section titre="Poids des critères" aide="Les poids sont relatifs : leur somme est ramenée à 100 %. Les critères « calcul » sont notés par le barème, les autres par l'IA.">
      <ul className="space-y-2">
        {g.criteres.map((c, i) => {
          const pct = somme > 0 ? (c.poids / somme) * 100 : 0;
          return (
            <li key={c.id} className="grid grid-cols-[minmax(9rem,14rem)_1fr_3.5rem_3.5rem] items-center gap-2 text-sm">
              <label htmlFor={`poids-${c.id}`} title={c.description}>
                <span className="font-semibold">{c.libelle}</span>{' '}
                <span className="text-xs text-slate-600 dark:text-slate-400">({c.source === 'ia' ? 'IA' : 'calcul'})</span>
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
                aria-valuetext={`${c.poids}, soit ${Math.round(pct)} %`}
              />
              <span className="text-right tabular-nums">{c.poids}</span>
              <span className="text-right font-semibold tabular-nums">{Math.round(pct)} %</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        Total des poids : <strong className="tabular-nums">{somme}</strong>, normalisé à 100 %.
        {somme === 0 && <span className="ml-1 text-rose-700 dark:text-rose-300">Au moins un critère doit avoir un poids.</span>}
      </p>
    </Section>
  );
}

function Baremes({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const t = g.baremes.teletravail;
  const r = g.baremes.remuneration;
  const idRef = useId();
  return (
    <Section titre="Barèmes" aide="Sous-notes calculées par l'application. Inconnu = valeur neutre et un drapeau sur l'offre.">
      <h4 className="mb-1 text-sm font-semibold">Télétravail : sous-note selon les jours sur site par semaine</h4>
      <div className="flex flex-wrap gap-2">
        {t.jours_sur_site.map((v, j) => (
          <ChampNombre
            key={j}
            className="w-20"
            libelle={j === 0 ? '0 j (remote)' : `${j} j`}
            valeur={v}
            changer={(n) => n !== undefined && maj((x) => void (x.baremes.teletravail.jours_sur_site[j] = n))}
          />
        ))}
        <ChampNombre className="w-20" libelle="Inconnu" valeur={t.inconnu} changer={(n) => n !== undefined && maj((x) => void (x.baremes.teletravail.inconnu = n))} />
      </div>

      <h4 className="mt-4 mb-1 text-sm font-semibold">Rémunération : plancher = 5, cible haute = 10, sous le plancher = 0, linéaire entre</h4>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <label htmlFor={idRef} className="etiquette">
            Valeur retenue d'une fourchette
          </label>
          <select
            id={idRef}
            className="champ"
            value={r.reference}
            onChange={(e) => maj((x) => void (x.baremes.remuneration.reference = e.target.value as Grille['baremes']['remuneration']['reference']))}
          >
            <option value="milieu">Milieu</option>
            <option value="min">Bas de fourchette</option>
            <option value="max">Haut de fourchette</option>
          </select>
        </div>
        <ChampNombre className="w-24" libelle="Inconnue" valeur={r.inconnue} changer={(n) => n !== undefined && maj((x) => void (x.baremes.remuneration.inconnue = n))} />
      </div>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">Salaire (K€ brut annuel ; un salaire mensuel compte × 12)</legend>
        <div className="flex flex-wrap gap-2">
          {(['plancher', 'cible_basse', 'cible_haute'] as const).map((k) => (
            <ChampNombre
              key={k}
              libelle={{ plancher: 'Plancher', cible_basse: 'Cible basse', cible_haute: 'Cible haute' }[k]}
              valeur={r.salaire[k]}
              changer={(n) => n !== undefined && maj((x) => void (x.baremes.remuneration.salaire[k] = n))}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">TJM (€ par jour ; un taux horaire compte × 7)</legend>
        <div className="flex flex-wrap gap-2">
          {(['plancher', 'plancher_full_remote', 'cible_basse', 'cible_haute'] as const).map((k) => (
            <ChampNombre
              key={k}
              className={k === 'plancher_full_remote' ? 'w-36' : 'w-28'}
              libelle={{ plancher: 'Plancher', plancher_full_remote: 'Plancher full remote', cible_basse: 'Cible basse', cible_haute: 'Cible haute' }[k]}
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
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">La cible basse sert de repère (affichée à l'IA) ; le calcul va du plancher à la cible haute.</p>
    </Section>
  );
}

function Regles({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const [nouvelle, setNouvelle] = useState({ id: '', libelle: '' });
  return (
    <Section titre="Règles bloquantes" aide="L'IA signale les règles qui s'appliquent à une offre ; l'application met la note à 0 ou la plafonne. Une règle désactivée est ignorée (les offres concernées sont recalculées).">
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
              Active
            </label>
            <div className="min-w-52 flex-1">
              <label htmlFor={`regle-${r.id}`} className="etiquette">
                {r.id}
              </label>
              <input id={`regle-${r.id}`} className="champ" value={r.libelle} onChange={(e) => maj((x) => void (x.regles[i].libelle = e.target.value))} title={r.description} />
            </div>
            <div className="w-32">
              <label htmlFor={`effet-${r.id}`} className="etiquette">
                Effet
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
                <option value="zero">Note à 0</option>
                <option value="plafond">Plafond</option>
                <option value="plafond_critere">Plafond si critère faible</option>
              </select>
            </div>
            {r.effet === 'plafond_critere' && (
              <>
                <div className="w-40">
                  <label htmlFor={`critere-${r.id}`} className="etiquette">
                    Critère
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
                <ChampNombre className="w-24" libelle="Sous le seuil" valeur={r.seuil} changer={(n) => n !== undefined && maj((x) => void (x.regles[i].seuil = n))} />
              </>
            )}
            {r.effet === 'plafond' && (
              <ChampNombre className="w-24" libelle="Plafond" valeur={r.valeur} changer={(n) => n !== undefined && maj((x) => void (x.regles[i].valeur = n))} />
            )}
            <button type="button" className="bouton" onClick={() => maj((x) => void x.regles.splice(i, 1))} aria-label={`Supprimer la règle ${r.libelle}`}>
              Supprimer
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
            Identifiant
          </label>
          <input id="regle-nouvelle-id" className="champ" placeholder="ex. esn-regie" value={nouvelle.id} onChange={(e) => setNouvelle({ ...nouvelle, id: e.target.value })} />
        </div>
        <div className="min-w-52 flex-1">
          <label htmlFor="regle-nouvelle-libelle" className="etiquette">
            Libellé
          </label>
          <input id="regle-nouvelle-libelle" className="champ" value={nouvelle.libelle} onChange={(e) => setNouvelle({ ...nouvelle, libelle: e.target.value })} />
        </div>
        <button type="submit" className="bouton">
          Ajouter une règle
        </button>
      </form>
    </Section>
  );
}

function Inventaire({ g, maj }: { g: Grille; maj: (f: (g: Grille) => void) => void }) {
  const [filtre, setFiltre] = useState('');
  const [nouvelle, setNouvelle] = useState<{ techno: string; niveau: Niveau; precision: string }>({ techno: '', niveau: 'moyen', precision: '' });
  const f = filtre.trim().toLowerCase();
  const lignes = g.inventaire.map((t, i) => ({ t, i })).filter(({ t }) => !f || `${t.techno} ${t.precision ?? ''}`.toLowerCase().includes(f));
  const compte = (n: Niveau) => g.inventaire.filter((t) => t.niveau === n).length;
  return (
    <Section titre="Inventaire de compétences" aide="Sert à l'IA pour le critère technique. Fort / moyen / léger / zéro.">
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label htmlFor="inv-filtre" className="etiquette">
            Filtrer
          </label>
          <input id="inv-filtre" type="search" className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {NIVEAUX.map((n) => `${LIBELLES_NIVEAUX[n]} ${compte(n)}`).join(' · ')}
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <caption className="sr-only">Inventaire de compétences</caption>
          <thead className="sticky top-0 bg-slate-100 text-left dark:bg-slate-800">
            <tr>
              <th scope="col" className="px-2 py-1">
                Technologie
              </th>
              <th scope="col" className="px-2 py-1">
                Niveau
              </th>
              <th scope="col" className="px-2 py-1">
                Précision
              </th>
              <th scope="col" className="px-2 py-1">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ t, i }) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="px-2 py-1">
                  <input aria-label="Technologie" className="champ" value={t.techno} onChange={(e) => maj((x) => void (x.inventaire[i].techno = e.target.value))} />
                </td>
                <td className="px-2 py-1">
                  <select
                    aria-label={`Niveau de ${t.techno}`}
                    className="champ w-24"
                    value={t.niveau}
                    onChange={(e) => maj((x) => void (x.inventaire[i].niveau = e.target.value as Niveau))}
                  >
                    {NIVEAUX.map((n) => (
                      <option key={n} value={n}>
                        {LIBELLES_NIVEAUX[n]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    aria-label={`Précision pour ${t.techno}`}
                    className="champ"
                    value={t.precision ?? ''}
                    onChange={(e) =>
                      maj((x) => {
                        if (e.target.value) x.inventaire[i].precision = e.target.value;
                        else delete x.inventaire[i].precision;
                      })
                    }
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <button type="button" className="bouton" onClick={() => maj((x) => void x.inventaire.splice(i, 1))} aria-label={`Retirer ${t.techno}`}>
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
            Nouvelle technologie
          </label>
          <input id="inv-techno" className="champ" value={nouvelle.techno} onChange={(e) => setNouvelle({ ...nouvelle, techno: e.target.value })} />
        </div>
        <div className="w-28">
          <label htmlFor="inv-niveau" className="etiquette">
            Niveau
          </label>
          <select id="inv-niveau" className="champ" value={nouvelle.niveau} onChange={(e) => setNouvelle({ ...nouvelle, niveau: e.target.value as Niveau })}>
            {NIVEAUX.map((n) => (
              <option key={n} value={n}>
                {LIBELLES_NIVEAUX[n]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="inv-precision" className="etiquette">
            Précision
          </label>
          <input id="inv-precision" className="champ" value={nouvelle.precision} onChange={(e) => setNouvelle({ ...nouvelle, precision: e.target.value })} />
        </div>
        <button type="submit" className="bouton">
          Ajouter
        </button>
      </form>
    </Section>
  );
}

function Exemples({ g }: { g: Grille }) {
  return (
    <Section titre="Exemples de référence" aide="Servis à l'IA avec la grille pour caler ses sous-notes. Leur note est recalculée avec les réglages en cours (lecture seule : modifier le fichier grille.json).">
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
                {d.regles.length > 0 && ` · règle : ${d.regles.map((r) => r.libelle).join(', ')}`}
              </p>
              {e.commentaire && <p className="mt-1 italic">{e.commentaire}</p>}
            </li>
          );
        })}
        {!g.exemples.length && <li className="text-sm text-slate-600 dark:text-slate-400">Aucun exemple dans la grille.</li>}
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
      <h3 className="font-bold">Aperçu avant d'enregistrer</h3>
      {erreur ? (
        <p className="text-sm text-rose-800 dark:text-rose-200">{erreur}</p>
      ) : chargement && !impact ? (
        <p className="text-sm">Calcul…</p>
      ) : impact ? (
        <>
          <p className="text-sm">
            <strong>{impact.changees}</strong> offre{impact.changees > 1 ? 's' : ''} sur {impact.offres_recalculees} notée{impact.offres_recalculees > 1 ? 's' : ''} avec
            sous-notes change{impact.changees > 1 ? 'nt' : ''} de note ; {impact.montent.length} passe{impact.montent.length > 1 ? 'nt' : ''} au-dessus du seuil (
            {virgule(impact.seuil_apres)}), {impact.descendent.length} en dessous.
            {impact.offres_recalculees === 0 && ' Les anciennes notes globales ne sont pas recalculées.'}
          </p>
          <ListeChangements titre="Passent au-dessus du seuil" liste={impact.montent} choisir={choisir} />
          <ListeChangements titre="Repassent sous le seuil" liste={impact.descendent} choisir={choisir} />
        </>
      ) : null}
    </div>
  );
}

function Historique({ actuelle, restaurer }: { actuelle: number | null; restaurer: (v: number) => void }) {
  const q = useQuery({ queryKey: ['grille-historique', actuelle], queryFn: api.historiqueGrille });
  return (
    <Section titre="Historique des versions">
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
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">courante</span>
            ) : (
              <button
                type="button"
                className="bouton"
                onClick={() => {
                  if (window.confirm(`Revenir à la version ${v.version} ? Une nouvelle version sera créée et les notes recalculées.`)) restaurer(v.version);
                }}
              >
                Restaurer
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
      setMessage(`Version ${r.version} enregistrée : ${r.impact.changees} note(s) recalculée(s) changent.`);
      annoncer(`Grille v${r.version} enregistrée`);
      rafraichir();
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const restaurer = useMutation({
    mutationFn: (v: number) => api.restaurerGrille(v),
    onSuccess: (r) => {
      setMessage(`Version ${r.version} créée (${r.resume}) : ${r.impact.changees} note(s) changent.`);
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
              Réglages de la note
            </h2>
            {q.data?.version && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {reference?.nom} · version {q.data.version} du {formaterDate(q.data.le?.slice(0, 10) ?? null)} ({q.data.auteur}) : {q.data.resume}
              </p>
            )}
          </div>
          <button type="button" className="bouton" onClick={fermer} aria-label="Fermer les réglages (Échap)">
            <X className="size-4" aria-hidden="true" /> Fermer
          </button>
        </div>
        {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
        {q.data && !q.data.grille && (
          <p className="p-4 text-sm">
            Pas encore de grille de notation. La créer avec <code>postuler-juste grille --init</code> (copie de l'exemple dans{' '}
            <code>profil/grille.json</code> du dossier de données), puis rouvrir ce panneau.
          </p>
        )}
        {brouillon && (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              La note finale est calculée par l'application : moyenne pondérée des sous-notes, puis règles bloquantes, puis arrondi au demi-point. Changer un réglage
              recalcule toutes les notes qui ont des sous-notes ; les anciennes notes globales restent figées.
            </p>
            <Poids g={brouillon} maj={maj} />
            <Section titre="Seuil « à regarder »" aide="Utilisé par la vue rapide « Notées ≥ … » du tableau.">
              <ChampNombre libelle="Seuil" valeur={brouillon.seuil} changer={(n) => n !== undefined && maj((x) => void (x.seuil = n))} />
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
                  Résumé du changement
                </label>
                <input
                  id="resume-grille"
                  className="champ"
                  placeholder="ex. Télétravail plus important"
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  disabled={!modifie}
                />
              </div>
              <button type="submit" className="bouton-principal" disabled={!modifie || !validation.grille || !resume.trim() || enregistrer.isPending}>
                Enregistrer la version
              </button>
              <button type="button" className="bouton" disabled={!modifie} onClick={() => reference && setBrouillon(structuredClone(reference))}>
                Annuler les changements
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
