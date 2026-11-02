// Journal d'une candidature : événements datés (messages, entretiens, tests, propositions, décisions, notes)
// et échéances (événement daté dans le futur, ou passé mais pas encore fait).
// La base garde ce qui s'est passé et quand ; les documents restent dans le dossier de candidature
// (un événement n'en garde que le chemin, relatif au dossier de données).
import type { Base } from '../db/base.ts';
import { maintenant } from './texte.ts';
import { TYPES_EVENEMENT, type OrigineEvenement, type Sens, type TypeEvenement } from './statuts.ts';

export { LIBELLES_TYPES, ORIGINES_EVENEMENT, SENS_MESSAGE, TYPES_EVENEMENT } from './statuts.ts';
export type { OrigineEvenement, Sens, TypeEvenement } from './statuts.ts';

export interface Evenement {
  id: number;
  offre_id: number;
  type: TypeEvenement;
  sens: Sens | null;
  /** AAAA-MM-JJ ou AAAA-MM-JJTHH:MM (heure locale). */
  le: string;
  fait: boolean;
  resume: string;
  details: string | null;
  canal: string | null;
  interlocuteurs: string | null;
  montant: number | null;
  unite: string | null;
  jours: number | null;
  /** Chemins relatifs au dossier de données. */
  fichiers: string[];
  origine: OrigineEvenement;
  cle_import: string | null;
  cree_le: string;
  maj_le: string | null;
}

/** Événement du journal, avec son état d'échéance calculé à la date du jour. */
export interface EvenementJournal extends Evenement {
  /** Pas encore fait (à venir ou en retard). */
  echeance: boolean;
  /** Pas fait et daté d'avant aujourd'hui. */
  en_retard: boolean;
}

export interface EcheanceOffre extends EvenementJournal {
  titre: string;
  entreprise: string | null;
  statut: string;
}

/** Saisie d'un événement. Champs facultatifs : absent = inchangé (modification), null ou '' = effacé. */
export interface SaisieEvenement {
  type?: string;
  sens?: string | null;
  le?: string;
  fait?: boolean;
  resume?: string;
  details?: string | null;
  canal?: string | null;
  interlocuteurs?: string | null;
  montant?: number | string | null;
  unite?: string | null;
  jours?: number | string | null;
  fichiers?: string[] | null;
}

// ---------------------------------------------------------------------------------------------
// Dates (heure locale de la machine : celle de l'utilisateur)
// ---------------------------------------------------------------------------------------------

const deux = (n: number) => String(n).padStart(2, '0');

/** AAAA-MM-JJ du jour (heure locale), décalé de `jours`. */
export function jourLocal(d: Date = new Date(), jours = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours);
  return `${x.getFullYear()}-${deux(x.getMonth() + 1)}-${deux(x.getDate())}`;
}

/** AAAA-MM-JJTHH:MM (heure locale). */
export function instantLocal(d: Date = new Date()): string {
  return `${jourLocal(d)}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

function dateValide(a: number, m: number, j: number): boolean {
  const d = new Date(a, m - 1, j);
  return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j;
}

/**
 * Lit une date d'événement : « 05/11/2026 », « 05/11/2026 14:30 », « 05/11/2026 à 14 h 30 », « 2026-11-05 »,
 * « 2026-11-05T14:30 », « aujourd'hui », « demain », « +3 » (dans 3 jours). Rend AAAA-MM-JJ ou AAAA-MM-JJTHH:MM.
 */
export function lireDateEvenement(texte: string, maintenantLe: Date = new Date()): string {
  const t = texte.trim().toLowerCase();
  if (/^aujourd'?hui$|^aujourd’hui$/.test(t)) return jourLocal(maintenantLe);
  if (t === 'demain') return jourLocal(maintenantLe, 1);
  const rel = t.match(/^\+\s*(\d{1,3})\s*j?$/);
  if (rel) return jourLocal(maintenantLe, Number(rel[1]));
  let a: number, m: number, j: number;
  let reste: string;
  const fr = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (fr) {
    [j, m, a] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
    reste = fr[4];
  } else if (iso) {
    [a, m, j] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    reste = iso[4];
  } else {
    throw new Error(`Date invalide : « ${texte} » (JJ/MM/AAAA, JJ/MM/AAAA HH:MM ou AAAA-MM-JJ attendu)`);
  }
  if (!dateValide(a, m, j)) throw new Error(`Date invalide : « ${texte} »`);
  const jour = `${a}-${deux(m)}-${deux(j)}`;
  const r = reste.trim().replace(/^(t|à|a)\s*/, '');
  if (!r) return jour;
  const h = r.match(/^(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?::\d{2}(?:\.\d+)?)?\s*(?:z|[+-]\d{2}:?\d{2})?$/);
  if (!h || Number(h[1]) > 23 || Number(h[2] ?? 0) > 59) throw new Error(`Heure invalide : « ${texte} »`);
  return `${jour}T${deux(Number(h[1]))}:${h[2] ?? '00'}`;
}

/** L'événement est-il dans le futur ? (une date seule d'aujourd'hui ne l'est pas). */
export function estFutur(le: string, maintenantLe: Date = new Date()): boolean {
  return le.length > 10 ? le > instantLocal(maintenantLe) : le > jourLocal(maintenantLe);
}

/** « 05/11/2026 » ou « 05/11/2026 14 h 30 ». */
export function dateEvenementFr(le: string): string {
  const m = le.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return le;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]} h ${m[5]}` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

function texteOuNull(v: unknown, nom: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error(`${nom} : texte attendu`);
  const t = v.trim();
  return t === '' ? null : t;
}

function nombreOuNull(v: unknown, nom: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[\s  ]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${nom} : nombre attendu (${String(v)})`);
  return n;
}

/**
 * Chemin de fichier relatif au dossier de données, en barres obliques : refuse les chemins absolus,
 * « .. », les segments cachés (« .git ») et les caractères de contrôle.
 */
export function cheminRelatif(v: string): string {
  const t = v.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!t) throw new Error('Chemin de fichier vide');
  if (/^[a-z]:/i.test(t) || t.startsWith('/')) throw new Error(`Chemin absolu refusé : ${v} (chemin relatif au dossier de données attendu)`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(t)) throw new Error(`Chemin invalide : ${v}`);
  const segments = t.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.some((s) => s === '..' || s.startsWith('.'))) throw new Error(`Chemin refusé : ${v}`);
  return segments.join('/');
}

function fichiersValides(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new Error('fichiers : liste de chemins attendue');
  return [...new Set(v.map((f) => cheminRelatif(String(f))))];
}

function typeValide(v: unknown): TypeEvenement {
  if (typeof v !== 'string' || !(TYPES_EVENEMENT as readonly string[]).includes(v)) {
    throw new Error(`Type d'événement inconnu : ${String(v)} (${TYPES_EVENEMENT.join(', ')})`);
  }
  return v as TypeEvenement;
}

function sensValide(v: unknown): Sens | null {
  const t = texteOuNull(v, 'sens');
  if (t === null) return null;
  const n = t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (n === 'envoye' || n === 'envoyee') return 'envoye';
  if (n === 'recu' || n === 'recue') return 'recu';
  throw new Error(`Sens inconnu : ${t} (envoye ou recu)`);
}

// ---------------------------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------------------------

type LigneBrute = Omit<Evenement, 'fait' | 'fichiers'> & { fait: number; fichiers: string };

function depuisLigne(l: LigneBrute): Evenement {
  let fichiers: string[] = [];
  try {
    const f = JSON.parse(l.fichiers || '[]') as unknown;
    if (Array.isArray(f)) fichiers = f.map(String);
  } catch {
    /* colonne abîmée : liste vide */
  }
  return { ...l, fait: Boolean(l.fait), fichiers };
}

function avecEtat<T extends Evenement>(e: T, aujourdhui: string): T & { echeance: boolean; en_retard: boolean } {
  return { ...e, echeance: !e.fait, en_retard: !e.fait && e.le.slice(0, 10) < aujourdhui };
}

export function evenementParId(db: Base, id: number): Evenement | undefined {
  const l = db.prepare('SELECT * FROM evenements WHERE id = ?').get(id) as LigneBrute | undefined;
  return l ? depuisLigne(l) : undefined;
}

export function evenementOuErreur(db: Base, id: number): Evenement {
  const e = Number.isInteger(id) ? evenementParId(db, id) : undefined;
  if (!e) throw new Error(`Événement ${id} introuvable`);
  return e;
}

/**
 * Journal d'une offre : échéances (pas faites) d'abord, de la plus proche à la plus lointaine (les retards
 * en tête), puis les événements faits, du plus récent au plus ancien.
 */
export function journal(db: Base, offreId: number, maintenantLe: Date = new Date()): EvenementJournal[] {
  const aujourdhui = jourLocal(maintenantLe);
  const lignes = db
    .prepare(
      `SELECT * FROM evenements WHERE offre_id = ?
       ORDER BY fait ASC,
                CASE WHEN fait = 0 THEN le END ASC,
                CASE WHEN fait = 1 THEN le END DESC,
                id DESC`,
    )
    .all(offreId) as unknown as LigneBrute[];
  return lignes.map((l) => avecEtat(depuisLigne(l), aujourdhui));
}

export interface Echeances {
  aujourdhui: string;
  jusqua: string;
  en_retard: EcheanceOffre[];
  a_venir: EcheanceOffre[];
}

/** Échéances : en retard (date passée, pas faites) et à venir sur `jours` jours (aujourd'hui compris). */
export function echeances(db: Base, o: { jours?: number; maintenant?: Date } = {}): Echeances {
  const jours = o.jours ?? 7;
  if (!Number.isInteger(jours) || jours < 0 || jours > 3660) throw new Error(`Nombre de jours invalide : ${jours}`);
  const now = o.maintenant ?? new Date();
  const aujourdhui = jourLocal(now);
  const jusqua = jourLocal(now, jours);
  const lignes = (
    db.prepare('SELECT * FROM echeances WHERE substr(le, 1, 10) <= ? ORDER BY le ASC, id ASC').all(jusqua) as unknown as (LigneBrute & {
      titre: string;
      entreprise: string | null;
      statut: string;
    })[]
  ).map((l) => avecEtat({ ...depuisLigne(l), titre: l.titre, entreprise: l.entreprise, statut: l.statut }, aujourdhui));
  return {
    aujourdhui,
    jusqua,
    en_retard: lignes.filter((l) => l.en_retard),
    a_venir: lignes.filter((l) => !l.en_retard),
  };
}

/** Prochaine échéance d'une offre (la plus ancienne pas faite : un retard passe avant le reste). */
export function prochaineEcheance(db: Base, offreId: number): Evenement | null {
  const l = db
    .prepare('SELECT * FROM evenements WHERE offre_id = ? AND fait = 0 ORDER BY le ASC, id ASC LIMIT 1')
    .get(offreId) as LigneBrute | undefined;
  return l ? depuisLigne(l) : null;
}

// ---------------------------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------------------------

function toucherOffre(db: Base, offreId: number): void {
  db.prepare('UPDATE offres SET maj_le = ? WHERE id = ?').run(maintenant(), offreId);
}

/**
 * Ajoute un événement au journal d'une offre. `fait` vaut par défaut false pour une date future
 * (c'est une échéance) et true sinon. `le` vaut par défaut maintenant.
 */
export function ajouterEvenement(
  db: Base,
  offreId: number,
  s: SaisieEvenement,
  origine: OrigineEvenement,
  opts: { cleImport?: string; maintenant?: Date } = {},
): Evenement {
  if (!db.prepare('SELECT 1 FROM offres WHERE id = ?').get(offreId)) throw new Error(`Offre ${offreId} introuvable`);
  const type = typeValide(s.type);
  const resume = texteOuNull(s.resume, 'resume');
  if (!resume) throw new Error("Résumé de l'événement attendu");
  const now = opts.maintenant ?? new Date();
  const le = s.le === undefined || s.le === null || String(s.le).trim() === '' ? instantLocal(now) : lireDateEvenement(String(s.le), now);
  const fait = s.fait === undefined || s.fait === null ? !estFutur(le, now) : Boolean(s.fait);
  const info = db
    .prepare(
      `INSERT INTO evenements (offre_id, type, sens, le, fait, resume, details, canal, interlocuteurs, montant, unite, jours,
         fichiers, origine, cle_import, cree_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      offreId,
      type,
      sensValide(s.sens),
      le,
      fait ? 1 : 0,
      resume,
      texteOuNull(s.details, 'details'),
      texteOuNull(s.canal, 'canal'),
      texteOuNull(s.interlocuteurs, 'interlocuteurs'),
      nombreOuNull(s.montant, 'montant'),
      texteOuNull(s.unite, 'unite'),
      nombreOuNull(s.jours, 'jours'),
      JSON.stringify(fichiersValides(s.fichiers)),
      origine,
      opts.cleImport ?? null,
      maintenant(),
    );
  toucherOffre(db, offreId);
  return evenementParId(db, Number(info.lastInsertRowid))!;
}

/** Modifie un événement : champ absent = inchangé ; null ou '' = effacé (sauf type, date et résumé). */
export function modifierEvenement(db: Base, id: number, s: SaisieEvenement, opts: { maintenant?: Date } = {}): Evenement {
  const e = evenementOuErreur(db, id);
  const maj: string[] = [];
  const params: (string | number | null)[] = [];
  const poser = (col: string, v: string | number | null) => {
    maj.push(`${col} = ?`);
    params.push(v);
  };
  if (s.type !== undefined) poser('type', typeValide(s.type));
  if (s.sens !== undefined) poser('sens', sensValide(s.sens));
  if (s.le !== undefined) poser('le', lireDateEvenement(String(s.le), opts.maintenant));
  if (s.fait !== undefined) poser('fait', s.fait ? 1 : 0);
  if (s.resume !== undefined) {
    const r = texteOuNull(s.resume, 'resume');
    if (!r) throw new Error("Résumé de l'événement attendu");
    poser('resume', r);
  }
  for (const k of ['details', 'canal', 'interlocuteurs', 'unite'] as const) if (s[k] !== undefined) poser(k, texteOuNull(s[k], k));
  for (const k of ['montant', 'jours'] as const) if (s[k] !== undefined) poser(k, nombreOuNull(s[k], k));
  if (s.fichiers !== undefined) poser('fichiers', JSON.stringify(fichiersValides(s.fichiers)));
  if (maj.length) {
    db.prepare(`UPDATE evenements SET ${maj.join(', ')}, maj_le = ? WHERE id = ?`).run(...params, maintenant(), id);
    toucherOffre(db, e.offre_id);
  }
  return evenementParId(db, id)!;
}

export function marquerFait(db: Base, id: number, fait = true): Evenement {
  return modifierEvenement(db, id, { fait });
}

export function supprimerEvenement(db: Base, id: number): Evenement {
  const e = evenementOuErreur(db, id);
  db.prepare('DELETE FROM evenements WHERE id = ?').run(id);
  toucherOffre(db, e.offre_id);
  return e;
}

/** Texte court d'une échéance pour le suivi : « 04/11 : Relancer » (« en retard » si la date est passée). */
export function texteEcheance(e: Evenement, maintenantLe: Date = new Date()): string {
  const m = e.le.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  const quand = m ? `${m[3]}/${m[2]}${m[1] !== String(maintenantLe.getFullYear()) ? `/${m[1]}` : ''}${m[4] ? ` ${m[4]} h ${m[5]}` : ''}` : e.le;
  const retard = !e.fait && e.le.slice(0, 10) < jourLocal(maintenantLe) ? ' (en retard)' : '';
  return `**${quand}**${retard} : ${e.resume}`;
}
