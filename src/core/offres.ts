// Opérations sur les offres : création / complément, statuts, notes, tags, candidatures, détail.
import type { Base } from '../db/base.ts';
import { estStatut, type Statut } from './statuts.ts';
import { lireRemuneration, maintenant, nettoyer } from './texte.ts';
import { journal, type EvenementJournal } from './evenements.ts';
import type { Decomposition, Saisie } from './grille.ts';

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
  /** Note à critères : valeur exacte (note = arrondi au demi-point). null pour une note globale. */
  note_exacte: number | null;
  /** Sous-notes, entrées et règles signalées (ce qui a été saisi). null : note globale de l'ancienne grille. */
  saisie: Saisie | null;
  /** Décomposition calculée : sous-notes, poids, contributions, règles appliquées, drapeaux. */
  decomposition: Decomposition | null;
  recalculee_le: string | null;
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
  prochaine_action: string | null;
  prochaine_action_origine: string | null;
  libelle: string | null;
  conditions: string | null;
  etat: string | null;
  maj_le: string | null;
}

/** Champs modifiables d'une candidature : absent = inchangé, null ou chaîne vide = effacé. */
export type ChampsCandidature = Partial<
  Pick<Candidature, 'dossier' | 'cv' | 'envoyee_le' | 'canal' | 'message' | 'prochaine_action' | 'libelle' | 'conditions' | 'etat'>
>;

export const CHAMPS_CANDIDATURE = [
  'dossier',
  'cv',
  'envoyee_le',
  'canal',
  'message',
  'prochaine_action',
  'libelle',
  'conditions',
  'etat',
] as const satisfies readonly (keyof ChampsCandidature)[];

export interface DetailOffre extends Offre {
  tags: string[];
  notes: Note[];
  statuts: LigneStatut[];
  candidature: Candidature | null;
  /** Journal : échéances d'abord, puis événements du plus récent au plus ancien. */
  evenements: EvenementJournal[];
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

/** Remplace le lien de l'offre (null pour l'effacer). Seules les adresses http(s) sont acceptées. */
export function modifierLien(db: Base, id: number, url: string | null): void {
  const propre = url?.trim() || null;
  if (propre !== null && !/^https?:\/\/\S+$/i.test(propre)) {
    throw new Error(`Lien invalide (http:// ou https:// attendu) : ${propre}`);
  }
  db.prepare('UPDATE offres SET url_canonique = ?, maj_le = ? WHERE id = ?').run(propre, maintenant(), id);
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

/**
 * Ordre de l'historique des statuts pour trouver le statut courant : le plus récent, sauf qu'une ligne
 * automatique d'avant le go (offre revue dans un lot, le registre ou une alerte) passe après les autres
 * dès que l'offre a été suivie (go et au-delà) : elle ne change pas le statut d'une candidature.
 * Même règle dans la migration 0003.
 */
export const ORDRE_STATUTS = `(s.origine IN ('ingest', 'import-lot', 'import-registre')
    AND s.statut IN ('nouvelle', 'a-lire', 'notee', 'ecartee')
    AND EXISTS (SELECT 1 FROM statuts s2 WHERE s2.offre_id = s.offre_id
                AND s2.statut IN ('go', 'envoyee', 'relancee', 'entretien', 'refus', 'close', 'abandonnee'))),
  s.le DESC, s.id DESC`;

/** Recalcule les colonnes dénormalisées statut / note à partir de l'historique (la dernière fait foi). */
export function recalculer(db: Base, offreId: number): void {
  db.prepare(
    `UPDATE offres SET
       statut = COALESCE((SELECT s.statut FROM statuts s WHERE s.offre_id = offres.id ORDER BY ${ORDRE_STATUTS} LIMIT 1), 'nouvelle'),
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
  if (statut === 'envoyee') dateEnvoiParDefaut(db, offreId, opts.le);
  recalculer(db, offreId);
  return true;
}

/**
 * Passage en « envoyee » sans date d'envoi : la date du statut devient la date d'envoi (sinon le suivi
 * affiche « — » et le délai de réponse ne se calcule pas), et une prochaine action « Envoyer… » est effacée.
 */
function dateEnvoiParDefaut(db: Base, offreId: number, le?: string): void {
  const d = new Date();
  const jour = le && /^\d{4}-\d{2}-\d{2}/.test(le) ? le.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  db.prepare('INSERT INTO candidatures (offre_id, envoyee_le) VALUES (?, ?) ON CONFLICT (offre_id) DO UPDATE SET envoyee_le = COALESCE(envoyee_le, excluded.envoyee_le)').run(offreId, jour);
  const colonnes = db.prepare("SELECT name FROM pragma_table_info('candidatures')").all() as { name: string }[];
  if (colonnes.some((c) => c.name === 'prochaine_action')) {
    db.prepare("UPDATE candidatures SET prochaine_action = NULL WHERE offre_id = ? AND prochaine_action LIKE 'envoyer%'").run(offreId);
  }
}

export interface EntreeNote {
  note_brute?: number | null;
  penalites?: string | null;
  note?: number | null;
  colle?: string | null;
  ecarts?: string | null;
  lu?: boolean | null;
  grille_version?: string | null;
  note_exacte?: number | null;
  saisie?: Saisie | null;
  decomposition?: Decomposition | null;
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
    `INSERT INTO notes (offre_id, note_brute, penalites, note, colle, ecarts, lu, grille_version, origine, notee_le,
                        note_exacte, saisie, decomposition)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    e.note_exacte ?? null,
    e.saisie ? JSON.stringify(e.saisie) : null,
    e.decomposition ? JSON.stringify(e.decomposition) : null,
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

export function candidatureDe(db: Base, offreId: number): Candidature | null {
  return (db.prepare('SELECT * FROM candidatures WHERE offre_id = ?').get(offreId) as Candidature | undefined) ?? null;
}

/**
 * Crée ou met à jour la candidature d'une offre. Un champ absent (undefined) est conservé ; null ou ''
 * l'efface. `origine` est retenue pour la prochaine action (la reprise de _SUIVI.md ne remplace pas
 * un texte saisi dans l'interface, la CLI ou par MCP).
 */
export function enregistrerCandidature(
  db: Base,
  offreId: number,
  c: ChampsCandidature,
  opts: { origine?: string } = {},
): Candidature {
  let actuelle = candidatureDe(db, offreId);
  if (!actuelle) {
    db.prepare('INSERT INTO candidatures (offre_id, maj_le) VALUES (?, ?)').run(offreId, maintenant());
    actuelle = candidatureDe(db, offreId)!;
  }
  const maj: string[] = [];
  const params: (string | null)[] = [];
  for (const k of CHAMPS_CANDIDATURE) {
    if (c[k] === undefined) continue;
    const v = nettoyerChamp(c[k]);
    if (v === actuelle[k]) continue;
    maj.push(`${k} = ?`);
    params.push(v);
    if (k === 'prochaine_action') {
      maj.push('prochaine_action_origine = ?');
      params.push(v === null ? null : (opts.origine ?? 'cli'));
    }
  }
  if (maj.length) {
    db.prepare(`UPDATE candidatures SET ${maj.join(', ')}, maj_le = ? WHERE offre_id = ?`).run(...params, maintenant(), offreId);
    db.prepare('UPDATE offres SET maj_le = ? WHERE id = ?').run(maintenant(), offreId);
  }
  return candidatureDe(db, offreId)!;
}

/** Valeur d'un champ de candidature : texte nettoyé (espaces de bord retirés), null si vide. */
function nettoyerChamp(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

type LigneNote = Omit<Note, 'lu' | 'saisie' | 'decomposition'> & { lu: number; saisie: string | null; decomposition: string | null };

/** Notes d'une offre, de la plus récente à la plus ancienne (sous-notes et décomposition lues). */
export function notesOffre(db: Base, offreId: number): Note[] {
  return (db.prepare('SELECT * FROM notes WHERE offre_id = ? ORDER BY notee_le DESC, id DESC').all(offreId) as unknown as LigneNote[]).map(
    (n) => ({
      ...n,
      lu: Boolean(n.lu),
      saisie: n.saisie ? (JSON.parse(n.saisie) as Saisie) : null,
      decomposition: n.decomposition ? (JSON.parse(n.decomposition) as Decomposition) : null,
    }),
  );
}

export function detailOffre(db: Base, id: number): DetailOffre | undefined {
  const offre = offreParId(db, id);
  if (!offre) return undefined;
  const notes = notesOffre(db, id);
  const statuts = db
    .prepare('SELECT * FROM statuts WHERE offre_id = ? ORDER BY le DESC, id DESC')
    .all(id) as unknown as LigneStatut[];
  return { ...offre, tags: tagsOffre(db, id), notes, statuts, candidature: candidatureDe(db, id), evenements: journal(db, id) };
}

/** Nombre d'offres d'une entreprise déjà en base (comparaison sans casse). */
export function offresDeLEntreprise(db: Base, entreprise: string, saufId?: number): number {
  const r = db
    .prepare('SELECT COUNT(*) AS n FROM offres WHERE entreprise = ? COLLATE NOCASE AND id IS NOT ?')
    .get(entreprise.trim(), saufId ?? null) as { n: number };
  return r.n;
}

/**
 * Fusionne l'offre `doublon` dans l'offre `cible` : notes, statuts, tags et candidature passent sur la cible,
 * les champs vides de la cible sont complétés, puis le doublon est supprimé.
 */
export function fusionnerOffres(db: Base, cible: number, doublon: number): void {
  if (cible === doublon) return;
  const d = offreParId(db, doublon);
  if (!d || !offreParId(db, cible)) throw new Error(`Fusion impossible : offre ${cible} ou ${doublon} introuvable`);
  db.prepare('UPDATE notes SET offre_id = ? WHERE offre_id = ?').run(cible, doublon);
  db.prepare('UPDATE statuts SET offre_id = ? WHERE offre_id = ?').run(cible, doublon);
  db.prepare('UPDATE OR IGNORE evenements SET offre_id = ? WHERE offre_id = ?').run(cible, doublon);
  db.prepare('INSERT OR IGNORE INTO offre_tags (offre_id, tag_id) SELECT ?, tag_id FROM offre_tags WHERE offre_id = ?').run(
    cible,
    doublon,
  );
  const cd = candidatureDe(db, doublon);
  if (cd) {
    if (!candidatureDe(db, cible)) {
      db.prepare('UPDATE candidatures SET offre_id = ? WHERE offre_id = ?').run(cible, doublon);
    } else {
      const champs: ChampsCandidature = {};
      const cc = candidatureDe(db, cible)!;
      for (const k of CHAMPS_CANDIDATURE) if (cc[k] === null && cd[k] !== null) champs[k] = cd[k];
      enregistrerCandidature(db, cible, champs, { origine: cd.prochaine_action_origine ?? undefined });
    }
  }
  const complements: ChampsOffre = {};
  for (const k of CHAMPS) complements[k] = d[k as keyof Offre] as string | null;
  const c = offreParId(db, cible)!;
  enregistrerOffre(db, c.source, c.id_site, complements, c.origine);
  db.prepare('DELETE FROM offres WHERE id = ?').run(doublon);
  recalculer(db, cible);
}
