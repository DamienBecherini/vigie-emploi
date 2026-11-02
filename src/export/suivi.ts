// Génération du suivi des candidatures (_SUIVI.md) depuis la base : sections En cours, Envoyées sans suite
// et Closes, aux colonnes du suivi tenu à la main jusqu'ici.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import type { Base } from '../db/base.ts';
import type { Candidature, Offre } from '../core/offres.ts';
import { LIBELLES_STATUTS, type Statut } from '../core/statuts.ts';
import { dateFr } from '../core/texte.ts';

/** Repère d'un fichier généré (lu par import-historique, qui ne relit pas un suivi généré). */
export const MARQUE_SUIVI_GENERE = /Fichier généré par cap-emploi/;

export const FICHIER_SUIVI = posix.join('candidatures', '_SUIVI.md');
export const FICHIER_APERCU = posix.join('candidatures', '_SUIVI.genere.md');

const STATUTS_EN_COURS: Statut[] = ['go', 'envoyee', 'relancee', 'entretien'];
const STATUTS_CLOS: Statut[] = ['refus', 'close', 'abandonnee', 'ecartee'];
/** Commentaires techniques qui ne disent rien de l'état de la candidature. */
const COMMENTAIRES_MUETS = /^(candidater|bouton candidater)$/i;
const SANS_SUITE = /sans (nouvelles|réponse)/i;

interface LigneSuivi {
  offre: Offre;
  candidature: Candidature | null;
  dernier: { statut: Statut; commentaire: string | null; origine: string; le: string } | null;
}

export interface Suivi {
  markdown: string;
  en_cours: number;
  sans_suite: number;
  closes: number;
}

function cellule(v: string | null | undefined): string {
  const t = (v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();
  return t ? t.replace(/(?<!\\)\|/g, '\\|') : '—';
}

/** AAAA-MM-JJ → JJ/MM/AAAA, AAAA-MM → MM/AAAA ; un texte libre (« ≈ 25/08/2026 ») reste tel quel. */
function dateAffichee(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return v;
  return m[3] ? `${m[3]}/${m[2]}/${m[1]}` : `${m[2]}/${m[1]}`;
}

function note(o: Offre): string {
  return o.note === null ? '' : ` (${String(o.note).replace('.', ',')}/10)`;
}

function libelle(l: LigneSuivi): string {
  if (l.candidature?.libelle) return l.candidature.libelle;
  const o = l.offre;
  return o.entreprise ? `**${o.entreprise}** — ${o.titre}` : o.titre;
}

function conditions(l: LigneSuivi): string | null {
  if (l.candidature?.conditions) return l.candidature.conditions;
  const o = l.offre;
  return [o.contrat, o.lieu, o.teletravail && `télétravail ${o.teletravail}`, o.remuneration].filter(Boolean).join(', ') || null;
}

/**
 * Texte de la colonne Statut (ou Issue) : la cellule reprise de l'ancien suivi tant que le dernier statut est
 * celui de la reprise ; sinon le commentaire du dernier statut, ou à défaut son libellé (et la note).
 */
function etat(l: LigneSuivi): string {
  const d = l.dernier;
  if (l.candidature?.etat && (!d || d.origine === 'import-suivi')) return l.candidature.etat;
  if (!d) return `${LIBELLES_STATUTS[l.offre.statut]}${note(l.offre)}`;
  const libelleStatut = d.statut === 'go' ? `**À envoyer** — GO${note(l.offre)}` : `${LIBELLES_STATUTS[d.statut]}${note(l.offre)}`;
  if (!d.commentaire || COMMENTAIRES_MUETS.test(d.commentaire)) return libelleStatut;
  return d.statut === 'go' ? `${libelleStatut} — ${d.commentaire}` : d.commentaire;
}

/** Lien vers le dossier, relatif à candidatures/ (fichier dossier-candidature.md s'il existe). */
function lienDossier(dossierDonnees: string, dossier: string | null): string | null {
  if (!dossier) return null;
  const rel = posix.relative('candidatures', dossier.replace(/\\/g, '/'));
  const nom = posix.basename(rel);
  const fiche = posix.join(rel, 'dossier-candidature.md');
  return existsSync(join(dossierDonnees, 'candidatures', fiche)) ? `[${nom}](${fiche})` : `[${nom}](${rel}/)`;
}

/** Date de tri (AAAA-MM-JJ) d'un envoi, même noté « ≈ 25/08/2026 » ou « après le 20/08/2026 ». */
function dateTri(v: string | null): string {
  if (!v) return '';
  return /^\d{4}-\d{2}/.test(v) ? v : (dateFr(v) ?? '');
}

function lignes(db: Base): LigneSuivi[] {
  const offres = db
    .prepare(
      `SELECT o.* FROM offres o
       WHERE o.statut IN (${STATUTS_EN_COURS.map(() => '?').join(', ')})
          OR EXISTS (SELECT 1 FROM candidatures c WHERE c.offre_id = o.id)`,
    )
    .all(...STATUTS_EN_COURS) as unknown as Offre[];
  const cand = db.prepare('SELECT * FROM candidatures WHERE offre_id = ?');
  // Dernier statut qui concerne la candidature : ceux repris du registre ou des lots (l'offre revue dans
  // un lot d'alertes, par exemple) ne remplacent pas l'état écrit dans le suivi.
  const dernier = db.prepare(
    `SELECT statut, commentaire, origine, le FROM statuts WHERE offre_id = ?
     ORDER BY (origine IN ('import-registre', 'import-lot')), le DESC, id DESC LIMIT 1`,
  );
  return offres.map((offre) => ({
    offre,
    candidature: (cand.get(offre.id) as Candidature | undefined) ?? null,
    dernier: (dernier.get(offre.id) as LigneSuivi['dernier'] | undefined) ?? null,
  }));
}

/** Statut de la candidature dans le suivi : celui du dernier statut retenu (voir lignes()). */
function statutSuivi(l: LigneSuivi): Statut {
  return l.dernier?.statut ?? l.offre.statut;
}

function estSansSuite(l: LigneSuivi): boolean {
  if (!['envoyee', 'relancee'].includes(statutSuivi(l))) return false;
  const texte = l.dernier?.origine === 'import-suivi' && l.candidature?.etat ? l.candidature.etat : (l.dernier?.commentaire ?? '');
  return SANS_SUITE.test(texte) || SANS_SUITE.test(l.dernier?.commentaire ?? '');
}

/** Produit le Markdown du suivi à partir de la base. */
export function genererSuivi(db: Base, dossierDonnees: string, le: Date = new Date()): Suivi {
  const toutes = lignes(db);
  const closes = toutes.filter((l) => STATUTS_CLOS.includes(statutSuivi(l)));
  const ouvertes = toutes.filter((l) => !STATUTS_CLOS.includes(statutSuivi(l)));
  const sansSuite = ouvertes.filter(estSansSuite);
  const enCours = ouvertes.filter((l) => !estSansSuite(l));

  // En cours : à envoyer d'abord, puis de l'envoi le plus récent au plus ancien.
  const parEnvoi = (a: LigneSuivi, b: LigneSuivi) => {
    const ga = statutSuivi(a) === 'go' ? 1 : 0;
    const gb = statutSuivi(b) === 'go' ? 1 : 0;
    if (ga !== gb) return gb - ga;
    const da = dateTri(a.candidature?.envoyee_le ?? null);
    const db_ = dateTri(b.candidature?.envoyee_le ?? null);
    return db_.localeCompare(da) || b.offre.id - a.offre.id;
  };
  enCours.sort(parEnvoi);
  sansSuite.sort(parEnvoi);
  // Closes : de la plus récente à la plus ancienne (date écrite dans l'issue reprise, sinon date du statut),
  // celles sans date à la fin.
  const dateClose = (l: LigneSuivi) =>
    l.candidature?.etat && l.dernier?.origine === 'import-suivi' ? (dateFr(l.candidature.etat) ?? '') : (l.dernier?.le ?? '');
  closes.sort((a, b) => dateClose(b).localeCompare(dateClose(a)) || b.offre.id - a.offre.id);

  const quand = `${le.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à ${le.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  const entetes = '| Offre | Type | Canal | Envoyé | Statut | Prochaine action | Dossier |\n|---|---|---|---|---|---|---|';
  const ligneOuverte = (l: LigneSuivi) =>
    `| ${[
      libelle(l),
      conditions(l),
      l.candidature?.canal,
      dateAffichee(l.candidature?.envoyee_le ?? null),
      etat(l),
      l.candidature?.prochaine_action,
      lienDossier(dossierDonnees, l.candidature?.dossier ?? null),
    ]
      .map(cellule)
      .join(' | ')} |`;
  const ligneClose = (l: LigneSuivi) => {
    const lien = lienDossier(dossierDonnees, l.candidature?.dossier ?? null);
    const offre = `${libelle(l)}${lien ? ` (${lien.replace(/^\[[^\]]*\]/, '[dossier]')})` : ''}`;
    return `| ${cellule(offre)} | ${cellule(etat(l))} |`;
  };

  const md: string[] = [
    '# Suivi des candidatures',
    '',
    `> **Fichier généré par cap-emploi le ${quand} : ne pas éditer à la main.** Les changements se font dans la base`,
    '> (tableau de bord, CLI ou outils MCP), puis `cap-emploi generer-suivi`. Une ligne par offre ; le détail est dans le dossier de chaque offre.',
    '',
    '## En cours',
    '',
    entetes,
    ...enCours.map(ligneOuverte),
    '',
    '## Envoyées sans suite',
    '',
    entetes,
    ...sansSuite.map(ligneOuverte),
    '',
  ];
  if ([...enCours, ...sansSuite].some((l) => /≈/.test(l.candidature?.envoyee_le ?? ''))) {
    md.push("Les dates « ≈ » sont des estimations, pas une trace d'envoi. Les corriger si tu retrouves la vraie date.", '');
  }
  md.push(
    '## Closes',
    '',
    '| Offre | Issue |',
    '|---|---|',
    ...closes.map(ligneClose),
    '',
    'Offres analysées puis écartées ou mises de côté : [`_ecartees.md`](_ecartees.md) (une ligne par offre, à consulter par mot-clé).',
    '',
  );
  return { markdown: md.join('\n'), en_cours: enCours.length, sans_suite: sansSuite.length, closes: closes.length };
}

export interface ResultatEcritureSuivi extends Omit<Suivi, 'markdown'> {
  fichier: string;
}

/**
 * Écrit le suivi généré. Par défaut dans candidatures/_SUIVI.genere.md (aperçu à comparer) ; `remplacer`
 * écrit candidatures/_SUIVI.md ; `sortie` impose un fichier (relatif au dossier courant).
 */
export function ecrireSuivi(
  db: Base,
  dossierDonnees: string,
  o: { sortie?: string; remplacer?: boolean; le?: Date } = {},
): ResultatEcritureSuivi {
  const fichier = o.sortie
    ? resolve(o.sortie)
    : join(dossierDonnees, o.remplacer ? FICHIER_SUIVI : FICHIER_APERCU);
  const { markdown, ...comptes } = genererSuivi(db, dossierDonnees, o.le);
  mkdirSync(dirname(fichier), { recursive: true });
  writeFileSync(fichier, markdown, 'utf8');
  return { fichier, ...comptes };
}
