// Opérations de haut niveau partagées par la CLI, l'API du tableau de bord et le serveur MCP.
// Chaque fonction valide ses entrées et lève une Error au message lisible par l'utilisateur.
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { listerOffres } from './requetes.ts';
import {
  ajouterStatut,
  detailOffre,
  enregistrerCandidature,
  modifierTags,
  offreParId,
  type ChampsCandidature,
  type DetailOffre,
  type Offre,
} from './offres.ts';
import { estNoteACriteres, noterEntree, type EntreeLot, type ResultatNotation } from './notation.ts';
import { notesOffre } from './offres.ts';
import type { VersionGrille } from './grille-stockage.ts';
import type { Entrees } from './grille.ts';
import { STATUTS_A_TRAITER, type Statut } from './statuts.ts';
import { dateFr } from './texte.ts';
import { t } from '../i18n/index.ts';

/** Statuts d'avant l'envoi : une candidature envoyée ou « candidater » les font avancer. */
export const STATUTS_AVANT_GO: Statut[] = ['nouvelle', 'a-lire', 'notee', 'ecartee'];

export function offreOuErreur(db: Base, id: number): Offre {
  const o = Number.isInteger(id) ? offreParId(db, id) : undefined;
  if (!o) throw new Error(t('core.offreIntrouvable', { id }));
  return o;
}

function tronquer(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface OffreALire {
  id: number;
  source: string;
  url: string | null;
  titre: string;
  entreprise: string | null;
  lieu: string | null;
  contrat: string | null;
  remuneration: string | null;
  teletravail: string | null;
  recue_le: string | null;
  /** description : texte déjà en base ; navigateur : ouvrir l'URL ; humain : page protégée, demander le texte. */
  lecture: 'description' | 'navigateur' | 'humain';
  /** Longueur de la description en base (0 si aucune). */
  longueur_description: number;
  /** Absente en mode résumé (descriptions: false). */
  description?: string | null;
}

export interface OptionsALire {
  /** Offres par page (500 par défaut). */
  limite?: number;
  /** Page (1 par défaut). */
  page?: number;
  /** false : résumé sans description (lire ensuite chaque offre avec son id). true par défaut. */
  descriptions?: boolean;
  /** Descriptions entières (sinon tronquées à `longueur`). */
  complet?: boolean;
  /** Longueur maximale d'une description tronquée (2 500 par défaut). */
  longueur?: number;
}

export interface ResultatALire {
  total: number;
  page: number;
  pages: number;
  /** Offres à lire après cette page. */
  restantes: number;
  offres: OffreALire[];
}

/** Offres à traiter (nouvelle, à lire) sans note, des plus anciennes aux plus récentes, par pages. */
export function offresALire(db: Base, o: OptionsALire = {}): ResultatALire {
  const r = listerOffres(db, { statuts: STATUTS_A_TRAITER, sansNote: true, taille: o.limite ?? 500, page: o.page, tri: 'id', ordre: 'asc' });
  const avecDescriptions = o.descriptions !== false;
  const offres = r.offres.map((l): OffreALire => {
    const d = offreParId(db, l.id)!;
    const lecture = d.description ? 'description' : l.source === 'glassdoor' ? 'humain' : 'navigateur';
    const base: OffreALire = {
      id: l.id,
      source: l.source,
      url: l.url_canonique,
      titre: l.titre,
      entreprise: l.entreprise,
      lieu: l.lieu,
      contrat: l.contrat,
      remuneration: l.remuneration,
      teletravail: l.teletravail,
      recue_le: l.recue_le,
      lecture,
      longueur_description: d.description?.length ?? 0,
    };
    if (!avecDescriptions) return base;
    const texte = d.description ? (o.complet ? d.description : tronquer(d.description.replace(/\s+/g, ' '), o.longueur ?? 2500)) : null;
    return { ...base, description: texte };
  });
  return { total: r.total, page: r.page, pages: r.pages, restantes: Math.max(0, r.total - (r.page - 1) * r.taille - offres.length), offres };
}

export interface OptionsNoter {
  /** Charge la grille courante (appelé seulement si une entrée a des critères). */
  grille?: () => VersionGrille | null;
  /** Essai : calcule et renvoie les notes sans rien enregistrer. */
  essai?: boolean;
}

/** Enregistre des notes au format des lots (dans une transaction : tout ou rien). */
export function noterOffres(db: Base, entrees: EntreeLot[], origine: string, o: OptionsNoter = {}): ResultatNotation[] {
  if (!entrees.length) throw new Error(t('core.aucuneNote'));
  const grille = entrees.some(estNoteACriteres) ? (o.grille?.() ?? null) : null;
  const noter = () =>
    entrees.map((e) => {
      const r = noterEntree(db, e, { origine, origineOffre: 'manuel', grille });
      if (Array.isArray(e.tags) && e.tags.length) modifierTags(db, r.id, e.tags, []);
      return r;
    });
  if (!o.essai) return transaction(db, noter);
  db.exec('BEGIN IMMEDIATE');
  try {
    return noter();
  } finally {
    db.exec('ROLLBACK');
  }
}

export interface SaisieSousNotes {
  /** Sous-notes modifiées (critères notés par l'IA) ; null retire la sous-note (valeur neutre). */
  criteres?: Record<string, { note: number | string; justification?: string | null } | null>;
  /** Données d'entrée des critères calculés ; null efface une valeur (retour à la déduction depuis l'offre). */
  entrees?: { [K in keyof Entrees]?: Entrees[K] | null };
  bloquants?: string[];
}

/**
 * Correction des sous-notes depuis l'interface : part de la dernière note (sous-notes, entrées, règles,
 * « colle », « ecarts »), applique les changements et ajoute une note à l'historique (origine interface).
 * Sur une note globale de l'ancienne grille, les critères non saisis valent la valeur neutre.
 */
export function modifierSousNotes(db: Base, id: number, s: SaisieSousNotes, origine: string, grille: VersionGrille): ResultatNotation {
  offreOuErreur(db, id);
  const derniere = notesOffre(db, id)[0];
  const base = derniere?.saisie ?? { criteres: {}, entrees: undefined, bloquants: [] };
  const criteres: NonNullable<EntreeLot['criteres']> = {};
  for (const [k, v] of Object.entries(base.criteres)) criteres[k] = { note: v.note, justification: v.justification, origine: v.origine ?? 'ia' };
  for (const [k, v] of Object.entries(s.criteres ?? {})) {
    if (v === null) delete criteres[k];
    else criteres[k] = { note: v.note, justification: v.justification ?? undefined, origine: 'interface' };
  }
  const entrees: Record<string, unknown> = { ...(base.entrees ?? {}) };
  for (const [k, v] of Object.entries(s.entrees ?? {})) {
    if (v === null || v === undefined) delete entrees[k];
    else entrees[k] = v;
  }
  return transaction(db, () =>
    noterEntree(
      db,
      {
        id,
        criteres,
        entrees: entrees as Entrees,
        bloquants: s.bloquants ?? base.bloquants,
        colle: derniere?.colle ?? undefined,
        ecarts: derniere?.ecarts ?? undefined,
        lu: derniere?.lu ?? true,
      },
      { origine, grille },
    ),
  );
}

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(h\/f|f\/h|h-f|f-h)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

export interface PreparationCandidature {
  offre: DetailOffre;
  dossier_donnees: string;
  dossier_suggere: string;
  etapes: string[];
}

/** Statuts de fin : « candidater » les rouvre (l'utilisateur reprend l'offre). */
const STATUTS_ROUVRABLES: Statut[] = ['abandonnee', 'refus', 'close'];

/**
 * Passe l'offre en « go » et rassemble ce qu'il faut pour candidater. Une candidature en cours
 * (go, envoyee, relancee, entretien) garde son statut ; une offre abandonnée, refusée ou close est rouverte.
 */
export function preparerCandidature(db: Base, dossierDonnees: string, id: number, origine: string): PreparationCandidature {
  const avant = offreOuErreur(db, id);
  if (STATUTS_AVANT_GO.includes(avant.statut)) ajouterStatut(db, id, 'go', { commentaire: 'candidater', origine });
  else if (STATUTS_ROUVRABLES.includes(avant.statut)) ajouterStatut(db, id, 'go', { commentaire: t('core.reprise', { statut: avant.statut }), origine });
  const d = detailOffre(db, id)!;
  const dossier = d.candidature?.dossier ?? `candidatures/${slug(`${d.entreprise ?? d.source} ${d.titre}`)}`;
  return {
    offre: d,
    dossier_donnees: dossierDonnees,
    dossier_suggere: dossier,
    etapes: [
      t('core.etape.relire', { url: d.url_canonique ?? t('core.sansUrl') }),
      t('core.etape.consignes'),
      t('core.etape.dossier', { dossier }),
      t('core.etape.enregistrer', { id, dossier }),
      t('core.etape.envoi'),
    ],
  };
}

/**
 * Met à jour la candidature d'une offre. Avec une date d'envoi, une offre pas encore envoyée passe
 * en « envoyee » (commentaire : canal et date).
 */
export function suivreCandidature(
  db: Base,
  id: number,
  champs: ChampsCandidature,
  origine: string,
): { offre: DetailOffre; statut_ajoute: Statut | null } {
  const o = offreOuErreur(db, id);
  const envoi = champs.envoyee_le?.trim();
  // « 02/11/2026 » est rangé en 2026-11-02 ; un texte libre (« ≈ 25/08/2026 ») est gardé tel quel.
  const champsNorm: ChampsCandidature = {
    ...champs,
    envoyee_le: envoi && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(envoi) ? dateFr(envoi) : champs.envoyee_le,
  };
  return transaction(db, () => {
    const c = enregistrerCandidature(db, id, champsNorm, { origine });
    let statutAjoute: Statut | null = null;
    if (envoi && [...STATUTS_AVANT_GO, 'go'].includes(o.statut)) {
      const commentaire = [c.canal, t('core.envoyeeLe', { date: envoi })].filter(Boolean).join(', ');
      ajouterStatut(db, id, 'envoyee', { commentaire, origine });
      statutAjoute = 'envoyee';
    }
    return { offre: detailOffre(db, id)!, statut_ajoute: statutAjoute };
  });
}
