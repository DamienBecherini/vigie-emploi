// Interface en ligne de commande de postuler-juste (pensée pour être pilotée par une IA : sorties JSON stables).
// Les messages suivent la langue configurée (clé « langue », français par défaut) ; les noms des commandes,
// des options et des statuts restent en français, et les sorties --json ne changent pas avec la langue.
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chargerConfig, langueConfiguree, type Config } from '../core/config.ts';
import { ouvrirBase, type Base } from '../db/base.ts';
import { ingererSelonConfig } from '../ingest/ingest.ts';
import { importerHistorique } from '../import/historique.ts';
import { listerOffres, type OptionsListe } from '../core/requetes.ts';
import {
  ajouterStatut,
  detailOffre,
  modifierLien,
  modifierTags,
  offreParId,
  type ChampsCandidature,
  type DetailOffre,
} from '../core/offres.ts';
import { entreesDuLot, type EntreeLot } from '../core/notation.ts';
import { noterOffres, offresALire, preparerCandidature, suivreCandidature } from '../core/actions.ts';
import { estStatut, STATUTS } from '../core/statuts.ts';
import { ecrireSuivi } from '../export/suivi.ts';
import { demarrerServeur } from '../api/serveur.ts';
import {
  ajouterEvenement,
  echeances,
  evenementOuErreur,
  journal,
  marquerFait,
  TYPES_EVENEMENT,
  type EvenementJournal,
  type SaisieEvenement,
} from '../core/evenements.ts';
import { fichiersDossier } from '../core/fichiers.ts';
import { statistiques } from '../core/statistiques.ts';
import { consignesIa, noteExemple, type Decomposition } from '../core/grille.ts';
import {
  cheminGrille,
  grilleCourante,
  grilleObligatoire,
  historiqueGrille,
  initialiserGrille,
  modifierGrille,
  renoter,
  restaurerGrille,
  versionGrille,
  type Impact,
} from '../core/grille-stockage.ts';
import { initialiserEspace } from '../init/init.ts';
import { compterTexte } from '../core/compter.ts';
import { choisirGabarit, GABARIT_DEFAUT, genererCv, listerGabarits, trouverNavigateur } from '../cv/cv.ts';
import { decimal, definirLangue, estLangue, langueCourante, LANGUES, t } from '../i18n/index.ts';
import { libelleNiveau, libelleStatut, libelleType, messageDrapeau } from '../i18n/libelles.ts';
import { analyserPages } from '../cv/pages.ts';

function aide(): string {
  return t('cli.aide', { statuts: STATUTS.join(', '), types: TYPES_EVENEMENT.join('|') });
}

type Valeurs = Record<string, string | boolean | string[] | undefined>;

function erreur(message: string): never {
  throw Object.assign(new Error(message), { utilisateur: true });
}

function json(x: unknown): void {
  process.stdout.write(`${JSON.stringify(x, null, 2)}\n`);
}

function entier(v: unknown, nom: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) erreur(t('cli.invalide', { nom, valeur: String(v) }));
  return n;
}

function nombre(v: unknown, nom: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) erreur(t('cli.invalide', { nom, valeur: String(v) }));
  return n;
}

function liste(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function tronquer(s: string | null | undefined, n: number): string {
  const x = (s ?? '').replace(/\s+/g, ' ');
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

function tableau(entetes: string[], lignes: string[][]): string {
  const largeurs = entetes.map((e, i) => Math.max(e.length, ...lignes.map((l) => (l[i] ?? '').length)));
  const ligne = (l: string[]) => l.map((c, i) => (c ?? '').padEnd(largeurs[i])).join('  ').trimEnd();
  return [ligne(entetes), largeurs.map((w) => '-'.repeat(w)).join('  '), ...lignes.map(ligne)].join('\n');
}

/** Date d'un événement : « 05/11/2026 14 h 30 » (français) ou « 05/11/2026 14:30 » (anglais). */
function dateEvenement(le: string): string {
  const m = le.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return le;
  const heure = m[4] ? (langueCourante() === 'fr' ? ` ${m[4]} h ${m[5]}` : ` ${m[4]}:${m[5]}`) : '';
  return `${m[3]}/${m[2]}/${m[1]}${heure}`;
}

const OPTIONS_GENERALES = {
  data: { type: 'string' },
  config: { type: 'string' },
  json: { type: 'boolean' },
  aide: { type: 'boolean', short: 'h' },
  help: { type: 'boolean' },
} as const;

function analyser(args: string[], options: Record<string, { type: 'string' | 'boolean'; short?: string; multiple?: boolean }>) {
  const { values, positionals } = parseArgs({
    args,
    options: { ...OPTIONS_GENERALES, ...options },
    allowPositionals: true,
    allowNegative: true,
    strict: true,
  });
  return { v: values as Valeurs, pos: positionals };
}

interface Contexte {
  config: Config;
  db: Base;
}

function contexte(v: Valeurs): Contexte {
  const config = chargerConfig({
    dossierDonnees: v.data as string | undefined,
    fichierConfig: v.config as string | undefined,
  });
  return { config, db: ouvrirBase(config.base) };
}

function afficherDetail(d: DetailOffre): string {
  const l: string[] = [];
  const langue = langueCourante();
  l.push(`#${d.id} ${d.titre}${d.entreprise ? ` — ${d.entreprise}` : ''}`);
  l.push(t('cli.detail.statut', { statut: libelleStatut(d.statut, langue), note: d.note ?? '—', source: d.source, id_site: d.id_site }));
  if (d.url_canonique) l.push(t('cli.detail.url', { url: d.url_canonique }));
  const infos = [d.lieu, d.contrat, d.remuneration, d.teletravail && t('cli.detail.teletravail', { valeur: d.teletravail })].filter(Boolean);
  if (infos.length) l.push(infos.join(' · '));
  l.push(t('cli.detail.dates', { recue: d.recue_le ?? '—', publiee: d.publiee_le ?? '—' }));
  if (d.stack) l.push(t('cli.detail.stack', { stack: d.stack }));
  if (d.tags.length) l.push(t('cli.detail.tags', { tags: d.tags.join(', ') }));
  const n = d.notes[0];
  if (n?.decomposition) {
    l.push(
      '',
      t('cli.detail.noteGrille', { note: n.note, version: n.grille_version, exacte: n.note_exacte, le: n.notee_le }),
      ...lignesDecomposition(n.decomposition),
    );
    if (n.colle) l.push(t('cli.detail.colle', { texte: n.colle }));
    if (n.ecarts) l.push(t('cli.detail.ecarts', { texte: n.ecarts }));
  } else if (n) {
    l.push(
      '',
      t('cli.detail.noteAncienne', {
        note: n.note ?? '—',
        brute: n.note_brute ?? '—',
        penalites: n.penalites ? t('cli.detail.penalites', { penalites: n.penalites }) : '',
        le: n.notee_le,
      }),
    );
    if (n.colle) l.push(t('cli.detail.colle', { texte: n.colle }));
    if (n.ecarts) l.push(t('cli.detail.ecarts', { texte: n.ecarts }));
  }
  if (d.candidature) {
    const c = d.candidature;
    const infosCandidature = [c.dossier, c.canal, c.envoyee_le && t('cli.detail.envoyeeLe', { date: c.envoyee_le })].filter(Boolean).join(' · ');
    l.push('', t('cli.detail.candidature', { infos: infosCandidature }));
    if (c.prochaine_action) l.push(t('cli.detail.prochaineAction', { texte: c.prochaine_action }));
  }
  if (d.evenements.length) l.push('', t('cli.detail.journal'), ...d.evenements.map(ligneJournal));
  if (d.statuts.length) {
    l.push('', t('cli.detail.historique'));
    for (const s of d.statuts) l.push(`  ${s.le.slice(0, 10)}  ${s.statut.padEnd(10)} ${tronquer(s.commentaire, 100)}`);
  }
  if (d.description) l.push('', t('cli.detail.description'), d.description);
  return l.join('\n');
}

function virgule(n: number, d = 2): string {
  return decimal(n, langueCourante(), d);
}

/** Décomposition d'une note : un critère par ligne, puis règles et drapeaux. */
function lignesDecomposition(d: Decomposition): string[] {
  const l = d.criteres.map(
    (c) =>
      `  ${c.libelle.padEnd(26)} ${virgule(c.note, 1).padStart(4)} × ${String(Math.round(c.poids_normalise * 100)).padStart(3)} % = ${virgule(c.contribution).padStart(5)}` +
      `  ${c.origine === 'neutre' ? t('cli.decomp.neutre') : c.origine === 'interface' ? t('cli.decomp.main') : ''}${tronquer(c.justification, 90)}`,
  );
  l.push(`  ${t('cli.decomp.moyenne').padEnd(26)} ${virgule(d.moyenne)}`);
  for (const r of d.regles) {
    const effet = r.effet === 'zero' ? '0' : t('cli.decomp.plafond', { valeur: virgule(r.valeur!) });
    l.push(`  ${t('cli.decomp.regle', { libelle: r.libelle, effet, sansEffet: r.effective ? '' : t('cli.decomp.sansEffet') })}`);
  }
  for (const b of d.bloquants_ignores) l.push(`  ${t('cli.decomp.ignoree', { regle: b })}`);
  for (const f of d.drapeaux) l.push(`  ⚑ ${messageDrapeau(f, langueCourante())}`);
  l.push(`  ${t('cli.decomp.note', { exacte: virgule(d.note_exacte), note: virgule(d.note, 1) })}`);
  return l;
}

function afficherImpact(i: Impact): void {
  console.log(t('cli.impact.resume', { recalculees: i.offres_recalculees, changees: i.changees }));
  const ligne = (c: Impact['changements'][number]) =>
    `  #${String(c.id).padEnd(5)} ${String(c.avant ?? '—').padStart(4)} → ${String(c.apres).padEnd(4)} ${tronquer(`${c.entreprise ?? ''} ${c.titre}`, 80)}`;
  const seuil = i.seuil_apres;
  if (i.montent.length) console.log(`${t('cli.impact.montent', { seuil, n: i.montent.length })}\n${i.montent.map(ligne).join('\n')}`);
  if (i.descendent.length) console.log(`${t('cli.impact.descendent', { seuil, n: i.descendent.length })}\n${i.descendent.map(ligne).join('\n')}`);
}

function ligneJournal(e: EvenementJournal): string {
  const etat = (e.en_retard ? t('cli.journal.enRetard') : e.echeance ? t('cli.journal.aFaire') : '').padEnd(10);
  const sens = e.sens ? ` ${e.sens === 'envoye' ? '→' : '←'}` : '';
  const montant = e.montant !== null ? ` · ${e.montant} ${e.unite ?? ''}`.trimEnd() : '';
  const fichiers = e.fichiers.length ? ` · ${e.fichiers.join(', ')}` : '';
  return `  #${String(e.id).padEnd(5)} ${dateEvenement(e.le).padEnd(19)} ${etat}${e.type.padEnd(11)}${sens} ${tronquer(e.resume, 90)}${montant}${fichiers}`;
}

function sansErreur<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    erreur((e as Error).message);
  }
}

const commandes: Record<string, (args: string[]) => Promise<void> | void> = {
  async ingest(args) {
    const { v } = analyser(args, { keep: { type: 'boolean' }, fetch: { type: 'boolean' }, emails: { type: 'string' } });
    const { config, db } = contexte(v);
    const r = await ingererSelonConfig(db, config, {
      dossierEmails: v.emails as string | undefined,
      garder: Boolean(v.keep),
      telecharger: v.fetch === false ? false : undefined,
    });
    if (v.json) return json(r);
    console.log(
      t('cli.ingest.resume', {
        fichiers: r.fichiers,
        offres: r.offres_trouvees,
        nouvelles: r.nouvelles,
        avecDescription: r.avec_description,
        aLire: r.a_lire,
        doublons: r.doublons,
        ecartees: r.ecartees,
      }),
    );
    console.log(v.keep ? t('cli.ingest.conserves') : t('cli.ingest.supprimes', { n: r.fichiers_supprimes }));
    for (const e of r.detail.ecartees) console.log(t('cli.ingest.ecartee', { id: e.id, titre: tronquer(e.titre, 70), motif: e.motif }));
    for (const e of r.erreurs) console.log(t('cli.ingest.erreur', { fichier: e.fichier ?? e.url, message: e.message }));
    for (const f of r.sans_offre) console.log(t('cli.ingest.sansOffre', { fichier: f }));
    for (const c of r.confirmations) {
      const connues = c.offres_connues.map((x) => `#${x.id} (${x.statut})`).join(', ');
      console.log(t('cli.ingest.accuse', { sujet: c.sujet, suite: connues ? ` → ${connues}` : t('cli.ingest.offreAbsente') }));
    }
    if (r.nouvelles) console.log(t('cli.ingest.suite'));
  },

  'import-historique'(args) {
    const { v } = analyser(args, { source: { type: 'string' } });
    const { config, db } = contexte(v);
    const r = importerHistorique(db, (v.source as string | undefined) ?? config.dossierDonnees);
    if (v.json) return json(r);
    console.log(t('cli.import.lots', { fichiers: r.lots.fichiers, entrees: r.lots.entrees, offres: r.lots.offres_creees, notes: r.lots.notes_ajoutees }));
    console.log(
      t('cli.import.registre', {
        lignes: r.registre.lignes,
        offres: r.registre.offres,
        creees: r.registre.offres_creees,
        sansLien: r.registre.offres_sans_lien,
        statuts: r.registre.statuts_ajoutes,
        notes: r.registre.notes_ajoutees,
        corrigees: r.registre.entreprises_corrigees,
      }),
    );
    if (r.suivi.ignore) console.log(t('cli.import.suiviIgnore', { raison: r.suivi.ignore }));
    else
      console.log(
        t('cli.import.suivi', { lignes: r.suivi.lignes, offres: r.suivi.offres_creees, candidatures: r.suivi.candidatures, statuts: r.suivi.statuts_ajoutes }),
      );
    const J = r.journal;
    console.log(
      t('cli.import.journaux', {
        dossiers: J.dossiers,
        lignes: J.lignes,
        crees: J.evenements_crees,
        existants: J.evenements_existants,
        retires: J.evenements_retires,
        echeances: J.echeances,
        types: Object.entries(J.par_type).map(([x, n]) => `${x} ${n}`).join(', ') || '—',
      }),
    );
    for (const d of J.dossiers_rattaches) console.log(t('cli.import.rattache', { offre: d.offre_id, dossier: d.dossier }));
    for (const d of J.dossiers_sans_offre) console.log(t('cli.import.sansOffre', { dossier: d }));
    for (const d of J.dossiers_sans_suivi) console.log(t('cli.import.sansSuivi', { dossier: d }));
    if (J.non_typees.length) {
      console.log(t('cli.import.nonTypees', { n: J.non_typees.length }));
      for (const n of J.non_typees) console.log(`  ${n.dossier}:${n.ligne} ${n.extrait}`);
    }
    if (J.sans_date.length) {
      console.log(t('cli.import.sansDate', { n: J.sans_date.length }));
      for (const n of J.sans_date) console.log(`  ${n.dossier}:${n.ligne} ${n.extrait}`);
    }
    for (const f of r.suivi.fusions) console.log(t('cli.import.fusion', { doublon: f.doublon, offre: f.offre, entreprise: f.entreprise }));
    const non = [...r.lots.erreurs, ...r.registre.non_reconnues, ...r.suivi.non_reconnues];
    if (non.length) {
      console.log(t('cli.import.nonReconnues', { n: non.length }));
      for (const n of non) console.log(`  ${n.fichier}:${n.ligne} ${n.raison} — ${n.extrait}`);
    }
    if (r.registre.liens_non_reconnus.length) {
      console.log(t('cli.import.liensNonReconnus', { n: r.registre.liens_non_reconnus.length }));
      for (const n of r.registre.liens_non_reconnus) console.log(`  _ecartees.md:${n.ligne} ${n.url}`);
    }
  },

  list(args) {
    const { v } = analyser(args, {
      statut: { type: 'string' },
      'note-min': { type: 'string' },
      'note-max': { type: 'string' },
      'sans-note': { type: 'boolean' },
      source: { type: 'string' },
      tag: { type: 'string' },
      depuis: { type: 'string' },
      jusqua: { type: 'string' },
      'publiee-depuis': { type: 'string' },
      texte: { type: 'string', short: 'q' },
      contrat: { type: 'string' },
      teletravail: { type: 'string' },
      candidatures: { type: 'boolean' },
      page: { type: 'string' },
      taille: { type: 'string' },
      tri: { type: 'string' },
      ordre: { type: 'string' },
    });
    const { db } = contexte(v);
    const statuts = liste(v.statut);
    for (const s of statuts ?? []) if (!estStatut(s)) erreur(t('cli.statutInconnu', { statut: s }));
    const o: OptionsListe = {
      statuts,
      sources: liste(v.source),
      tags: liste(v.tag),
      noteMin: nombre(v['note-min'], 'note-min'),
      noteMax: nombre(v['note-max'], 'note-max'),
      sansNote: v['sans-note'] === true ? true : v['sans-note'] === false ? false : undefined,
      recueDepuis: v.depuis as string | undefined,
      recueJusqua: v.jusqua as string | undefined,
      publieeDepuis: v['publiee-depuis'] as string | undefined,
      q: v.texte as string | undefined,
      contrat: v.contrat as string | undefined,
      teletravail: v.teletravail as string | undefined,
      mesCandidatures: Boolean(v.candidatures),
      page: v.page ? entier(v.page, 'page') : 1,
      taille: v.taille ? entier(v.taille, 'taille') : 50,
      tri: (v.tri as string | undefined) ?? 'recue_le',
      ordre: v.ordre === 'asc' ? 'asc' : 'desc',
    };
    const r = listerOffres(db, o);
    if (v.json) return json(r);
    console.log(
      tableau(
        t('cli.list.entetes').split('|'),
        r.offres.map((x) => [
          String(x.id),
          x.note === null ? '—' : String(x.note),
          x.statut,
          x.source,
          x.recue_le ?? '',
          tronquer(x.entreprise, 24),
          tronquer(x.titre, 60),
        ]),
      ),
    );
    console.log(t('cli.list.pied', { page: r.page, pages: r.pages, total: r.total }));
  },

  show(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const d = detailOffre(db, entier(pos[0], 'id'));
    if (!d) erreur(t('cli.offreIntrouvable', { id: pos[0] }));
    if (v.json) return json(d);
    console.log(afficherDetail(d));
  },

  'a-lire'(args) {
    const { v } = analyser(args, { limite: { type: 'string' }, complet: { type: 'boolean' } });
    const { db } = contexte(v);
    const r = offresALire(db, { limite: v.limite ? entier(v.limite, 'limite') : 500, complet: Boolean(v.complet) });
    const offres = r.offres;
    if (v.json) return json(r);
    if (!offres.length) return console.log(t('cli.aLire.aucune'));
    for (const o of offres) {
      const mode = { description: t('cli.aLire.description'), navigateur: t('cli.aLire.navigateur'), humain: t('cli.aLire.humain') }[o.lecture];
      console.log(`#${o.id} [${o.source}] ${tronquer(o.titre, 80)}${o.entreprise ? ` — ${o.entreprise}` : ''}`);
      console.log(`    ${o.url ?? t('cli.aLire.sansUrl')} · ${mode}`);
    }
    console.log(t('cli.aLire.total', { n: r.total }));
  },

  noter(args) {
    const { v, pos } = analyser(args, { fichier: { type: 'string' }, json: { type: 'string' }, essai: { type: 'boolean' } });
    const { config, db } = contexte(v);
    let entrees: EntreeLot[];
    if (v.fichier) {
      entrees = entreesDuLot(JSON.parse(readFileSync(v.fichier as string, 'utf8').replace(/^﻿/, '')));
    } else {
      if (typeof v.json !== 'string') erreur(t('cli.noter.attendu'));
      const e = JSON.parse(v.json) as EntreeLot | EntreeLot[];
      entrees = Array.isArray(e) ? e : [e];
      if (pos[0]) {
        if (entrees.length !== 1) erreur(t('cli.noter.uneSeule'));
        entrees[0] = { ...entrees[0], id: entier(pos[0], 'id') };
      }
    }
    const resultats = sansErreur(() =>
      noterOffres(db, entrees, 'cli', { grille: () => grilleCourante(db, config.dossierDonnees), essai: Boolean(v.essai) }),
    );
    json({ ok: true, essai: Boolean(v.essai), notees: v.essai ? 0 : resultats.length, offres: resultats });
  },

  grille(args) {
    const { v } = analyser(args, {
      consignes: { type: 'boolean' },
      historique: { type: 'boolean' },
      version: { type: 'string' },
      restaurer: { type: 'string' },
      init: { type: 'boolean' },
      modifier: { type: 'string' },
      resume: { type: 'string' },
      essai: { type: 'boolean' },
    });
    const { config, db } = contexte(v);
    const dossier = config.dossierDonnees;
    if (v.init) {
      const r = sansErreur(() => initialiserGrille(db, dossier, config.langue));
      if (v.json) return json({ ok: true, cree: r.cree, chemin: r.chemin, version: r.version.version });
      return console.log(r.cree ? t('cli.grille.copiee', { chemin: r.chemin }) : t('cli.grille.existe', { chemin: r.chemin }));
    }
    if (v.historique) {
      sansErreur(() => grilleCourante(db, dossier));
      const h = historiqueGrille(db);
      if (v.json) return json({ ok: true, versions: h });
      for (const x of h) console.log(`  v${String(x.version).padEnd(4)} ${x.le.slice(0, 16).replace('T', ' ')}  ${x.auteur.padEnd(9)} ${x.resume}`);
      return;
    }
    if (v.restaurer !== undefined) {
      const r = sansErreur(() => restaurerGrille(db, dossier, entier(v.restaurer, 'version'), { auteur: 'cli', resume: v.resume as string | undefined }));
      if (v.json) return json({ ok: true, version: r.version.version, impact: r.impact });
      console.log(t('cli.grille.version', { version: r.version.version, resume: r.version.resume }));
      return afficherImpact(r.impact);
    }
    if (v.modifier !== undefined) {
      if (!v.essai && !v.resume) erreur(t('cli.grille.resumeAttendu'));
      let changement: unknown;
      try {
        changement = JSON.parse(v.modifier as string);
      } catch (e) {
        erreur(t('cli.grille.jsonInvalide', { message: (e as Error).message }));
      }
      const r = sansErreur(() => modifierGrille(db, dossier, changement, { auteur: 'cli', resume: (v.resume as string) ?? '', essai: Boolean(v.essai) }));
      if (v.json) return json({ ok: true, ...r });
      console.log(r.enregistree ? t('cli.grille.enregistree', { version: r.version }) : t('cli.grille.essai'));
      if (r.exemples_calcules.length) {
        console.log(t('cli.grille.exemplesAvantApres'));
        for (const e of r.exemples_calcules) {
          const avant = e.avant === null || e.avant === undefined ? t('cli.grille.nouveau') : virgule(e.avant);
          console.log(`  ${avant.padStart(7)} → ${virgule(e.note).padEnd(4)} ${e.titre}${e.entreprise ? ` — ${e.entreprise}` : ''}`);
        }
      }
      return afficherImpact(r.impact);
    }
    const g = v.version !== undefined ? sansErreur(() => versionGrille(db, entier(v.version, 'version'))) : sansErreur(() => grilleObligatoire(db, dossier));
    if (v.json) {
      return json({
        ok: true,
        fichier: cheminGrille(dossier),
        ...g,
        consignes_ia: consignesIa(g.grille),
        exemples_calcules: g.grille.exemples.map((e) => ({ titre: e.titre, entreprise: e.entreprise ?? null, ...noteExemple(g.grille, e, g.version) })),
      });
    }
    const G = g.grille;
    const langue = langueCourante();
    console.log(t('cli.grille.titre', { nom: G.nom, version: g.version, le: g.le.slice(0, 10), auteur: g.auteur, resume: g.resume }));
    console.log(t('cli.grille.fichier', { chemin: cheminGrille(dossier), seuil: virgule(G.seuil) }));
    const somme = G.criteres.reduce((s, c) => s + c.poids, 0);
    console.log(`\n${t('cli.grille.criteres')}`);
    for (const c of G.criteres) {
      const source = (c.source === 'ia' ? t('cli.grille.ia') : t('cli.grille.calcul')).padEnd(8);
      console.log(`  ${c.id.padEnd(14)} ${String(Math.round((c.poids / somme) * 100)).padStart(3)} %  ${source}  ${c.libelle}`);
    }
    const tt = G.baremes.teletravail;
    const r = G.baremes.remuneration;
    console.log(`\n${t('cli.grille.teletravail', { jours: tt.jours_sur_site.join(' / '), inconnu: tt.inconnu })}`);
    console.log(
      t('cli.grille.remuneration', {
        reference: r.reference,
        plancher: r.salaire.plancher,
        basse: r.salaire.cible_basse,
        haute: r.salaire.cible_haute,
        tjm: r.tjm.plancher,
        fullRemote: r.tjm.plancher_full_remote ? t('cli.grille.fullRemote', { valeur: r.tjm.plancher_full_remote }) : '',
        tjmBasse: r.tjm.cible_basse,
        tjmHaute: r.tjm.cible_haute,
        inconnue: r.inconnue,
      }),
    );
    console.log(`\n${t('cli.grille.regles')}`);
    for (const x of G.regles) {
      const effet = x.effet === 'zero' ? '0' : x.effet === 'plafond' ? t('cli.decomp.plafond', { valeur: x.valeur }) : `${x.critere} < ${x.seuil}`;
      console.log(`  ${x.actif ? '●' : '○'} ${x.id.padEnd(18)} ${effet.padEnd(10)} ${x.libelle}`);
    }
    console.log(`\n${t('cli.grille.inventaire')}`);
    for (const n of ['fort', 'moyen', 'leger', 'zero'] as const) {
      const items = G.inventaire.filter((x) => x.niveau === n).map((x) => x.techno);
      if (items.length) console.log(`  ${libelleNiveau(n, langue).padEnd(6)} ${items.join(', ')}`);
    }
    if (G.exemples.length) {
      console.log(`\n${t('cli.grille.exemples')}`);
      for (const e of G.exemples) console.log(`  ${virgule(noteExemple(G, e).note, 1).padStart(4)}  ${e.entreprise ? `${e.entreprise} — ` : ''}${e.titre}`);
    }
    if (v.consignes) console.log(`\n${t('cli.grille.consignes')}\n${[...G.consignes, ...consignesIa(G)].map((x) => `- ${x}`).join('\n')}`);
  },

  renoter(args) {
    const { v } = analyser(args, {});
    const { config, db } = contexte(v);
    const r = sansErreur(() => renoter(db, config.dossierDonnees));
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.renoter', { version: r.version }));
    afficherImpact(r.impact);
  },

  statut(args) {
    const { v, pos } = analyser(args, { commentaire: { type: 'string', short: 'm' } });
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    const statut = pos[1];
    if (!statut || !estStatut(statut)) erreur(t('cli.statutAttendu', { statuts: STATUTS.join(', ') }));
    if (!offreParId(db, id)) erreur(t('cli.offreIntrouvable', { id }));
    ajouterStatut(db, id, statut, { commentaire: (v.commentaire as string | undefined) ?? null, origine: 'cli' });
    const o = offreParId(db, id)!;
    if (v.json) return json({ ok: true, id, statut: o.statut });
    console.log(`#${id} → ${libelleStatut(o.statut, langueCourante())}`);
  },

  tag(args) {
    // Analyse manuelle : « -retrait » ne doit pas être pris pour une option.
    const opts: Valeurs = {};
    const reste: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--json') opts.json = true;
      else if (a === '--data' || a === '--config') opts[a.slice(2)] = args[++i];
      else reste.push(a);
    }
    const { db } = contexte(opts);
    const id = entier(reste[0], 'id');
    if (!offreParId(db, id)) erreur(t('cli.offreIntrouvable', { id }));
    const ajouts = reste.slice(1).filter((x) => x.startsWith('+')).map((x) => x.slice(1));
    const retraits = reste.slice(1).filter((x) => x.startsWith('-')).map((x) => x.slice(1));
    const autres = reste.slice(1).filter((x) => !/^[+-]/.test(x));
    if (autres.length) erreur(t('cli.tag.prefixe', { tags: autres.join(' ') }));
    const tags = modifierTags(db, id, ajouts, retraits);
    if (opts.json) return json({ ok: true, id, tags });
    console.log(`#${id} : ${tags.join(', ') || t('cli.tag.aucun')}`);
  },

  lien(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (!offreParId(db, id)) erreur(t('cli.offreIntrouvable', { id }));
    if (pos[1] === undefined) erreur(t('cli.lien.attendu'));
    try {
      modifierLien(db, id, pos[1] === '-' ? null : pos[1]);
    } catch (e) {
      erreur((e as Error).message);
    }
    const o = offreParId(db, id)!;
    if (v.json) return json({ ok: true, id, url: o.url_canonique });
    console.log(`#${id} : ${o.url_canonique ?? t('cli.lien.aucun')}`);
  },

  candidater(args) {
    const { v, pos } = analyser(args, {});
    const { config, db } = contexte(v);
    const id = entier(pos[0], 'id');
    const r = sansErreur(() => preparerCandidature(db, config.dossierDonnees, id, 'cli'));
    if (v.json) return json(r);
    console.log(afficherDetail(r.offre));
    console.log(`\n${t('cli.candidater.dossier', { dossier: r.dossier_suggere })}`);
    console.log(r.etapes.map((e, i) => `${i + 1}. ${e}`).join('\n'));
  },

  candidature(args) {
    const { v, pos } = analyser(args, {
      dossier: { type: 'string' },
      cv: { type: 'string' },
      canal: { type: 'string' },
      'envoyee-le': { type: 'string' },
      message: { type: 'string' },
      'prochaine-action': { type: 'string' },
    });
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    const champs: ChampsCandidature = {
      dossier: v.dossier as string | undefined,
      cv: v.cv as string | undefined,
      canal: v.canal as string | undefined,
      envoyee_le: v['envoyee-le'] as string | undefined,
      message: v.message as string | undefined,
      prochaine_action: v['prochaine-action'] as string | undefined,
    };
    if (Object.values(champs).every((x) => x === undefined)) erreur(t('cli.candidature.option'));
    const r = sansErreur(() => suivreCandidature(db, id, champs, 'cli'));
    if (v.json) return json({ ok: true, id, statut: r.offre.statut, statut_ajoute: r.statut_ajoute, candidature: r.offre.candidature });
    console.log(afficherDetail(r.offre).split(`\n\n${t('cli.detail.description')}`)[0]);
  },

  'prochaine-action'(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (pos[1] === undefined) erreur(t('cli.prochaineAction.attendu'));
    const texte = pos.slice(1).join(' ');
    const r = sansErreur(() => suivreCandidature(db, id, { prochaine_action: texte === '-' ? null : texte }, 'cli'));
    const action = r.offre.candidature?.prochaine_action ?? null;
    if (v.json) return json({ ok: true, id, prochaine_action: action });
    console.log(`#${id} : ${action ?? t('cli.prochaineAction.aucune')}`);
  },

  evenement(args) {
    const { v, pos } = analyser(args, {
      type: { type: 'string', short: 't' },
      le: { type: 'string' },
      resume: { type: 'string', short: 'r' },
      sens: { type: 'string' },
      details: { type: 'string' },
      canal: { type: 'string' },
      interlocuteurs: { type: 'string' },
      montant: { type: 'string' },
      unite: { type: 'string' },
      jours: { type: 'string' },
      fichier: { type: 'string', multiple: true },
      fait: { type: 'boolean' },
    });
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (!v.type) erreur(t('cli.evenement.typeAttendu', { types: TYPES_EVENEMENT.join(', ') }));
    if (!v.resume) erreur(t('cli.evenement.resumeAttendu'));
    const saisie: SaisieEvenement = {
      type: v.type as string,
      le: v.le as string | undefined,
      resume: v.resume as string,
      sens: v.sens as string | undefined,
      details: v.details as string | undefined,
      canal: v.canal as string | undefined,
      interlocuteurs: v.interlocuteurs as string | undefined,
      montant: v.montant as string | undefined,
      unite: v.unite as string | undefined,
      jours: v.jours as string | undefined,
      fichiers: v.fichier as unknown as string[] | undefined,
      fait: v.fait as boolean | undefined,
    };
    const e = sansErreur(() => ajouterEvenement(db, id, saisie, 'cli'));
    if (v.json) return json({ ok: true, evenement: e });
    console.log(
      t('cli.evenement.ajoute', { id: e.id, offre: id, le: dateEvenement(e.le), type: e.type, echeance: e.fait ? '' : t('cli.evenement.echeance'), resume: e.resume }),
    );
  },

  journal(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    const o = offreParId(db, id);
    if (!o) erreur(t('cli.offreIntrouvable', { id }));
    const j = journal(db, id);
    if (v.json) return json({ ok: true, id, evenements: j });
    console.log(`#${id} ${o.titre}${o.entreprise ? ` — ${o.entreprise}` : ''}`);
    if (!j.length) return console.log(t('cli.journal.vide'));
    for (const e of j) console.log(ligneJournal(e));
  },

  echeances(args) {
    const { v } = analyser(args, { jours: { type: 'string' } });
    const { db } = contexte(v);
    const r = sansErreur(() => echeances(db, { jours: v.jours !== undefined ? Number(v.jours) : 7 }));
    if (v.json) return json({ ok: true, ...r });
    const langue = langueCourante();
    const ligne = (e: (typeof r.a_venir)[number]) =>
      `  #${String(e.id).padEnd(5)} ${dateEvenement(e.le).padEnd(19)} ${t('cli.echeances.offre', { id: e.offre_id })} ${tronquer(e.entreprise ?? e.titre, 28).padEnd(28)} ${libelleType(e.type, langue)} : ${tronquer(e.resume, 80)}`;
    console.log(t('cli.echeances.enRetard', { n: r.en_retard.length }));
    for (const e of r.en_retard) console.log(ligne(e));
    console.log(t('cli.echeances.aVenir', { date: dateEvenement(r.jusqua), n: r.a_venir.length }));
    for (const e of r.a_venir) console.log(ligne(e));
  },

  fait(args) {
    const { v, pos } = analyser(args, { fait: { type: 'boolean' } });
    const { db } = contexte(v);
    const id = entier(pos[0], 'evenement_id');
    sansErreur(() => evenementOuErreur(db, id));
    const e = marquerFait(db, id, v.fait !== false);
    if (v.json) return json({ ok: true, evenement: e });
    console.log(t(e.fait ? 'cli.fait.fait' : 'cli.fait.rouvert', { id, resume: e.resume }));
  },

  fichiers(args) {
    const { v, pos } = analyser(args, {});
    const { config, db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (!offreParId(db, id)) erreur(t('cli.offreIntrouvable', { id }));
    const r = fichiersDossier(db, config.dossierDonnees, id);
    if (v.json) return json({ ok: true, ...r });
    if (!r.dossier) return console.log(t('cli.fichiers.sansDossier', { id }));
    if (!r.existe) return console.log(t('cli.fichiers.absent', { id, dossier: r.dossier }));
    console.log(t('cli.fichiers.titre', { dossier: r.dossier, n: r.fichiers.length }));
    for (const f of r.fichiers) {
      console.log(`  ${f.chemin.padEnd(70)} ${String(Math.ceil(f.taille / 1024)).padStart(5)} ${t('cli.fichiers.ko')}  ${f.modifie_le.slice(0, 10)}`);
    }
  },

  stats(args) {
    const { v } = analyser(args, {});
    const { db } = contexte(v);
    const s = statistiques(db);
    if (v.json) return json({ ok: true, ...s });
    console.log(t('cli.stats.etapes', { envoyees: s.envoyees, reponses: s.reponses, entretiens: s.entretiens, propositions: s.propositions }));
    console.log(
      s.delai_moyen_reponse_jours === null
        ? t('cli.stats.pasAssez')
        : t('cli.stats.delai', { jours: virgule(s.delai_moyen_reponse_jours, 1), n: s.delai_base }),
    );
  },

  'generer-suivi'(args) {
    const { v } = analyser(args, { sortie: { type: 'string', short: 'o' }, remplacer: { type: 'boolean' } });
    const { config, db } = contexte(v);
    const r = ecrireSuivi(db, config.dossierDonnees, { sortie: v.sortie as string | undefined, remplacer: Boolean(v.remplacer), langue: config.langue });
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.suivi.resume', { fichier: r.fichier, enCours: r.en_cours, sansSuite: r.sans_suite, closes: r.closes }));
  },

  async mcp(args) {
    const { v } = analyser(args, {});
    // Le serveur démarre même sans espace (dossier par défaut, outil initialiser_espace) : pas de contexte() ici.
    const { demarrerMcp } = await import('../mcp/serveur.ts');
    await demarrerMcp({ dossierDonnees: v.data as string | undefined, fichierConfig: v.config as string | undefined });
  },

  async serve(args) {
    const { v } = analyser(args, { port: { type: 'string' }, inactivite: { type: 'string' } });
    const { config, db } = contexte(v);
    const port = v.port ? entier(v.port, 'port') : config.port;
    await demarrerServeur({ db, config, port, inactiviteMin: nombre(v.inactivite, 'inactivite') ?? 0 });
  },

  init(args) {
    const { v, pos } = analyser(args, { port: { type: 'string' }, 'nom-mcp': { type: 'string' }, gabarit: { type: 'string' }, langue: { type: 'string' } });
    if (pos.length !== 1) erreur(t('cli.init.usage'));
    if (v.langue !== undefined && !estLangue(v.langue)) {
      erreur(t('cli.invalide', { nom: '--langue', valeur: `${String(v.langue)} (${LANGUES.join(', ')})` }));
    }
    const r = initialiserEspace({
      dossier: pos[0],
      port: v.port ? entier(v.port, 'port') : undefined,
      nomMcp: v['nom-mcp'] as string | undefined,
      gabarit: v.gabarit as string | undefined,
      langue: v.langue as 'fr' | 'en' | undefined,
    });
    if (v.json) return json(r);
    console.log(t('cli.init.cree', { dossier: r.dossier }));
    console.log(t('cli.init.config', { config: r.config, port: r.port, langue: r.langue }));
    console.log(t('cli.init.mcp', { nom: r.nom_mcp, mcp: r.mcp }));
    console.log(t('cli.init.navigateur', { navigateur: r.navigateur ?? t('cli.aucun') }));
    for (const a of r.avertissements) console.log(`  ⚠ ${a}`);
    console.log(`\n${t('cli.init.commande', { commande: r.commande })}`);
    console.log(`\n${t('cli.init.etapes')}`);
    console.log(t('cli.init.etape1', { dossier: r.dossier }));
    console.log(t('cli.init.etape2', { dossier: r.dossier }));
    console.log(`${t('cli.init.etape3')}\n`);
    console.log(r.invite);
  },

  compter(args) {
    const { v, pos } = analyser(args, {});
    if (pos.length !== 1) erreur(t('cli.compter.usage'));
    const resultat = compterTexte(sansErreur(() => readFileSync(pos[0], 'utf8')));
    if (v.json) return json({ ok: true, fichier: pos[0], blocs: resultat });
    for (const b of resultat) {
      console.log(t('cli.compter.ligne', { caracteres: String(b.caracteres).padStart(6), mots: String(b.mots).padStart(4), debut: b.debut }));
    }
  },

  gabarits(args) {
    const { v } = analyser(args, {});
    const gabarits = listerGabarits();
    if (v.json) return json({ ok: true, gabarits });
    for (const g of gabarits) console.log(`${g.nom.padEnd(10)} ${g.description}`);
    console.log(`\n${t('cli.gabarits.choisir')}`);
  },

  gabarit(args) {
    const { v, pos } = analyser(args, {});
    if (pos.length !== 1) erreur(t('cli.gabarit.usage'));
    const espace = chargerConfig({ dossierDonnees: v.data as string | undefined, fichierConfig: v.config as string | undefined }).dossierDonnees;
    const r = sansErreur(() => choisirGabarit(espace, pos[0]));
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.gabarit.installe', { nom: pos[0], dossier: r.dossier, ancien: r.ancien ? t('cli.gabarit.ancien', { dossier: r.ancien }) : '' }));
    console.log(t('cli.gabarit.regenerer'));
  },

  async cv(args) {
    const { v, pos } = analyser(args, { gabarit: { type: 'string' }, capture: { type: 'boolean' } });
    if (!pos.length) erreur(t('cli.cv.usage'));
    let choisi = v.gabarit as string | undefined;
    if (!choisi) {
      let espace: string | null = null;
      try {
        espace = chargerConfig({ dossierDonnees: v.data as string | undefined, fichierConfig: v.config as string | undefined }).dossierDonnees;
      } catch {
        espace = null;
      }
      const local = espace ? `${espace}/cv/gabarit` : null;
      choisi = local && existsSync(`${local}/gabarit.css`) ? local : GABARIT_DEFAUT;
    }
    const gabarit = choisi;
    const navigateur = trouverNavigateur();
    if (!navigateur) erreur(t('cli.cv.sansNavigateur'));
    const generes = pos.map((md) => sansErreur(() => genererCv(md, gabarit, navigateur, { capture: Boolean(v.capture) })));
    const resultats = [];
    for (const r of generes) {
      const mise = await analyserPages(readFileSync(r.pdf)).catch(() => null);
      resultats.push({ ...r, remplissage: mise?.pages.map((p) => p.remplissage) ?? null, avertissements: mise?.avertissements ?? [] });
    }
    if (v.json) return json({ ok: true, gabarit, cv: resultats });
    for (const r of resultats) {
      const taux = r.remplissage
        ? ` (${t('cli.cv.remplissage', { taux: r.remplissage.map((x) => t('core.pages.pourcent', { pc: x })).join(', ') })})`
        : '';
      console.log(`${String(r.pages).padStart(2)} ${t('cli.cv.pages')}  ${r.pdf}${r.pages > 2 ? t('cli.cv.depasse') : ''}`);
      // Lignes lues par les outils et l'IA (HTML, PDF, IMAGE, PAGES) : mêmes libellés dans les deux langues.
      if (resultats.length === 1) console.log(`HTML : ${r.html}\nPDF  : ${r.pdf}${r.capture ? `\nIMAGE : ${r.capture}` : ''}\nPAGES : ${r.pages}${taux}`);
      else if (taux) console.log(`    ${taux.trim()}`);
      for (const a of r.avertissements) console.log(`    ! ${a}`);
    }
  },

  aide() {
    process.stdout.write(aide());
  },
};

/** Valeur d'une option (--nom valeur ou --nom=valeur) lue avant l'analyse complète. */
function optionBrute(argv: string[], nom: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${nom}`) return argv[i + 1];
    if (argv[i].startsWith(`--${nom}=`)) return argv[i].slice(nom.length + 3);
  }
  return undefined;
}

/**
 * Langue des messages : --langue d'init (l'espace qu'on crée), sinon la configuration (--data, --config,
 * POSTULER_JUSTE_LANGUE, fichier), sinon le français.
 */
function langueDesMessages(cmd: string | undefined, args: string[]) {
  const demandee = cmd === 'init' ? optionBrute(args, 'langue') : undefined;
  if (estLangue(demandee)) return demandee;
  return langueConfiguree({ dossierDonnees: optionBrute(args, 'data'), fichierConfig: optionBrute(args, 'config') });
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  definirLangue(langueDesMessages(cmd, args));
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(aide());
    return 0;
  }
  const fn = commandes[cmd];
  if (!fn) {
    process.stderr.write(`${t('cli.commandeInconnue', { commande: cmd })}\n\n${aide()}`);
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(aide());
    return 0;
  }
  try {
    await fn(args);
    return 0;
  } catch (e) {
    const err = e as Error & { utilisateur?: boolean; code?: string };
    const message = err.code?.startsWith('ERR_PARSE_ARGS') || err.utilisateur ? err.message : (err.stack ?? err.message);
    if (args.includes('--json')) process.stderr.write(`${JSON.stringify({ ok: false, erreur: err.message })}\n`);
    else process.stderr.write(`${t('cli.erreur', { message })}\n`);
    return 1;
  }
}
