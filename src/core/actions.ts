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
import { noterEntree, type EntreeLot, type ResultatNotation } from './notation.ts';
import { STATUTS_A_TRAITER, type Statut } from './statuts.ts';
import { dateFr } from './texte.ts';

/** Statuts d'avant l'envoi : une candidature envoyée ou « candidater » les font avancer. */
export const STATUTS_AVANT_GO: Statut[] = ['nouvelle', 'a-lire', 'notee', 'ecartee'];

export function offreOuErreur(db: Base, id: number): Offre {
  const o = Number.isInteger(id) ? offreParId(db, id) : undefined;
  if (!o) throw new Error(`Offre ${id} introuvable`);
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
  description: string | null;
}

/** Offres à traiter (nouvelle, à lire) sans note, des plus anciennes aux plus récentes. */
export function offresALire(db: Base, o: { limite?: number; complet?: boolean } = {}): { total: number; offres: OffreALire[] } {
  const r = listerOffres(db, { statuts: STATUTS_A_TRAITER, sansNote: true, taille: o.limite ?? 500, tri: 'id', ordre: 'asc' });
  const offres = r.offres.map((l): OffreALire => {
    const d = offreParId(db, l.id)!;
    const lecture = d.description ? 'description' : l.source === 'glassdoor' ? 'humain' : 'navigateur';
    return {
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
      description: d.description ? (o.complet ? d.description : tronquer(d.description.replace(/\s+/g, ' '), 2500)) : null,
    };
  });
  return { total: r.total, offres };
}

/** Enregistre des notes au format des lots (dans une transaction : tout ou rien). */
export function noterOffres(db: Base, entrees: EntreeLot[], origine: string): ResultatNotation[] {
  if (!entrees.length) throw new Error('Aucune note à enregistrer');
  return transaction(db, () =>
    entrees.map((e) => {
      const r = noterEntree(db, e, { origine, origineOffre: 'manuel' });
      if (Array.isArray(e.tags) && e.tags.length) modifierTags(db, r.id, e.tags, []);
      return r;
    }),
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

/** Passe l'offre en « go » (si elle n'était pas plus avancée) et rassemble ce qu'il faut pour candidater. */
export function preparerCandidature(db: Base, dossierDonnees: string, id: number, origine: string): PreparationCandidature {
  const avant = offreOuErreur(db, id);
  if (STATUTS_AVANT_GO.includes(avant.statut)) ajouterStatut(db, id, 'go', { commentaire: 'candidater', origine });
  const d = detailOffre(db, id)!;
  const dossier = d.candidature?.dossier ?? `candidatures/${slug(`${d.entreprise ?? d.source} ${d.titre}`)}`;
  return {
    offre: d,
    dossier_donnees: dossierDonnees,
    dossier_suggere: dossier,
    etapes: [
      `Relire l'offre (${d.url_canonique ?? 'sans URL'}) et la note enregistrée`,
      'Appliquer les consignes de candidature du dossier de données (CLAUDE.md, AGENTS.md ou équivalent)',
      `Créer le dossier ${dossier} avec l'annonce, le fit, les écarts et les messages`,
      `Enregistrer la candidature (dossier, CV, canal, prochaine action) : enregistrer_candidature ou cap-emploi candidature ${id} --dossier ${dossier}`,
      `Après l'envoi : enregistrer la date d'envoi (envoyee_le), l'offre passe en « envoyee »`,
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
      const commentaire = [c.canal, `envoyée le ${envoi}`].filter(Boolean).join(', ');
      ajouterStatut(db, id, 'envoyee', { commentaire, origine });
      statutAjoute = 'envoyee';
    }
    return { offre: detailOffre(db, id)!, statut_ajoute: statutAjoute };
  });
}
