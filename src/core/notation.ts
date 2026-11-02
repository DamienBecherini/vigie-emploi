// Enregistrement d'une note au format des lots ({source, url, titre, …, note_brute, penalites, note, colle, ecarts, lu}).
import type { Base } from '../db/base.ts';
import { canoniser } from './liens.ts';
import { ajouterNote, ajouterStatut, enregistrerOffre, offreParId, type Origine } from './offres.ts';
import { STATUTS_A_TRAITER } from './statuts.ts';
import { dateFr, dateIso, empreinte, estVide } from './texte.ts';

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
}

export interface ResultatNotation {
  id: number;
  creee: boolean;
  note_ajoutee: boolean;
  note: number | null;
  statut: string;
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
  if (e.id !== undefined) {
    const o = offreParId(db, Number(e.id));
    if (!o) throw new Error(`Offre ${e.id} introuvable`);
    return { id: o.id, creee: false };
  }
  if (!e.url) throw new Error('Entrée sans "id" ni "url"');
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
    {
      url_canonique: ident?.url ?? e.url,
      titre: e.titre,
      entreprise: e.entreprise,
      lieu: e.lieu,
      contrat: e.contrat,
      remuneration: e.remuneration,
      teletravail: e.teletravail,
      publiee_le: datePubliee(e.publiee),
      stack: e.stack,
      description: e.description,
      recue_le: opts.recueLe ?? null,
    },
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
  opts: { origine?: string; origineOffre?: Origine; le?: string; siAbsent?: boolean; recueLe?: string | null } = {},
): ResultatNotation {
  const origine = opts.origine ?? 'cli';
  const cible = offreDeLEntree(db, e, opts.origineOffre ?? 'manuel', { recueLe: opts.recueLe })!;
  const noteAjoutee = ajouterNote(
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
  const offre = offreParId(db, cible.id)!;
  if ((STATUTS_A_TRAITER as string[]).includes(offre.statut)) {
    ajouterStatut(db, cible.id, 'notee', { origine, le: opts.le, siAbsent: opts.siAbsent });
  }
  const finale = offreParId(db, cible.id)!;
  return { id: cible.id, creee: cible.creee, note_ajoutee: noteAjoutee, note: finale.note, statut: finale.statut };
}

/** Normalise le contenu d'un fichier de lot : tableau, objet seul ou { offres: [...] }. */
export function entreesDuLot(json: unknown): EntreeLot[] {
  if (Array.isArray(json)) return json as EntreeLot[];
  if (json && typeof json === 'object') {
    const o = json as { offres?: unknown };
    if (Array.isArray(o.offres)) return o.offres as EntreeLot[];
    return [json as EntreeLot];
  }
  throw new Error('Lot illisible : tableau JSON attendu');
}
