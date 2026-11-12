// Ingestion de la boîte de réception : .eml → offres en base, puis suppression des e-mails traités.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
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
import { t } from '../i18n/index.ts';

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
  /** E-mails lus sans aucune offre reconnue : conservés (format inconnu, à signaler). */
  sans_offre: string[];
  /**
   * Accusés de réception de candidature : leurs liens ne deviennent pas des offres. `offres_connues` = offres
   * de l'e-mail déjà en base (id, statut). À l'IA de vérifier que la candidature est enregistrée comme envoyée.
   */
  confirmations: { fichier: string; sujet: string; date: string | null; offres_connues: { id: number; statut: string; titre: string }[] }[];
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
    sans_offre: [],
    confirmations: [],
    detail: { nouvelles: [], ecartees: [], doublons: [] },
  };

  let fichiers: string[];
  try {
    fichiers = readdirSync(o.dossierEmails)
      .filter((f) => f.toLowerCase().endsWith('.eml'))
      .sort();
  } catch {
    throw new Error(t('core.ingest.boite', { dossier: o.dossierEmails }));
  }
  resume.fichiers = fichiers.length;

  // 1. Lecture de tous les e-mails, fusion des offres (la première occurrence garde la date de réception).
  const offres = new Map<string, OffreEmail>();
  const lus: string[] = [];
  for (const f of fichiers) {
    const chemin = join(o.dossierEmails, f);
    try {
      const email = await lireEmail(readFileSync(chemin));
      if (email.confirmation) {
        const connues = email.offres
          .map((off) => trouverOffre(db, off.source, off.idSite))
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .map((x) => ({ id: x.id, statut: x.statut, titre: x.titre }));
        resume.confirmations.push({ fichier: f, sujet: email.sujet, date: email.date, offres_connues: connues });
        lus.push(chemin);
        continue;
      }
      for (const off of email.offres) {
        const deja = offres.get(off.url);
        if (!deja) offres.set(off.url, off);
        else if (off.titre.length > deja.titre.length) deja.titre = off.titre;
      }
      // Aucune offre reconnue : format inconnu, l'e-mail est gardé pour ne rien perdre.
      if (email.offres.length === 0) resume.sans_offre.push(f);
      else lus.push(chemin);
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
            { type: 'note', le: jour, fait: true, resume: t('core.ingest.revue', { date: dateEvenementFr(jour), source: off.source }), details: off.sujet || null },
            'import',
            { cleImport: cle },
          );
        }
      }
      continue;
    }
    const exclu = motifExclusion(off.titre, refuses) ?? motifExclusion(off.titre, titresExclus);
    let motif = exclu ? t('core.ingest.intituleExclu', { motif: exclu }) : null;
    let detail: DetailJsonLd | null = null;
    if (!motif && o.telecharger !== false && SOURCES_JSONLD.includes(off.source)) {
      try {
        detail = extraireJsonLd(await telechargeur(off.url));
        if (!detail) resume.erreurs.push({ url: off.url, message: t('core.ingest.sansJsonLd') });
      } catch (e) {
        resume.erreurs.push({ url: off.url, message: t('core.ingest.lectureImpossible', { message: (e as Error).message }) });
      }
      if (o.pause) await attendre(o.pause);
      if (detail) {
        const m = motifExclusion(`${detail.entreprise ?? ''} ${(detail.description ?? '').slice(0, 600)}`, refuses);
        if (m) motif = t('core.ingest.employeurRefuse', { motif: m });
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
          entreprise: detail?.entreprise ?? off.entreprise,
          lieu: detail?.lieu ?? off.lieu,
          contrat: detail?.contrat,
          remuneration: detail?.remuneration ?? off.remuneration,
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
        const commentaire = motif;
        ajouterStatut(db, offre.id, 'ecartee', { commentaire, origine: 'ingest', le });
        resume.ecartees++;
        resume.detail.ecartees.push({ ...ligne, statut: 'ecartee', motif: commentaire });
      } else {
        ajouterStatut(db, offre.id, 'nouvelle', { commentaire: off.sujet ? t('core.ingest.email', { sujet: off.sujet }) : null, origine: 'ingest', le });
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

  // 3. Suppression des e-mails lus sans erreur et dont les offres sont en base.
  if (!o.garder) {
    // unlinkSync et non rmSync : sous Windows, rmSync ne supprimait rien, sans erreur, sur certains noms
    // (crochets, « ... »), et l'e-mail revenait au lot suivant. Chaque suppression est vérifiée.
    for (const chemin of lus) {
      try {
        unlinkSync(chemin);
        if (existsSync(chemin)) throw new Error(t('core.ingest.toujoursPresent'));
        resume.fichiers_supprimes++;
      } catch (e) {
        resume.erreurs.push({ fichier: basename(chemin), message: t('core.ingest.nonSupprime', { message: (e as Error).message }) });
      }
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
