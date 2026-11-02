// Opérations sur les offres : création / complément, statuts, notes, tags, candidatures, détail.
import type { Base } from '../db/base.ts';
import { estStatut, type Statut } from './statuts.ts';
import { lireRemuneration, maintenant, nettoyer } from './texte.ts';

export type Origine = 'email' | 'import-lot' | 'import-registre' | 'import-suivi' | 'manuel';

export interface ChampsOffre {
  titre?: string | null;
  entreprise?: string | null;
  lieu?: string | null;
  contrat?: string | null;
  remuneration?: string | null;
  teletravail?: string | null;
  publiee_le?: string | null;
  recue_le?: string | null;
  description?: string | null;
  stack?: string | null;
  url_canonique?: string | null;
}

export interface Offre {
  id: number;
  source: string;
  id_site: string;
  url_canonique: string | null;
  titre: string;
  entreprise: string | null;
  lieu: string | null;
  contrat: string | null;
  remuneration: string | null;
  remuneration_min: number | null;
  remuneration_max: number | null;
  remuneration_unite: string | null;
  teletravail: string | null;
  publiee_le: string | null;
  recue_le: string | null;
  description: string | null;
  stack: string | null;
  origine: Origine;
  statut: Statut;
  note: number | null;
  cree_le: string;
  maj_le: string;
}

export interface Note {
  id: number;
  offre_id: number;
  note_brute: number | null;
  penalites: string | null;
  note: number | null;
  colle: string | null;
  ecarts: string | null;
  lu: boolean;
  grille_version: string | null;
  origine: string;
  notee_le: string;
}

export interface LigneStatut {
  id: number;
  offre_id: number;
  statut: Statut;
  commentaire: string | null;
  origine: string;
  le: string;
}

export interface Candidature {
  id: number;
  offre_id: number;
  dossier: string | null;
  cv: string | null;
  envoyee_le: string | null;
  canal: string | null;
  message: string | null;
}

export interface DetailOffre extends Offre {
  tags: string[];
  notes: Note[];
  statuts: LigneStatut[];
  candidature: Candidature | null;
}

const CHAMPS: (keyof ChampsOffre)[] = [
  'titre',
  'entreprise',
  'lieu',
  'contrat',
  'remuneration',
  'teletravail',
  'publiee_le',
  'recue_le',
  'description',
  'stack',
  'url_canonique',
];

export function trouverOffre(db: Base, source: string, idSite: string): Offre | undefined {
  return db.prepare('SELECT * FROM offres WHERE source = ? AND id_site = ?').get(source, idSite) as Offre | undefined;
}

export function offreParId(db: Base, id: number): Offre | undefined {
  return db.prepare('SELECT * FROM offres WHERE id = ?').get(id) as Offre | undefined;
}

export function offreParUrl(db: Base, url: string): Offre | undefined {
  return db.prepare('SELECT * FROM offres WHERE url_canonique = ?').get(url) as Offre | undefined;
}

function valeursNettoyees(champs: ChampsOffre): Partial<Record<keyof ChampsOffre, string>> {
  const r: Partial<Record<keyof ChampsOffre, string>> = {};
  for (const k of CHAMPS) {
    const v = nettoyer(champs[k]);
    if (v !== null) r[k] = v;
  }
  return r;
}

/**
 * Crée l'offre (source, id_site) si elle n'existe pas ; sinon complète les champs vides
 * (ou les remplace tous si `ecraser`). Retourne l'offre et si elle vient d'être créée.
 */
export function enregistrerOffre(
  db: Base,
  source: string,
  idSite: string,
  champs: ChampsOffre,
  origine: Origine,
  opts: { ecraser?: boolean; le?: string } = {},
): { offre: Offre; creee: boolean } {
  const v = valeursNettoyees(champs);
  const existante = trouverOffre(db, source, idSite);
  const le = opts.le ?? maintenant();
  if (!existante) {
    const r = lireRemuneration(v.remuneration);
    const info = db
      .prepare(
        `INSERT INTO offres (source, id_site, url_canonique, titre, entreprise, lieu, contrat, remuneration,
           remuneration_min, remuneration_max, remuneration_unite, teletravail, publiee_le, recue_le, description,
           stack, origine, statut, cree_le, maj_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nouvelle', ?, ?)`,
      )
      .run(
        source,
        idSite,
        v.url_canonique ?? null,
        v.titre ?? '',
        v.entreprise ?? null,
        v.lieu ?? null,
        v.contrat ?? null,
        v.remuneration ?? null,
        r.min,
        r.max,
        r.unite,
        v.teletravail ?? null,
        v.publiee_le ?? null,
        v.recue_le ?? null,
        v.description ?? null,
        v.stack ?? null,
        origine,
        le,
        le,
      );
    return { offre: offreParId(db, Number(info.lastInsertRowid))!, creee: true };
  }
  const maj: string[] = [];
  const params: (string | number | null)[] = [];
  for (const k of CHAMPS) {
    const nv = v[k];
    if (nv === undefined) continue;
    const actuelle = existante[k as keyof Offre] as string | null;
    if (actuelle === nv) continue;
    if (!opts.ecraser && actuelle !== null && actuelle !== '') continue;
    maj.push(`${k} = ?`);
    params.push(nv);
    if (k === 'remuneration') {
      const r = lireRemuneration(nv);
      maj.push('remuneration_min = ?', 'remuneration_max = ?', 'remuneration_unite = ?');
      params.push(r.min, r.max, r.unite);
    }
  }
  if (maj.length) {
    db.prepare(`UPDATE offres SET ${maj.join(', ')}, maj_le = ? WHERE id = ?`).run(...params, maintenant(), existante.id);
  }
  return { offre: offreParId(db, existante.id)!, creee: false };
}

/** Recalcule les colonnes dénormalisées statut / note à partir de l'historique (la dernière fait foi). */
export function recalculer(db: Base, offreId: number): void {
  db.prepare(
    `UPDATE offres SET
       statut = COALESCE((SELECT statut FROM statuts WHERE offre_id = offres.id ORDER BY le DESC, id DESC LIMIT 1), 'nouvelle'),
       note = (SELECT note FROM notes WHERE offre_id = offres.id ORDER BY notee_le DESC, id DESC LIMIT 1),
       maj_le = ?
     WHERE id = ?`,
  ).run(maintenant(), offreId);
}

export interface OptionsStatut {
  commentaire?: string | null;
  origine?: string;
  le?: string;
  /** Ne rien ajouter si une ligne identique (statut, commentaire, origine) existe déjà : imports idempotents. */
  siAbsent?: boolean;
}

export function ajouterStatut(db: Base, offreId: number, statut: string, opts: OptionsStatut = {}): boolean {
  if (!estStatut(statut)) throw new Error(`Statut inconnu : ${statut}`);
  const commentaire = nettoyer(opts.commentaire) ?? null;
  const origine = opts.origine ?? 'cli';
  if (opts.siAbsent) {
    const deja = db
      .prepare('SELECT 1 FROM statuts WHERE offre_id = ? AND statut = ? AND origine = ? AND COALESCE(commentaire, \'\') = ?')
      .get(offreId, statut, origine, commentaire ?? '');
    if (deja) return false;
  }
  db.prepare('INSERT INTO statuts (offre_id, statut, commentaire, origine, le) VALUES (?, ?, ?, ?, ?)').run(
    offreId,
    statut,
    commentaire,
    origine,
    opts.le ?? maintenant(),
  );
  recalculer(db, offreId);
  return true;
}

export interface EntreeNote {
  note_brute?: number | null;
  penalites?: string | null;
  note?: number | null;
  colle?: string | null;
  ecarts?: string | null;
  lu?: boolean | null;
  grille_version?: string | null;
}

function nombreOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Note invalide : ${String(v)}`);
  if (n < 0 || n > 10) throw new Error(`Note hors de l'échelle 0-10 : ${n}`);
  return n;
}

export function ajouterNote(
  db: Base,
  offreId: number,
  e: EntreeNote,
  opts: { origine?: string; le?: string; siAbsent?: boolean } = {},
): boolean {
  const note = nombreOuNull(e.note);
  const brute = nombreOuNull(e.note_brute);
  const origine = opts.origine ?? 'cli';
  const le = opts.le ?? maintenant();
  if (opts.siAbsent) {
    const deja = db
      .prepare('SELECT 1 FROM notes WHERE offre_id = ? AND origine = ? AND notee_le = ? AND note IS ?')
      .get(offreId, origine, le, note);
    if (deja) return false;
  }
  db.prepare(
    `INSERT INTO notes (offre_id, note_brute, penalites, note, colle, ecarts, lu, grille_version, origine, notee_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    offreId,
    brute,
    nettoyer(e.penalites),
    note,
    nettoyer(e.colle),
    nettoyer(e.ecarts),
    e.lu ? 1 : 0,
    nettoyer(e.grille_version),
    origine,
    le,
  );
  recalculer(db, offreId);
  return true;
}

export function tagsOffre(db: Base, offreId: number): string[] {
  return (
    db
      .prepare('SELECT t.nom FROM offre_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offre_id = ? ORDER BY t.nom')
      .all(offreId) as { nom: string }[]
  ).map((r) => r.nom);
}

export function normaliserTag(nom: string): string {
  return nom.trim().replace(/\s+/g, '-').toLowerCase();
}

/** Ajoute et retire des tags ; retourne la liste à jour. */
export function modifierTags(db: Base, offreId: number, ajouts: string[], retraits: string[]): string[] {
  for (const brut of ajouts) {
    const nom = normaliserTag(brut);
    if (!nom) continue;
    db.prepare('INSERT OR IGNORE INTO tags (nom) VALUES (?)').run(nom);
    const tag = db.prepare('SELECT id FROM tags WHERE nom = ?').get(nom) as { id: number };
    db.prepare('INSERT OR IGNORE INTO offre_tags (offre_id, tag_id) VALUES (?, ?)').run(offreId, tag.id);
  }
  for (const brut of retraits) {
    db.prepare('DELETE FROM offre_tags WHERE offre_id = ? AND tag_id = (SELECT id FROM tags WHERE nom = ?)').run(
      offreId,
      normaliserTag(brut),
    );
  }
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM offre_tags)').run();
  db.prepare('UPDATE offres SET maj_le = ? WHERE id = ?').run(maintenant(), offreId);
  return tagsOffre(db, offreId);
}

export function enregistrerCandidature(
  db: Base,
  offreId: number,
  c: Partial<Omit<Candidature, 'id' | 'offre_id'>>,
): Candidature {
  const existante = db.prepare('SELECT * FROM candidatures WHERE offre_id = ?').get(offreId) as Candidature | undefined;
  if (!existante) {
    db.prepare(
      'INSERT INTO candidatures (offre_id, dossier, cv, envoyee_le, canal, message) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(offreId, c.dossier ?? null, c.cv ?? null, c.envoyee_le ?? null, c.canal ?? null, c.message ?? null);
  } else {
    db.prepare(
      `UPDATE candidatures SET dossier = COALESCE(?, dossier), cv = COALESCE(?, cv), envoyee_le = COALESCE(?, envoyee_le),
         canal = COALESCE(?, canal), message = COALESCE(?, message) WHERE offre_id = ?`,
    ).run(c.dossier ?? null, c.cv ?? null, c.envoyee_le ?? null, c.canal ?? null, c.message ?? null, offreId);
  }
  return db.prepare('SELECT * FROM candidatures WHERE offre_id = ?').get(offreId) as unknown as Candidature;
}

export function detailOffre(db: Base, id: number): DetailOffre | undefined {
  const offre = offreParId(db, id);
  if (!offre) return undefined;
  const notes = (
    db.prepare('SELECT * FROM notes WHERE offre_id = ? ORDER BY notee_le DESC, id DESC').all(id) as unknown as (Omit<
      Note,
      'lu'
    > & { lu: number })[]
  ).map((n) => ({ ...n, lu: Boolean(n.lu) }));
  const statuts = db
    .prepare('SELECT * FROM statuts WHERE offre_id = ? ORDER BY le DESC, id DESC')
    .all(id) as unknown as LigneStatut[];
  const candidature = (db.prepare('SELECT * FROM candidatures WHERE offre_id = ?').get(id) as Candidature | undefined) ?? null;
  return { ...offre, tags: tagsOffre(db, id), notes, statuts, candidature };
}

/** Nombre d'offres d'une entreprise déjà en base (comparaison sans casse). */
export function offresDeLEntreprise(db: Base, entreprise: string, saufId?: number): number {
  const r = db
    .prepare('SELECT COUNT(*) AS n FROM offres WHERE entreprise = ? COLLATE NOCASE AND id IS NOT ?')
    .get(entreprise.trim(), saufId ?? null) as { n: number };
  return r.n;
}
