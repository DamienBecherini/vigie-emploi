// Ingestion de la boîte de réception : .eml → offres en base, puis suppression des e-mails traités.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Base } from '../db/base.ts';
import type { Config } from '../core/config.ts';
import { transaction } from '../db/base.ts';
import { SOURCES_JSONLD } from '../core/liens.ts';
import { ajouterStatut, enregistrerOffre, modifierTags, offresDeLEntreprise, trouverOffre } from '../core/offres.ts';
import { maintenant } from '../core/texte.ts';
import { STATUTS_SUIVIS } from '../core/statuts.ts';
import { ajouterEvenement, dateEvenementFr, jourLocal } from '../core/evenements.ts';
import { lireEmail, type OffreEmail } from './eml.ts';
import { extraireJsonLd, telechargerPage, type DetailJsonLd, type Telechargeur } from './jsonld.ts';

export interface OptionsIngest {
  dossierEmails: string;
  /** Garder les .eml après traitement. */
  garder?: boolean;
  /** Lire le JSON-LD des pages Hellowork / Free-Work. */
  telecharger?: boolean;
  titresExclus?: RegExp[];
  employeursRefuses?: RegExp[];
  telechargeur?: Telechargeur;
  /** Pause entre deux téléchargements (ms). */
  pause?: number;
}

export interface OffreIngeree {
  id: number;
  source: string;
  url: string;
  titre: string;
  entreprise: string | null;
  statut: string;
  motif?: string;
  a_description?: boolean;
}

export interface ResumeIngest {
  fichiers: number;
  fichiers_supprimes: number;
  offres_trouvees: number;
  nouvelles: number;
  doublons: number;
  ecartees: number;
  /** Nouvelles offres sans description : à lire dans le navigateur. */
  a_lire: number;
  /** Nouvelles offres dont la description a été lue (JSON-LD). */
  avec_description: number;
  erreurs: { fichier?: string; url?: string; message: string }[];
  detail: { nouvelles: OffreIngeree[]; ecartees: OffreIngeree[]; doublons: OffreIngeree[] };
}

function motifExclusion(texte: string, motifs: RegExp[]): string | null {
  for (const re of motifs) {
    const m = texte.match(re);
    if (m) return m[0];
  }
  return null;
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ingerer(db: Base, o: OptionsIngest): Promise<ResumeIngest> {
  const titresExclus = o.titresExclus ?? [];
  const refuses = o.employeursRefuses ?? [];
  const telechargeur = o.telechargeur ?? telechargerPage;
  const resume: ResumeIngest = {
    fichiers: 0,
    fichiers_supprimes: 0,
    offres_trouvees: 0,
    nouvelles: 0,
    doublons: 0,
    ecartees: 0,
    a_lire: 0,
    avec_description: 0,
    erreurs: [],
    detail: { nouvelles: [], ecartees: [], doublons: [] },
  };

  let fichiers: string[];
  try {
    fichiers = readdirSync(o.dossierEmails)
      .filter((f) => f.toLowerCase().endsWith('.eml'))
      .sort();
  } catch {
    throw new Error(`Boîte de réception introuvable : ${o.dossierEmails}`);
  }
  resume.fichiers = fichiers.length;

  // 1. Lecture de tous les e-mails, fusion des offres (la première occurrence garde la date de réception).
  const offres = new Map<string, OffreEmail>();
  const lus: string[] = [];
  for (const f of fichiers) {
    const chemin = join(o.dossierEmails, f);
    try {
      const email = await lireEmail(readFileSync(chemin));
      for (const off of email.offres) {
        const deja = offres.get(off.url);
        if (!deja) offres.set(off.url, off);
        else if (off.titre.length > deja.titre.length) deja.titre = off.titre;
      }
      lus.push(chemin);
    } catch (e) {
      resume.erreurs.push({ fichier: f, message: (e as Error).message });
    }
  }
  resume.offres_trouvees = offres.size;

  // 2. Tri : doublons (déjà en base), exclusions sur l'intitulé, lecture JSON-LD.
  for (const off of offres.values()) {
    const existante = trouverOffre(db, off.source, off.idSite);
    if (existante) {
      resume.doublons++;
      resume.detail.doublons.push({
        id: existante.id,
        source: off.source,
        url: off.url,
        titre: existante.titre || off.titre,
        entreprise: existante.entreprise,
        statut: existante.statut,
      });
      // Offre déjà suivie revue dans une alerte : son statut ne bouge pas, une trace au journal (une par jour).
      if (STATUTS_SUIVIS.includes(existante.statut)) {
        const jour = jourLocal();
        const cle = `revue:${off.source}:${jour}`;
        if (!db.prepare('SELECT 1 FROM evenements WHERE offre_id = ? AND cle_import = ?').get(existante.id, cle)) {
          ajouterEvenement(
            db,
            existante.id,
            { type: 'note', le: jour, fait: true, resume: `Revue le ${dateEvenementFr(jour)} dans une alerte ${off.source} : statut inchangé`, details: off.sujet || null },
            'import',
            { cleImport: cle },
          );
        }
      }
      continue;
    }
    let motif = motifExclusion(off.titre, refuses) ?? motifExclusion(off.titre, titresExclus);
    let detail: DetailJsonLd | null = null;
    if (!motif && o.telecharger !== false && SOURCES_JSONLD.includes(off.source)) {
      try {
        detail = extraireJsonLd(await telechargeur(off.url));
        if (!detail) resume.erreurs.push({ url: off.url, message: 'JSON-LD JobPosting absent de la page' });
      } catch (e) {
        resume.erreurs.push({ url: off.url, message: `lecture impossible : ${(e as Error).message}` });
      }
      if (o.pause) await attendre(o.pause);
      if (detail) {
        const m = motifExclusion(`${detail.entreprise ?? ''} ${(detail.description ?? '').slice(0, 600)}`, refuses);
        if (m) motif = `employeur refusé : ${m}`;
      }
    }
    const le = maintenant();
    transaction(db, () => {
      const { offre } = enregistrerOffre(
        db,
        off.source,
        off.idSite,
        {
          url_canonique: off.url,
          titre: detail?.titre ?? off.titre,
          entreprise: detail?.entreprise,
          lieu: detail?.lieu,
          contrat: detail?.contrat,
          remuneration: detail?.remuneration,
          teletravail: detail?.teletravail,
          publiee_le: detail?.publiee_le,
          description: detail?.description,
          recue_le: off.recueLe,
        },
        'email',
        { le },
      );
      const ligne: OffreIngeree = {
        id: offre.id,
        source: offre.source,
        url: off.url,
        titre: offre.titre,
        entreprise: offre.entreprise,
        statut: 'nouvelle',
        a_description: Boolean(offre.description),
      };
      if (motif) {
        const commentaire = motif.startsWith('employeur') ? motif : `intitulé exclu : ${motif}`;
        ajouterStatut(db, offre.id, 'ecartee', { commentaire, origine: 'ingest', le });
        resume.ecartees++;
        resume.detail.ecartees.push({ ...ligne, statut: 'ecartee', motif: commentaire });
      } else {
        ajouterStatut(db, offre.id, 'nouvelle', { commentaire: off.sujet || null, origine: 'ingest', le });
        if (offre.entreprise && offresDeLEntreprise(db, offre.entreprise, offre.id) > 0) {
          modifierTags(db, offre.id, ['entreprise-connue'], []);
        }
        resume.nouvelles++;
        if (offre.description) resume.avec_description++;
        else resume.a_lire++;
        resume.detail.nouvelles.push(ligne);
      }
    });
  }

  db.prepare(
    'INSERT INTO ingestions (le, fichiers, nouvelles, doublons, ecartees, erreurs) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(maintenant(), resume.fichiers, resume.nouvelles, resume.doublons, resume.ecartees, resume.erreurs.length);

  // 3. Suppression des e-mails lus sans erreur (toutes leurs offres sont en base).
  if (!o.garder) {
    for (const chemin of lus) {
      rmSync(chemin);
      resume.fichiers_supprimes++;
    }
  }
  return resume;
}

/** Ingestion avec les réglages de la configuration (CLI et MCP). */
export function ingererSelonConfig(
  db: Base,
  config: Pick<Config, 'emails' | 'telechargerJsonLd' | 'titresExclus' | 'employeursRefuses'>,
  o: { garder?: boolean; telecharger?: boolean; dossierEmails?: string } = {},
): Promise<ResumeIngest> {
  return ingerer(db, {
    dossierEmails: o.dossierEmails ?? config.emails,
    garder: Boolean(o.garder),
    telecharger: o.telecharger === false ? false : config.telechargerJsonLd,
    titresExclus: config.titresExclus,
    employeursRefuses: config.employeursRefuses,
    pause: 400,
  });
}
