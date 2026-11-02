// Reprise de l'historique Markdown / JSON d'un dossier de données (lecture seule sur ces fichiers) :
// candidatures/_lots/*.json, candidatures/_ecartees.md, candidatures/_SUIVI.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { canoniser } from '../core/liens.ts';
import { entreesDuLot, noterEntree } from '../core/notation.ts';
import {
  ajouterNote,
  ajouterStatut,
  enregistrerCandidature,
  enregistrerOffre,
  modifierTags,

  type ChampsOffre,
} from '../core/offres.ts';
import type { Statut } from '../core/statuts.ts';
import { dateFr, empreinte, maintenant, sansMarkdown, trouverRemuneration } from '../core/texte.ts';
import { decouper, liensMarkdown, lignesTableaux, type LigneTableau } from './markdown.ts';

export interface LigneNonReconnue {
  fichier: string;
  ligne: number;
  raison: string;
  extrait: string;
}

export interface RapportImport {
  lots: { fichiers: number; entrees: number; offres_creees: number; notes_ajoutees: number; erreurs: LigneNonReconnue[] };
  registre: {
    lignes: number;
    offres: number;
    offres_creees: number;
    offres_sans_lien: number;
    statuts_ajoutes: number;
    notes_ajoutees: number;
    liens_non_reconnus: { ligne: number; url: string }[];
    non_reconnues: LigneNonReconnue[];
  };
  suivi: {
    lignes: number;
    offres_creees: number;
    candidatures: number;
    statuts_ajoutes: number;
    notes_ajoutees: number;
    non_reconnues: LigneNonReconnue[];
  };
}

const extrait = (s: string) => (s.length > 160 ? `${s.slice(0, 157)}…` : s);

function rapportVide(): RapportImport {
  return {
    lots: { fichiers: 0, entrees: 0, offres_creees: 0, notes_ajoutees: 0, erreurs: [] },
    registre: {
      lignes: 0,
      offres: 0,
      offres_creees: 0,
      offres_sans_lien: 0,
      statuts_ajoutes: 0,
      notes_ajoutees: 0,
      liens_non_reconnus: [],
      non_reconnues: [],
    },
    suivi: { lignes: 0, offres_creees: 0, candidatures: 0, statuts_ajoutes: 0, notes_ajoutees: 0, non_reconnues: [] },
  };
}

/** Cellule d'une ligne par nom de colonne (début du libellé, sans casse ni accents). */
function colonne(l: LigneTableau, ...noms: string[]): string | undefined {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();
  for (const nom of noms) {
    const i = l.entetes.findIndex((e) => norm(e).startsWith(norm(nom)));
    if (i >= 0) return l.cellules[i];
  }
  return undefined;
}

/** Notes d'une cellule « 6/10 », « 6 et 5,5/10 », « 7 · 6,5 · 4 » ; vide si ambiguë (« 4 à 7/10 », « ≤ 2,5 »). */
export function notesDeCellule(cellule: string): number[] {
  if (/[≤≥<>~≈]|(^|\s)à(\s|$)/.test(cellule)) return [];
  return (cellule.replace(/\/\s*10/g, '').match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => Number(n.replace(',', '.')))
    .filter((n) => n >= 0 && n <= 10);
}

/** Contrat, rémunération et télétravail lus dans une cellule « Conditions » ou « Type ». */
export function lireConditions(texte: string): Pick<ChampsOffre, 'contrat' | 'remuneration' | 'teletravail'> {
  const t = sansMarkdown(texte);
  const contrat = t.match(/\b(CDI|CDD|freelance|indépendant|portage|stage|alternance|intérim)\b/i)?.[1] ?? null;
  const tt =
    t.match(/(full remote|100 % (?:télétravail|remote)|full télétravail|full TT|télétravail[^,;·]*|remote[^,;·]*|hybride[^,;·]*)/i)?.[1] ??
    null;
  return {
    contrat: contrat ? contrat.charAt(0).toUpperCase() + contrat.slice(1) : null,
    remuneration: trouverRemuneration(t),
    teletravail: tt ? tt.trim() : null,
  };
}

/** Retire de la cellule les parenthèses qui ne contiennent que des liens « ([offre](…), [doublon](…)) ». */
function sansListeDeLiens(s: string): string {
  return s.replace(/\s*\(\s*(?:\[[^\]]*\]\([^)\s]*\)\s*,?\s*)+\)/g, '').replace(/\[[^\]]*\]\([^)\s]*\)/g, '');
}

// ---------------------------------------------------------------------------------------------
// Lots notés (_lots/*.json)
// ---------------------------------------------------------------------------------------------

function importerLots(db: Base, dossier: string, rapport: RapportImport): void {
  const dir = join(dossier, 'candidatures', '_lots');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    rapport.lots.fichiers++;
    const chemin = join(dir, f);
    const date = f.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? statSync(chemin).mtime.toISOString().slice(0, 10);
    let entrees;
    try {
      entrees = entreesDuLot(JSON.parse(readFileSync(chemin, 'utf8').replace(/^﻿/, '')));
    } catch (e) {
      rapport.lots.erreurs.push({ fichier: f, ligne: 0, raison: (e as Error).message, extrait: '' });
      continue;
    }
    transaction(db, () => {
      entrees.forEach((e, i) => {
        rapport.lots.entrees++;
        try {
          const r = noterEntree(db, e, {
            origine: 'import-lot',
            origineOffre: 'import-lot',
            le: date,
            siAbsent: true,
            recueLe: date,
          });
          if (r.creee) rapport.lots.offres_creees++;
          if (r.note_ajoutee) rapport.lots.notes_ajoutees++;
        } catch (err) {
          rapport.lots.erreurs.push({ fichier: f, ligne: i + 1, raison: (err as Error).message, extrait: extrait(e.url ?? '') });
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Registre des offres écartées (_ecartees.md)
// ---------------------------------------------------------------------------------------------

interface OffreRegistre {
  source: string;
  idSite: string;
  url: string | null;
  titre: string;
  entreprise: string;
  conditions: string;
  note: number | null;
}

export function offresDeLigneRegistre(l: LigneTableau): { offres: OffreRegistre[]; liensIgnores: string[] } {
  const entreprise = colonne(l, 'entreprise') ?? '';
  const poste = colonne(l, 'poste') ?? '';
  const conditions = colonne(l, 'conditions') ?? '';
  const notes = notesDeCellule(colonne(l, 'note') ?? '');
  const segments = decouper(poste, ' · ');
  const estLot = /^lot\b/i.test(sansMarkdown(entreprise));
  let entreprises = decouper(entreprise, ' · ');
  if (entreprises.length < 2) entreprises = decouper(entreprise, ' / ');
  const conds = decouper(conditions, ' · ');
  const offres: OffreRegistre[] = [];
  const liensIgnores: string[] = [];
  const vus = new Set<string>();

  segments.forEach((seg, k) => {
    const texte = sansMarkdown(sansListeDeLiens(seg));
    let ent = entreprises.length === segments.length ? sansMarkdown(entreprises[k]) : sansMarkdown(entreprise);
    let titre = texte;
    if (estLot && texte.includes(' — ')) {
      const i = texte.indexOf(' — ');
      ent = texte.slice(0, i).trim();
      titre = texte.slice(i + 3).trim();
    }
    const note = notes.length === segments.length ? notes[k] : notes.length === 1 ? notes[0] : null;
    const cond = conds.length === segments.length ? conds[k] : conditions;
    for (const lien of liensMarkdown(seg)) {
      const id = canoniser(lien.url);
      if (!id) {
        if (/^https?:/.test(lien.url)) liensIgnores.push(lien.url);
        continue;
      }
      const cle = `${id.source}:${id.idSite}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      offres.push({ source: id.source, idSite: id.idSite, url: id.url, titre, entreprise: ent, conditions: cond, note });
    }
  });
  // Liens placés dans les autres colonnes (entreprise, conditions).
  for (const lien of liensMarkdown(`${entreprise} ${conditions}`)) {
    const id = canoniser(lien.url);
    if (!id) {
      if (/^https?:/.test(lien.url)) liensIgnores.push(lien.url);
      continue;
    }
    const cle = `${id.source}:${id.idSite}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    offres.push({
      source: id.source,
      idSite: id.idSite,
      url: id.url,
      titre: sansMarkdown(sansListeDeLiens(poste)),
      entreprise: sansMarkdown(sansListeDeLiens(entreprise)),
      conditions,
      note: notes.length === 1 ? notes[0] : null,
    });
  }
  if (!offres.length) {
    // Ligne sans lien d'offre : une offre « registre » identifiée par son contenu, pour garder l'historique.
    const date = colonne(l, 'date') ?? '';
    offres.push({
      source: 'registre',
      idSite: `reg-${empreinte(`${date}|${sansMarkdown(entreprise)}|${sansMarkdown(poste)}`)}`,
      url: null,
      titre: sansMarkdown(sansListeDeLiens(poste)) || sansMarkdown(entreprise),
      entreprise: sansMarkdown(sansListeDeLiens(entreprise)),
      conditions,
      note: notes.length === 1 ? notes[0] : null,
    });
  }
  return { offres, liensIgnores };
}

function importerRegistre(db: Base, dossier: string, rapport: RapportImport): void {
  const chemin = join(dossier, 'candidatures', '_ecartees.md');
  if (!existsSync(chemin)) return;
  const R = rapport.registre;
  const lignes = lignesTableaux(readFileSync(chemin, 'utf8'));
  transaction(db, () => {
    for (const l of lignes) {
      const date = colonne(l, 'date');
      const entreprise = colonne(l, 'entreprise');
      if (date === undefined || entreprise === undefined || l.cellules.length !== l.entetes.length) {
        R.non_reconnues.push({ fichier: '_ecartees.md', ligne: l.numero, raison: 'ligne hors tableau Date / Entreprise', extrait: extrait(l.brut) });
        continue;
      }
      R.lignes++;
      const le = dateFr(date);
      const miseDeCote = /mis(es?)? de côté/i.test(l.section);
      const raison = sansMarkdown(colonne(l, 'raison') ?? '');
      const statut: Statut = /^go\b/i.test(raison) ? 'abandonnee' : 'ecartee';
      const commentaire = [le ? null : 'date inconnue', miseDeCote ? 'mise de côté' : null, raison || null]
        .filter(Boolean)
        .join(' — ');
      const { offres, liensIgnores } = offresDeLigneRegistre(l);
      for (const url of liensIgnores) R.liens_non_reconnus.push({ ligne: l.numero, url });
      for (const o of offres) {
        R.offres++;
        if (!o.url) R.offres_sans_lien++;
        const { offre, creee } = enregistrerOffre(
          db,
          o.source,
          o.idSite,
          { url_canonique: o.url, titre: o.titre, entreprise: o.entreprise, recue_le: le, ...lireConditions(o.conditions) },
          'import-registre',
        );
        if (creee) R.offres_creees++;
        if (o.note !== null && !db.prepare('SELECT 1 FROM notes WHERE offre_id = ?').get(offre.id)) {
          ajouterNote(db, offre.id, { note: o.note, ecarts: raison || null }, { origine: 'import-registre', le: le ?? maintenant() });
          R.notes_ajoutees++;
        }
        if (ajouterStatut(db, offre.id, statut, { commentaire, origine: 'import-registre', le: le ?? maintenant(), siAbsent: true })) {
          R.statuts_ajoutes++;
        }
        if (miseDeCote) modifierTags(db, offre.id, ['a-reprendre'], []);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Suivi des candidatures (_SUIVI.md)
// ---------------------------------------------------------------------------------------------

function statutEnCours(statut: string, envoye: string): Statut {
  if (/^\W*(à envoyer|à répondre)/i.test(statut) && !dateFr(envoye)) return 'go';
  if (/entretien/i.test(statut)) return 'entretien';
  if (/relance/i.test(statut) && dateFr(envoye)) return 'relancee';
  if (dateFr(envoye) || /envoy/i.test(statut) || /sans nouvelles/i.test(statut)) return 'envoyee';
  return 'go';
}

function statutClos(issue: string): Statut {
  if (/refus|perdue/i.test(issue)) return 'refus';
  if (/abandonn|écartée avant envoi|mise de côté|cv retiré|non envoyée/i.test(issue)) return 'abandonnee';
  return 'close';
}

/** Première offre identifiable dans le dossier de candidature (l'annonce), s'il existe. */
function offreDuDossier(dossierDonnees: string, cheminRelatif: string): ReturnType<typeof canoniser> {
  const chemin = join(dossierDonnees, cheminRelatif);
  if (!existsSync(chemin) || !statSync(chemin).isFile()) return null;
  const texte = readFileSync(chemin, 'utf8');
  for (const m of texte.matchAll(/https?:\/\/[^\s)<>"'\]]+/g)) {
    const id = canoniser(m[0]);
    if (id) return id;
  }
  return null;
}

function importerSuivi(db: Base, dossier: string, rapport: RapportImport): void {
  const chemin = join(dossier, 'candidatures', '_SUIVI.md');
  if (!existsSync(chemin)) return;
  const S = rapport.suivi;
  const lignes = lignesTableaux(readFileSync(chemin, 'utf8'));
  transaction(db, () => {
    for (const l of lignes) {
      const cellOffre = colonne(l, 'offre');
      if (!cellOffre || l.cellules.length !== l.entetes.length) {
        S.non_reconnues.push({ fichier: '_SUIVI.md', ligne: l.numero, raison: 'ligne hors tableau « Offre »', extrait: extrait(l.brut) });
        continue;
      }
      S.lignes++;
      const cellDossier = colonne(l, 'dossier') ?? '';
      const lienDossier = liensMarkdown(`${cellDossier} ${cellOffre}`).find((x) => !/^https?:/.test(x.url) && /\.md$|\/$/.test(x.url));
      const dossierRel = lienDossier ? posix.join('candidatures', posix.dirname(lienDossier.url.replace(/\\/g, '/'))) : null;
      const id = lienDossier ? offreDuDossier(dossier, posix.join('candidatures', lienDossier.url)) : null;

      const texteOffre = sansMarkdown(sansListeDeLiens(cellOffre));
      const gras = cellOffre.match(/\*\*([^*]+)\*\*/)?.[1];
      const i = texteOffre.indexOf(' — ');
      const entreprise = gras ?? (i > 0 ? texteOffre.slice(0, i) : texteOffre);
      const titre = i > 0 ? texteOffre.slice(i + 3) : texteOffre;
      const type = colonne(l, 'type') ?? '';
      const envoye = colonne(l, 'envoy') ?? '';
      const statutTexte = colonne(l, 'statut') ?? '';
      const issue = colonne(l, 'issue') ?? '';
      const envoyeeLe = dateFr(envoye);

      const source = id?.source ?? 'suivi';
      const idSite = id?.idSite ?? `suivi-${dossierRel ? posix.basename(dossierRel) : empreinte(texteOffre)}`;
      const { offre, creee } = enregistrerOffre(
        db,
        source,
        idSite,
        { url_canonique: id?.url ?? null, titre, entreprise, recue_le: envoyeeLe, ...lireConditions(type) },
        'import-suivi',
      );
      if (creee) S.offres_creees++;

      let statut: Statut;
      let commentaire: string;
      let le: string;
      if (/clos/i.test(l.section)) {
        statut = statutClos(issue);
        commentaire = sansMarkdown(sansListeDeLiens(issue));
        le = dateFr(issue) ?? maintenant();
      } else if (/ancienne/i.test(l.section)) {
        statut = 'envoyee';
        commentaire = 'sans réponse connue';
        le = envoyeeLe ?? maintenant();
      } else {
        statut = statutEnCours(statutTexte, envoye);
        commentaire = sansMarkdown(statutTexte);
        le = statut === 'envoyee' && envoyeeLe && envoyeeLe.length === 10 ? envoyeeLe : maintenant();
      }
      // Les imports se rejouent : on n'ajoute la ligne que si elle n'existe pas déjà.
      if (ajouterStatut(db, offre.id, statut, { commentaire, origine: 'import-suivi', le, siAbsent: true })) S.statuts_ajoutes++;

      const noteSuivi = `${statutTexte} ${issue}`.match(/\((\d+(?:[.,]\d+)?)\s*\/\s*10\)/);
      if (noteSuivi && !db.prepare('SELECT 1 FROM notes WHERE offre_id = ?').get(offre.id)) {
        ajouterNote(db, offre.id, { note: Number(noteSuivi[1].replace(',', '.')) }, { origine: 'import-suivi', le });
        S.notes_ajoutees++;
      }
      enregistrerCandidature(db, offre.id, {
        dossier: dossierRel,
        envoyee_le: envoyeeLe ?? (envoye && !/^[—-]$/.test(envoye.trim()) ? sansMarkdown(envoye) : null),
        canal: sansMarkdown(colonne(l, 'canal') ?? '') || null,
      });
      S.candidatures++;
    }
  });
}

/** Rejoue toute la reprise. Idempotent : relancer ne duplique ni offres, ni notes, ni statuts. */
export function importerHistorique(db: Base, dossierDonnees: string): RapportImport {
  const rapport = rapportVide();
  if (!existsSync(join(dossierDonnees, 'candidatures'))) {
    throw new Error(`Dossier candidatures/ introuvable dans ${dossierDonnees}`);
  }
  importerLots(db, dossierDonnees, rapport);
  importerRegistre(db, dossierDonnees, rapport);
  importerSuivi(db, dossierDonnees, rapport);
  return rapport;
}
