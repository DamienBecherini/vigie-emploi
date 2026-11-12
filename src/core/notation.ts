// Enregistrement d'une note au format des lots ({source, url, titre, …, note_brute, penalites, note, colle, ecarts, lu}).
// Avec « criteres » (et / ou « entrees », « bloquants »), la note est calculée avec la grille de notation :
// le champ « note » éventuellement fourni est alors ignoré (signalé dans « avertissements »).
import type { Base } from '../db/base.ts';
import { canoniser } from './liens.ts';
import { ajouterNote, ajouterStatut, enregistrerOffre, offreParId, type Origine } from './offres.ts';
import { STATUTS_A_TRAITER } from './statuts.ts';
import { dateFr, dateIso, empreinte, estVide } from './texte.ts';
import { calculerNote, resumeRegles, verifierSaisie, type Decomposition, type Entrees } from './grille.ts';
import type { VersionGrille } from './grille-stockage.ts';
import { decimal, t } from '../i18n/index.ts';

export interface EntreeLot {
  id?: number;
  source?: string;
  url?: string;
  titre?: string;
  entreprise?: string;
  lieu?: string;
  contrat?: string;
  remuneration?: string;
  teletravail?: string;
  publiee?: string;
  stack?: string;
  description?: string;
  note_brute?: number | string | null;
  penalites?: string;
  note?: number | string | null;
  colle?: string;
  ecarts?: string;
  lu?: boolean;
  grille_version?: string;
  tags?: string[];
  /** Sous-notes des critères notés par l'IA : { technique: { note: 8, justification: "…" }, … }. */
  criteres?: Record<string, { note: number | string; justification?: string; origine?: 'ia' | 'interface' }>;
  /** Données d'entrée des critères calculés (jours sur site, salaire), quand l'offre les donne. */
  entrees?: Entrees;
  /** Identifiants des règles bloquantes qui s'appliquent (stage, defense…). */
  bloquants?: string[];
}

/** L'entrée est une note à critères (nouvelle grille) plutôt qu'une note globale. */
export function estNoteACriteres(e: EntreeLot): boolean {
  return e.criteres !== undefined || e.entrees !== undefined || e.bloquants !== undefined;
}

export interface ResultatNotation {
  id: number;
  creee: boolean;
  note_ajoutee: boolean;
  note: number | null;
  statut: string;
  /** Note à critères : version de la grille, valeur exacte, décomposition. */
  grille_version?: number;
  note_exacte?: number;
  decomposition?: Decomposition;
  /** Champs ignorés, critères manquants… */
  avertissements?: string[];
}

function datePubliee(v: string | undefined): string | null {
  if (!v || estVide(v)) return null;
  return dateFr(v) ?? dateIso(v);
}

/** Retrouve (ou crée) l'offre d'une entrée de lot : par id, sinon par URL canonique. */
export function offreDeLEntree(
  db: Base,
  e: EntreeLot,
  origine: Origine,
  opts: { creer?: boolean; recueLe?: string | null } = {},
): { id: number; creee: boolean } | null {
  // Champs de l'entrée : ils complètent ceux qui manquent en base (jamais d'écrasement), que l'offre soit
  // désignée par son id ou par son URL.
  const champs = {
    titre: e.titre,
    entreprise: e.entreprise,
    lieu: e.lieu,
    contrat: e.contrat,
    remuneration: e.remuneration,
    teletravail: e.teletravail,
    publiee_le: datePubliee(e.publiee),
    stack: e.stack,
    description: e.description,
  };
  if (e.id !== undefined) {
    const o = offreParId(db, Number(e.id));
    if (!o) throw new Error(t('core.offreIntrouvable', { id: e.id }));
    enregistrerOffre(db, o.source, o.id_site, champs, origine);
    return { id: o.id, creee: false };
  }
  if (!e.url) throw new Error(t('core.entreeSansId'));
  const ident = canoniser(e.url);
  const source = ident?.source ?? (e.source || 'manuel');
  const idSite = ident?.idSite ?? `url-${empreinte(e.url)}`;
  const existante = db.prepare('SELECT id FROM offres WHERE source = ? AND id_site = ?').get(source, idSite) as
    | { id: number }
    | undefined;
  if (!existante && opts.creer === false) return null;
  const { offre, creee } = enregistrerOffre(
    db,
    source,
    idSite,
    { ...champs, url_canonique: ident?.url ?? e.url, recue_le: opts.recueLe ?? null },
    origine,
  );
  return { id: offre.id, creee };
}

/**
 * Note une offre : complète ses champs vides, ajoute la note (historique) et passe l'offre en « notee »
 * si elle était encore à traiter.
 */
export function noterEntree(
  db: Base,
  e: EntreeLot,
  opts: {
    origine?: string;
    origineOffre?: Origine;
    le?: string;
    siAbsent?: boolean;
    recueLe?: string | null;
    /** Grille courante, obligatoire pour une note à critères. */
    grille?: VersionGrille | null;
  } = {},
): ResultatNotation {
  const origine = opts.origine ?? 'cli';
  const aCriteres = estNoteACriteres(e);
  const grille = opts.grille ?? null;
  if (aCriteres && !grille) {
    throw new Error(t('core.sansGrille'));
  }
  const saisie = aCriteres ? verifierSaisie(grille!.grille, { criteres: e.criteres, entrees: e.entrees, bloquants: e.bloquants }) : null;
  const cible = offreDeLEntree(db, e, opts.origineOffre ?? 'manuel', { recueLe: opts.recueLe })!;
  let decomposition: Decomposition | undefined;
  const avertissements: string[] = [];
  let noteAjoutee: boolean;
  if (saisie && grille) {
    if (origine === 'interface') for (const c of Object.values(saisie.criteres)) c.origine ??= 'interface';
    decomposition = calculerNote(grille.grille, saisie, offreParId(db, cible.id)!, grille.version);
    if (e.note !== undefined && e.note !== null && e.note !== '') {
      avertissements.push(t('core.noteIgnoree', { note: String(e.note), version: grille.version, calculee: decimal(decomposition.note) }));
    }
    if (e.note_brute !== undefined && e.note_brute !== null) avertissements.push(t('core.noteBruteIgnoree'));
    if (e.penalites) avertissements.push(t('core.penalitesIgnorees'));
    for (const d of decomposition.drapeaux) if (d.code.startsWith('critere_manquant')) avertissements.push(d.message);
    noteAjoutee = ajouterNote(
      db,
      cible.id,
      {
        note: decomposition.note,
        note_exacte: decomposition.note_exacte,
        note_brute: decomposition.moyenne,
        penalites: resumeRegles(decomposition),
        colle: e.colle,
        ecarts: e.ecarts,
        lu: e.lu ?? false,
        grille_version: String(grille.version),
        saisie,
        decomposition,
      },
      { origine, le: opts.le, siAbsent: opts.siAbsent },
    );
  } else {
    noteAjoutee = ajouterNote(
      db,
      cible.id,
      {
        note_brute: e.note_brute === undefined || e.note_brute === null ? null : Number(String(e.note_brute).replace(',', '.')),
        penalites: e.penalites,
        note: e.note === undefined || e.note === null ? null : Number(String(e.note).replace(',', '.')),
        colle: e.colle,
        ecarts: e.ecarts,
        lu: e.lu ?? false,
        grille_version: e.grille_version,
      },
      { origine, le: opts.le, siAbsent: opts.siAbsent },
    );
  }
  const offre = offreParId(db, cible.id)!;
  if ((STATUTS_A_TRAITER as string[]).includes(offre.statut)) {
    ajouterStatut(db, cible.id, 'notee', { origine, le: opts.le, siAbsent: opts.siAbsent });
  }
  const finale = offreParId(db, cible.id)!;
  const r: ResultatNotation = { id: cible.id, creee: cible.creee, note_ajoutee: noteAjoutee, note: finale.note, statut: finale.statut };
  if (decomposition) {
    r.grille_version = grille!.version;
    r.note_exacte = decomposition.note_exacte;
    r.decomposition = decomposition;
  }
  if (avertissements.length) r.avertissements = avertissements;
  return r;
}

/** Normalise le contenu d'un fichier de lot : tableau, objet seul ou { offres: [...] }. */
export function entreesDuLot(json: unknown): EntreeLot[] {
  if (Array.isArray(json)) return json as EntreeLot[];
  if (json && typeof json === 'object') {
    const o = json as { offres?: unknown };
    if (Array.isArray(o.offres)) return o.offres as EntreeLot[];
    return [json as EntreeLot];
  }
  throw new Error(t('core.lotIllisible'));
}
