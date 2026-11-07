// Liste paginée des offres (côté serveur), partagée par la CLI et l'API.
import type { Base } from '../db/base.ts';
import { COLONNES_TRI, STATUTS_CANDIDATURE, type ColonneTri } from './statuts.ts';
import type { Offre } from './offres.ts';

export interface Filtres {
  statuts?: string[];
  sources?: string[];
  tags?: string[];
  noteMin?: number;
  noteMax?: number;
  /** true : seulement les offres sans note ; false : seulement les notées. */
  sansNote?: boolean;
  contrat?: string;
  teletravail?: string;
  /** Recherche plein texte (titre, entreprise, description, stack). */
  q?: string;
  recueDepuis?: string;
  recueJusqua?: string;
  publieeDepuis?: string;
  publieeJusqua?: string;
  mesCandidatures?: boolean;
}

export interface OptionsListe extends Filtres {
  page?: number;
  taille?: number;
  /** Une colonne, ou plusieurs niveaux séparés par des virgules : `recue_le:desc,note:desc`. */
  tri?: string;
  /** Sens des niveaux qui n'en précisent pas (desc par défaut). */
  ordre?: 'asc' | 'desc';
}

export interface NiveauTri {
  colonne: ColonneTri;
  ordre: 'asc' | 'desc';
}

/**
 * Lit les niveaux de tri : `note`, `recue_le:desc,note:asc`… Les colonnes inconnues et les doublons sont ignorés ;
 * un niveau sans sens prend `ordre`. Sans niveau valide : réception la plus récente d'abord.
 */
export function niveauxTri(tri?: string, ordre?: 'asc' | 'desc'): NiveauTri[] {
  const parDefaut = ordre === 'asc' ? 'asc' : 'desc';
  const niveaux: NiveauTri[] = [];
  for (const morceau of (tri ?? '').split(',')) {
    const [col, sens] = morceau.trim().split(':').map((x) => x.trim().toLowerCase());
    if (!(COLONNES_TRI as readonly string[]).includes(col ?? '')) continue;
    if (niveaux.some((n) => n.colonne === col)) continue;
    niveaux.push({ colonne: col as ColonneTri, ordre: sens === 'asc' || sens === 'desc' ? sens : parDefaut });
  }
  return niveaux.length ? niveaux : [{ colonne: 'recue_le', ordre: parDefaut }];
}

/** Clause ORDER BY des niveaux (valeurs vides en dernier, départage par id décroissant). */
function ordreSql(niveaux: NiveauTri[]): string {
  const parts = niveaux.map(({ colonne, ordre }) => {
    const collation = colonne === 'titre' || colonne === 'entreprise' ? 'COLLATE NOCASE ' : '';
    return `(o.${colonne} IS NULL), o.${colonne} ${collation}${ordre.toUpperCase()}`;
  });
  if (!niveaux.some((n) => n.colonne === 'id')) parts.push('o.id DESC');
  return parts.join(', ');
}

export interface LigneListe extends Omit<Offre, 'description'> {
  tags: string[];
  a_description: boolean;
}

export interface ResultatListe {
  total: number;
  page: number;
  taille: number;
  pages: number;
  offres: LigneListe[];
}

export const TAILLE_MAX = 500;

/** Requête FTS5 sûre : chaque mot entre guillemets, avec recherche par préfixe. */
export function requeteFts(texte: string): string | null {
  const mots = texte
    .split(/[\s"'’()*:^+\-,.;!?]+/u)
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  if (!mots.length) return null;
  return mots.map((m) => `"${m.replace(/"/g, '""')}"*`).join(' ');
}

function clauses(f: Filtres): { where: string[]; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const liste = (col: string, valeurs: string[] | undefined) => {
    const v = (valeurs ?? []).filter(Boolean);
    if (!v.length) return;
    where.push(`${col} IN (${v.map(() => '?').join(', ')})`);
    params.push(...v);
  };
  if (f.mesCandidatures) liste('o.statut', STATUTS_CANDIDATURE);
  liste('o.statut', f.statuts);
  liste('o.source', f.sources);
  if (f.noteMin !== undefined && Number.isFinite(f.noteMin)) {
    where.push('o.note >= ?');
    params.push(f.noteMin);
  }
  if (f.noteMax !== undefined && Number.isFinite(f.noteMax)) {
    where.push('o.note <= ?');
    params.push(f.noteMax);
  }
  if (f.sansNote === true) where.push('o.note IS NULL');
  if (f.sansNote === false) where.push('o.note IS NOT NULL');
  if (f.contrat) {
    where.push("o.contrat LIKE ? ESCAPE '\\'");
    params.push(`%${echapperLike(f.contrat)}%`);
  }
  if (f.teletravail) {
    where.push("o.teletravail LIKE ? ESCAPE '\\'");
    params.push(`%${echapperLike(f.teletravail)}%`);
  }
  if (f.recueDepuis) {
    where.push('o.recue_le >= ?');
    params.push(f.recueDepuis);
  }
  if (f.recueJusqua) {
    where.push('o.recue_le <= ?');
    params.push(`${f.recueJusqua}￿`);
  }
  if (f.publieeDepuis) {
    where.push('o.publiee_le >= ?');
    params.push(f.publieeDepuis);
  }
  if (f.publieeJusqua) {
    where.push('o.publiee_le <= ?');
    params.push(`${f.publieeJusqua}￿`);
  }
  for (const tag of (f.tags ?? []).filter(Boolean)) {
    where.push('EXISTS (SELECT 1 FROM offre_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offre_id = o.id AND t.nom = ?)');
    params.push(tag);
  }
  const fts = f.q ? requeteFts(f.q) : null;
  if (fts) {
    where.push('o.id IN (SELECT rowid FROM offres_fts WHERE offres_fts MATCH ?)');
    params.push(fts);
  }
  return { where, params };
}

function echapperLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function listerOffres(db: Base, o: OptionsListe = {}): ResultatListe {
  const taille = Math.min(Math.max(Math.trunc(o.taille ?? 50), 1), TAILLE_MAX);
  const page = Math.max(Math.trunc(o.page ?? 1), 1);
  const { where, params } = clauses(o);
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM offres o ${sqlWhere}`).get(...params) as { n: number }).n;
  const lignes = db
    .prepare(
      `SELECT o.id, o.source, o.id_site, o.url_canonique, o.titre, o.entreprise, o.lieu, o.contrat, o.remuneration,
              o.remuneration_min, o.remuneration_max, o.remuneration_unite, o.teletravail, o.publiee_le, o.recue_le,
              o.stack, o.origine, o.statut, o.note, o.cree_le, o.maj_le,
              (o.description IS NOT NULL AND o.description <> '') AS a_description,
              (SELECT group_concat(t.nom, ',') FROM offre_tags ot JOIN tags t ON t.id = ot.tag_id WHERE ot.offre_id = o.id) AS tags
       FROM offres o ${sqlWhere}
       ORDER BY ${ordreSql(niveauxTri(o.tri, o.ordre))}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, taille, (page - 1) * taille) as unknown as (Omit<LigneListe, 'tags' | 'a_description'> & {
    tags: string | null;
    a_description: number;
  })[];
  return {
    total,
    page,
    taille,
    pages: Math.max(1, Math.ceil(total / taille)),
    offres: lignes.map((l) => ({
      ...l,
      a_description: Boolean(l.a_description),
      tags: l.tags ? l.tags.split(',').sort() : [],
    })),
  };
}

export interface Meta {
  total: number;
  statuts: { valeur: string; n: number }[];
  sources: { valeur: string; n: number }[];
  tags: { valeur: string; n: number }[];
  contrats: { valeur: string; n: number }[];
}

/** Valeurs présentes en base, pour les listes de filtres. */
export function meta(db: Base): Meta {
  const compte = (sql: string) => db.prepare(sql).all() as unknown as { valeur: string; n: number }[];
  return {
    total: (db.prepare('SELECT COUNT(*) AS n FROM offres').get() as { n: number }).n,
    statuts: compte('SELECT statut AS valeur, COUNT(*) AS n FROM offres GROUP BY statut ORDER BY n DESC'),
    sources: compte('SELECT source AS valeur, COUNT(*) AS n FROM offres GROUP BY source ORDER BY n DESC'),
    tags: compte(
      'SELECT t.nom AS valeur, COUNT(*) AS n FROM offre_tags ot JOIN tags t ON t.id = ot.tag_id GROUP BY t.nom ORDER BY t.nom',
    ),
    contrats: compte(
      "SELECT contrat AS valeur, COUNT(*) AS n FROM offres WHERE contrat IS NOT NULL AND contrat <> '' GROUP BY contrat ORDER BY n DESC LIMIT 30",
    ),
  };
}
