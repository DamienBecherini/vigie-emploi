// Reprise des journaux de candidature : sections « Suivi » des candidatures/*/dossier-candidature.md
// (dossiers actifs, pas _archives/) → événements (origine « import »). Lecture seule sur les dossiers ;
// idempotent : chaque ligne reprise a une empreinte (cle_import) et n'est créée qu'une fois.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { ajouterEvenement, type SaisieEvenement, type Sens, type TypeEvenement } from '../core/evenements.ts';
import { empreinte, sansMarkdown } from '../core/texte.ts';
import { enregistrerCandidature } from '../core/offres.ts';
import { cellules } from './markdown.ts';

export interface RapportJournal {
  dossiers: number;
  /** Dossiers sans offre en base (aucune candidature ne pointe vers eux). */
  dossiers_sans_offre: string[];
  /** Dossiers rattachés à la candidature sans dossier de la même entreprise (nom du dossier). */
  dossiers_rattaches: { dossier: string; offre_id: number }[];
  /** Dossiers sans section « Suivi » exploitable. */
  dossiers_sans_suivi: string[];
  lignes: number;
  evenements_crees: number;
  evenements_existants: number;
  /** Événements repris d'une ligne qui a disparu du dossier (jamais modifiés depuis) : supprimés. */
  evenements_retires: number;
  echeances: number;
  par_type: Record<string, number>;
  /** Lignes reprises en « note » faute de type reconnu. */
  non_typees: { dossier: string; ligne: number; extrait: string }[];
  /** Lignes cochées ou de journal sans date : non reprises. */
  sans_date: { dossier: string; ligne: number; extrait: string }[];
}

export interface LigneJournal {
  numero: number;
  le: string;
  texte: string;
}

const extrait = (s: string) => {
  const t = sansMarkdown(s);
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
};

const deux = (n: number | string) => String(n).padStart(2, '0');

/** Première date du texte : JJ/MM/AAAA, sinon JJ/MM (année du contexte). */
function dateDuTexte(texte: string, anneeParDefaut: number): string | null {
  const complete = texte.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/);
  if (complete) return `${complete[3]}-${deux(complete[2])}-${deux(complete[1])}`;
  const courte = texte.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (courte && Number(courte[2]) <= 12 && Number(courte[1]) <= 31) return `${anneeParDefaut}-${deux(courte[2])}-${deux(courte[1])}`;
  return null;
}

/**
 * Lignes datées de la ou des sections « Suivi » d'un dossier : tableaux Date | Événement, puces
 * « - 13/10/2026 — … » et cases cochées « - [x] Candidature envoyée le : 13/10/2026 (…) ». Les cases non
 * cochées (à faire) et les blocs de code sont ignorés.
 */
export function lignesDuSuivi(texte: string, anneeParDefaut = new Date().getFullYear()): { lignes: LigneJournal[]; sansDate: { numero: number; texte: string }[]; section: boolean } {
  const lignes = texte.split(/\r?\n/);
  const r: LigneJournal[] = [];
  const sansDate: { numero: number; texte: string }[] = [];
  let dansSuivi = false;
  let section = false;
  let code = false;
  let entetes: string[] | null = null;
  let annee = anneeParDefaut;
  const garder = (numero: number, le: string | null, t: string) => {
    const propre = t.trim();
    if (!propre) return;
    if (!le) {
      sansDate.push({ numero, texte: propre });
      return;
    }
    annee = Number(le.slice(0, 4));
    r.push({ numero, le, texte: propre });
  };
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (/^\s*(```|~~~)/.test(l)) {
      code = !code;
      continue;
    }
    if (code) continue;
    const titre = l.match(/^(#{1,6})\s+(.*)$/);
    if (titre) {
      dansSuivi = /\bsuivi\b/i.test(titre[2]) && titre[1].length >= 2;
      if (dansSuivi) section = true;
      entetes = null;
      continue;
    }
    if (!dansSuivi) continue;
    const t = l.trim();
    if (t.startsWith('|')) {
      const c = cellules(t);
      if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
      if (!entetes) {
        entetes = c.map((x) => x.toLowerCase());
        continue;
      }
      const iDate = entetes.findIndex((e) => e.startsWith('date'));
      const iTexte = entetes.findIndex((e) => /^(événement|evenement|action|quoi)/.test(e));
      if (iDate < 0) continue;
      const texteLigne = iTexte >= 0 ? c[iTexte] : c.filter((_, k) => k !== iDate).join(' — ');
      garder(i + 1, dateDuTexte(c[iDate] ?? '', annee), texteLigne ?? '');
      continue;
    }
    entetes = null;
    const puce = t.match(/^[-*+]\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (!puce) continue;
    if (puce[1] === ' ') continue; // case non cochée : à faire, pas un événement
    const contenu = puce[2];
    // « 13/10/2026 — texte » : la date en tête est retirée du texte.
    const tete = contenu.match(/^\**(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\**\s*(?:—|–|-|:)\s*(.*)$/);
    if (tete) garder(i + 1, dateDuTexte(tete[1], annee), tete[2]);
    else garder(i + 1, dateDuTexte(contenu, annee), contenu);
  }
  return { lignes: r, sansDate, section };
}

/** Type et sens devinés d'une ligne de journal (meilleur effort ; « note » à défaut). */
export function devinerType(texte: string): { type: TypeEvenement; sens: Sens | null; reconnu: boolean } {
  const t = sansMarkdown(texte).toLowerCase();
  // Sens : le premier indice qui apparaît (« Brief reçu par e-mail … réponse envoyée » → reçu).
  const sansNegation = t.replace(/\b(non|pas|jamais) envoy\w*|avant (l')?envoi/g, ' ');
  const iEnvoye = sansNegation.search(/\b(envoy|relanc)/);
  const iRecu = sansNegation.search(/reçue?\b|\bentrant|\be-?mail de\b|\bmessage de\b|\bréponse (client|de (?!\d)|du (?!\d)|d')|\bretour de\b/);
  const sens: Sens | null =
    iEnvoye < 0 && iRecu < 0 ? null : iRecu < 0 ? 'envoye' : iEnvoye < 0 ? 'recu' : iEnvoye < iRecu ? 'envoye' : 'recu';
  const type = ((): TypeEvenement | null => {
    if (/^(message entrant|e-?mail de|mail de|message de)\b/.test(t)) return 'message';
    if ((/^(proposition|devis)\b/.test(t) || /\b(proposition|devis) (envoy|reçu|transmi)/.test(t)) && !/proposition d'offre/.test(t)) {
      return 'proposition';
    }
    if (/(^|[^\p{L}])(refus|non retenu|clos|clôtur|abandonn|mise? de côté|mise en pause|perdue|go(?!\p{L}))/u.test(t)) return 'decision';
    if (/\b(test technique|case study|exercice|questionnaire technique)\b/.test(t)) return 'test';
    if (/^(appel|entretien|visio|rendez-vous|rdv)\b|\b(appel|entretien|visio) (à \d|avec\b|le \d)/.test(t)) return 'entretien';
    if (sens) return 'message';
    return null;
  })();
  if (!type) return { type: 'note', sens: null, reconnu: false };
  if (type === 'message' && /^(message entrant|e-?mail de|mail de|message de)\b/.test(t)) return { type, sens: 'recu', reconnu: true };
  return { type, sens: ['message', 'proposition', 'test'].includes(type) ? sens : null, reconnu: true };
}

/** Montant (« 3 000 € HT », « 450 €/j ») et jours (« 6 jours ») d'une proposition. */
function montantEtJours(texte: string): Pick<SaisieEvenement, 'montant' | 'unite' | 'jours'> {
  const t = sansMarkdown(texte).replace(/ | /g, ' ');
  const m = t.match(/(\d{1,3}(?:[ .]\d{3})+|\d+(?:,\d+)?)\s*(€\s*HT|€\s*\/\s*j|K€\s*\/\s*an|K€|€)/i);
  const j = t.match(/(\d+(?:,\d+)?)\s*(?:jours|j)\b(?!\s*cumul)/i);
  return {
    montant: m ? Number(m[1].replace(/[ .]/g, '').replace(',', '.')) : null,
    unite: m ? m[2].replace(/\s+/g, ' ').replace(/€ \/ j/, '€/j').replace(/K€ \/ an/i, 'K€/an') : null,
    jours: j ? Number(j[1].replace(',', '.')) : null,
  };
}

/** Liens Markdown relatifs et chemins entre accents graves qui désignent un fichier existant. */
function fichiersCites(texte: string, dossierDonnees: string, dossierRel: string): string[] {
  const trouves = new Set<string>();
  const essayer = (brut: string, base: string) => {
    const p = brut.trim().replace(/^<|>$/g, '').split('#')[0];
    if (!p || /^[a-z]+:/i.test(p) || p.startsWith('/')) return;
    let decode = p;
    try {
      decode = decodeURIComponent(p);
    } catch {
      /* lien mal encodé : tel quel */
    }
    const rel = posix.normalize(posix.join(base, decode));
    if (rel.startsWith('..') || rel.split('/').some((s) => s.startsWith('.'))) return;
    const abs = join(dossierDonnees, ...rel.split('/'));
    if (existsSync(abs) && statSync(abs).isFile()) trouves.add(rel);
  };
  for (const m of texte.matchAll(/\]\(([^)\s]+)\)/g)) essayer(m[1], dossierRel);
  for (const m of texte.matchAll(/`([^`\s]+\.[a-z0-9]{2,5})`/gi)) {
    essayer(m[1], dossierRel);
    essayer(m[1], '');
  }
  return [...trouves];
}

/** Résumé court : première phrase (ou 200 caractères) du texte sans Markdown. */
function resumeDe(texte: string): string {
  const t = sansMarkdown(texte).replace(/\s*\(\s*\)/g, '');
  const phrase = t.match(/^(.{20,200}?[.!?])(\s|$)/)?.[1] ?? t;
  return phrase.length > 200 ? `${phrase.slice(0, 197)}…` : phrase;
}

const mots = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3);

/**
 * Candidature sans dossier dont tous les mots de l'entreprise (3 lettres et plus) figurent dans le nom du
 * dossier (« Hippocrate Care » → hippocrate-care-cto-cofondateur), si elle est unique.
 */
function candidatureDuNom(db: Base, nom: string): number | null {
  const motsDossier = new Set(mots(nom));
  const candidates = (
    db
      .prepare('SELECT c.offre_id, o.entreprise FROM candidatures c JOIN offres o ON o.id = c.offre_id WHERE c.dossier IS NULL')
      .all() as { offre_id: number; entreprise: string | null }[]
  ).filter((c) => {
    const m = mots(c.entreprise ?? '');
    return m.length > 0 && m.every((x) => motsDossier.has(x));
  });
  return candidates.length === 1 ? candidates[0].offre_id : null;
}

/** Reprend les journaux des dossiers de candidature actifs. */
export function importerJournaux(db: Base, dossierDonnees: string): RapportJournal {
  const rapport: RapportJournal = {
    dossiers: 0,
    dossiers_sans_offre: [],
    dossiers_rattaches: [],
    dossiers_sans_suivi: [],
    lignes: 0,
    evenements_crees: 0,
    evenements_existants: 0,
    evenements_retires: 0,
    echeances: 0,
    par_type: {},
    non_typees: [],
    sans_date: [],
  };
  const racine = join(dossierDonnees, 'candidatures');
  if (!existsSync(racine)) return rapport;
  const noms = readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
  const offreDu = db.prepare('SELECT offre_id FROM candidatures WHERE dossier = ? OR dossier = ?');
  const existants = db.prepare("SELECT id, cle_import, maj_le FROM evenements WHERE offre_id = ? AND origine = 'import' AND cle_import LIKE 'suivi:%'");
  transaction(db, () => {
    for (const nom of noms) {
      const fiche = join(racine, nom, 'dossier-candidature.md');
      if (!existsSync(fiche)) continue;
      rapport.dossiers++;
      const dossierRel = `candidatures/${nom}`;
      let lien = offreDu.get(dossierRel, `${dossierRel}/`) as { offre_id: number } | undefined;
      if (!lien) {
        const offreId = candidatureDuNom(db, nom);
        if (offreId === null) {
          rapport.dossiers_sans_offre.push(dossierRel);
          continue;
        }
        enregistrerCandidature(db, offreId, { dossier: dossierRel }, { origine: 'import-suivi' });
        rapport.dossiers_rattaches.push({ dossier: dossierRel, offre_id: offreId });
        lien = { offre_id: offreId };
      }
      const texte = readFileSync(fiche, 'utf8');
      const { lignes, sansDate, section } = lignesDuSuivi(texte);
      if (!section || (!lignes.length && !sansDate.length)) rapport.dossiers_sans_suivi.push(dossierRel);
      for (const s of sansDate) rapport.sans_date.push({ dossier: dossierRel, ligne: s.numero, extrait: extrait(s.texte) });
      const cles = new Set<string>();
      const deja = new Map(
        (existants.all(lien.offre_id) as { id: number; cle_import: string; maj_le: string | null }[]).map((e) => [e.cle_import, e]),
      );
      for (const l of lignes) {
        rapport.lignes++;
        const cle = `suivi:${empreinte(`${l.le}|${l.texte}`)}`;
        if (cles.has(cle)) continue;
        cles.add(cle);
        const devine = devinerType(l.texte);
        rapport.par_type[devine.type] = (rapport.par_type[devine.type] ?? 0) + 1;
        if (!devine.reconnu) rapport.non_typees.push({ dossier: dossierRel, ligne: l.numero, extrait: extrait(l.texte) });
        if (deja.has(cle)) {
          rapport.evenements_existants++;
          continue;
        }
        const resume = resumeDe(l.texte);
        const details = sansMarkdown(l.texte) === resume ? null : l.texte;
        const e = ajouterEvenement(
          db,
          lien.offre_id,
          {
            type: devine.type,
            sens: devine.sens,
            le: l.le,
            resume,
            details,
            fichiers: fichiersCites(l.texte, dossierDonnees, dossierRel),
            ...(devine.type === 'proposition' ? montantEtJours(l.texte) : {}),
          },
          'import',
          { cleImport: cle },
        );
        rapport.evenements_crees++;
        if (!e.fait) rapport.echeances++;
      }
      // Ligne disparue ou réécrite dans le dossier : l'événement repris (jamais modifié depuis) est retiré.
      for (const [cle, e] of deja) {
        if (!cles.has(cle) && !e.maj_le) {
          db.prepare('DELETE FROM evenements WHERE id = ?').run(e.id);
          rapport.evenements_retires++;
        }
      }
    }
  });
  return rapport;
}
