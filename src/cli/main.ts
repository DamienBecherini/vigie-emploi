// Interface en ligne de commande de postuler-juste (pensée pour être pilotée par une IA : sorties JSON stables).
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chargerConfig, type Config } from '../core/config.ts';
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
import { estStatut, LIBELLES_STATUTS, STATUTS } from '../core/statuts.ts';
import { ecrireSuivi } from '../export/suivi.ts';
import { demarrerServeur } from '../api/serveur.ts';
import {
  ajouterEvenement,
  dateEvenementFr,
  echeances,
  evenementOuErreur,
  journal,
  LIBELLES_TYPES,
  marquerFait,
  TYPES_EVENEMENT,
  type EvenementJournal,
  type SaisieEvenement,
} from '../core/evenements.ts';
import { fichiersDossier } from '../core/fichiers.ts';
import { statistiques } from '../core/statistiques.ts';
import { consignesIa, LIBELLES_NIVEAUX, noteExemple, type Decomposition } from '../core/grille.ts';
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
import { GABARIT_DEFAUT, genererCv, trouverNavigateur } from '../cv/cv.ts';

const AIDE = `postuler-juste — offres, notes et candidatures (base SQLite locale)

Usage : postuler-juste <commande> [options]

Commandes
  init <dossier> [--port 4410] [--nom-mcp postuler-juste]
                        Crée un espace de travail (modèle, gabarit de CV, grille d'exemple, config, .mcp.json)
                        et affiche le prompt de démarrage à donner à l'IA
  cv <cv.md>… [--gabarit <dossier>] [--capture]
                        CV Markdown -> PDF A4 à côté du .md, avec le nombre de pages (cible : 2).
                        Gabarit : --gabarit, sinon cv/gabarit/ de l'espace, sinon celui de l'application ;
                        --capture : image PNG du rendu dans <gabarit>/apercu/ (contrôle visuel)
  ingest [--keep] [--no-fetch] [--emails <dossier>]
                        Lit les .eml de la boîte de réception, ajoute les nouvelles offres,
                        puis supprime les e-mails traités (sauf --keep)
  import-historique     Reprend candidatures/_lots/*.json, _ecartees.md et _SUIVI.md s'ils existent (idempotent)
  list [filtres]        Liste paginée des offres
      --statut a,b  --note-min N  --note-max N  --sans-note  --source s1,s2  --tag t
      --depuis AAAA-MM-JJ  --jusqua AAAA-MM-JJ (date de réception)  --texte "mots"
      --contrat CDI  --teletravail remote  --candidatures  --page N  --taille N
      --tri note|recue_le|publiee_le|titre|entreprise|…  --ordre asc|desc
      --tri recue_le:desc,note:desc  (plusieurs niveaux : date, puis note à date égale)
  show <id>             Détail d'une offre (notes, statuts, tags, candidature)
  a-lire [--limite N] [--complet]
                        Offres à traiter sans note, avec l'URL à lire (ou la description déjà extraite)
  noter <id> --json '{"criteres": {"technique": {"note": 8, "justification": "…"}, …}, "entrees": {…}, "bloquants": [], "colle": "…"}'
  noter --fichier lot.json [--essai]
                        Enregistre des notes (format des lots). Avec « criteres », la note est calculée avec la
                        grille (voir « grille ») ; sans, c'est une note globale (ancienne grille).
                        --essai : calcule et affiche sans rien enregistrer
  grille [--consignes] [--json]
                        Grille de notation courante : critères, poids, barèmes, règles, inventaire, exemples
  grille --historique | --version N | --restaurer N [--resume "…"] | --init
  grille --modifier '{"poids": {"technique": 40}, …}' --resume "…" [--essai]
                        Changement partiel (poids, seuil, baremes, regles, inventaire) ; recalcule les notes
  renoter               Recalcule toutes les notes à critères avec la grille courante
  statut <id> <statut> [--commentaire "…"]
                        Statuts : ${STATUTS.join(', ')}
  tag <id> +ajout -retrait
  lien <id> <url|->       Enregistre (ou efface avec -) le lien de l'offre
  candidater <id>       Passe l'offre en « go » et affiche tout ce qu'il faut pour préparer la candidature
  candidature <id> [--dossier d] [--cv f] [--canal c] [--envoyee-le JJ/MM/AAAA] [--message m]
                   [--prochaine-action "…"]
                        Enregistre la candidature (option vide "" pour effacer un champ) ;
                        avec --envoyee-le, l'offre passe en « envoyee »
  prochaine-action <id> "texte"
                        Prochaine action de la candidature ("" ou - pour l'effacer)
  evenement <id> --type ${TYPES_EVENEMENT.join('|')} [--le "JJ/MM/AAAA HH:MM"] --resume "…"
                   [--sens envoye|recu] [--canal c] [--interlocuteurs "…"] [--details "…"]
                   [--montant 3000 --unite "€ HT"] [--jours 6] [--fichier candidatures/x/devis.md]…
                   [--fait | --no-fait]
                        Ajoute un événement au journal de la candidature ; daté dans le futur (et pas fait),
                        c'est une échéance. --le par défaut : maintenant ; « demain », « +3 » acceptés
  journal <id>          Journal de la candidature (échéances d'abord, puis du plus récent au plus ancien)
  echeances [--jours 7] Échéances en retard et à venir sur N jours
  fait <evenement_id> [--no-fait]
                        Marque une échéance comme faite (--no-fait : la rouvrir)
  fichiers <id>         Fichiers du dossier de candidature (chemins à citer dans --fichier)
  stats                 Candidatures par étape (envoyée, réponse, entretien, proposition), délai de réponse
  generer-suivi [--sortie <fichier>] [--remplacer]
                        Génère le suivi des candidatures depuis la base : par défaut
                        candidatures/_SUIVI.genere.md (aperçu) ; --remplacer écrit candidatures/_SUIVI.md
  serve [--port 4410] [--inactivite <minutes>]
                        Lance le tableau de bord (http://localhost:4410) ; --inactivite : s'arrête seul après ce temps sans visite
  mcp                   Serveur MCP (transport stdio) pour piloter postuler-juste depuis une IA

Options générales
  --data <dossier>      Dossier de données (sinon POSTULER_JUSTE_DATA ou postuler-juste.config.json)
  --config <fichier>    Fichier de configuration
  --json                Sortie JSON (toutes les commandes)
`;

type Valeurs = Record<string, string | boolean | string[] | undefined>;

function erreur(message: string): never {
  throw Object.assign(new Error(message), { utilisateur: true });
}

function json(x: unknown): void {
  process.stdout.write(`${JSON.stringify(x, null, 2)}\n`);
}

function entier(v: unknown, nom: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) erreur(`${nom} invalide : ${String(v)}`);
  return n;
}

function nombre(v: unknown, nom: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) erreur(`${nom} invalide : ${String(v)}`);
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
  const t = (s ?? '').replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function tableau(entetes: string[], lignes: string[][]): string {
  const largeurs = entetes.map((e, i) => Math.max(e.length, ...lignes.map((l) => (l[i] ?? '').length)));
  const ligne = (l: string[]) => l.map((c, i) => (c ?? '').padEnd(largeurs[i])).join('  ').trimEnd();
  return [ligne(entetes), largeurs.map((w) => '-'.repeat(w)).join('  '), ...lignes.map(ligne)].join('\n');
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
  l.push(`#${d.id} ${d.titre}${d.entreprise ? ` — ${d.entreprise}` : ''}`);
  l.push(`Statut : ${LIBELLES_STATUTS[d.statut] ?? d.statut} · Note : ${d.note ?? '—'} · Source : ${d.source} (${d.id_site})`);
  if (d.url_canonique) l.push(`URL : ${d.url_canonique}`);
  const infos = [d.lieu, d.contrat, d.remuneration, d.teletravail && `télétravail : ${d.teletravail}`].filter(Boolean);
  if (infos.length) l.push(infos.join(' · '));
  l.push(`Reçue le ${d.recue_le ?? '—'} · publiée le ${d.publiee_le ?? '—'}`);
  if (d.stack) l.push(`Stack : ${d.stack}`);
  if (d.tags.length) l.push(`Tags : ${d.tags.join(', ')}`);
  const n = d.notes[0];
  if (n?.decomposition) {
    l.push('', `Note ${n.note} (grille v${n.grille_version}, exacte ${n.note_exacte}) le ${n.notee_le}`, ...lignesDecomposition(n.decomposition));
    if (n.colle) l.push(`Ce qui colle : ${n.colle}`);
    if (n.ecarts) l.push(`Écarts : ${n.ecarts}`);
  } else if (n) {
    l.push('', `Note ${n.note ?? '—'} (ancienne grille ; brute ${n.note_brute ?? '—'}${n.penalites ? `, pénalités : ${n.penalites}` : ''}) le ${n.notee_le}`);
    if (n.colle) l.push(`Ce qui colle : ${n.colle}`);
    if (n.ecarts) l.push(`Écarts : ${n.ecarts}`);
  }
  if (d.candidature) {
    const c = d.candidature;
    l.push('', `Candidature : ${[c.dossier, c.canal, c.envoyee_le && `envoyée le ${c.envoyee_le}`].filter(Boolean).join(' · ')}`);
    if (c.prochaine_action) l.push(`Prochaine action : ${c.prochaine_action}`);
  }
  if (d.evenements.length) l.push('', 'Journal :', ...d.evenements.map(ligneJournal));
  if (d.statuts.length) {
    l.push('', 'Historique des statuts :');
    for (const s of d.statuts) l.push(`  ${s.le.slice(0, 10)}  ${s.statut.padEnd(10)} ${tronquer(s.commentaire, 100)}`);
  }
  if (d.description) l.push('', 'Description :', d.description);
  return l.join('\n');
}

function virgule(n: number, d = 2): string {
  return String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',');
}

/** Décomposition d'une note : un critère par ligne, puis règles et drapeaux. */
function lignesDecomposition(d: Decomposition): string[] {
  const l = d.criteres.map(
    (c) =>
      `  ${c.libelle.padEnd(26)} ${virgule(c.note, 1).padStart(4)} × ${String(Math.round(c.poids_normalise * 100)).padStart(3)} % = ${virgule(c.contribution).padStart(5)}` +
      `  ${c.origine === 'neutre' ? '(neutre) ' : c.origine === 'interface' ? '(main) ' : ''}${tronquer(c.justification, 90)}`,
  );
  l.push(`  ${'Moyenne pondérée'.padEnd(26)} ${virgule(d.moyenne)}`);
  for (const r of d.regles) l.push(`  Règle : ${r.libelle} → ${r.effet === 'zero' ? '0' : `plafond ${virgule(r.valeur!)}`}${r.effective ? '' : ' (sans effet)'}`);
  for (const b of d.bloquants_ignores) l.push(`  Règle ignorée (inconnue ou désactivée) : ${b}`);
  for (const f of d.drapeaux) l.push(`  ⚑ ${f.message}`);
  l.push(`  Note : ${virgule(d.note_exacte)} → ${virgule(d.note, 1)}`);
  return l;
}

function afficherImpact(i: Impact): void {
  console.log(`${i.offres_recalculees} offre(s) à critères recalculée(s), ${i.changees} changent de note.`);
  const ligne = (c: Impact['changements'][number]) =>
    `  #${String(c.id).padEnd(5)} ${String(c.avant ?? '—').padStart(4)} → ${String(c.apres).padEnd(4)} ${tronquer(`${c.entreprise ?? ''} ${c.titre}`, 80)}`;
  if (i.montent.length) console.log(`Passent au-dessus du seuil ${i.seuil_apres} (${i.montent.length}) :\n${i.montent.map(ligne).join('\n')}`);
  if (i.descendent.length) console.log(`Repassent sous le seuil ${i.seuil_apres} (${i.descendent.length}) :\n${i.descendent.map(ligne).join('\n')}`);
}

function ligneJournal(e: EvenementJournal): string {
  const etat = e.en_retard ? 'EN RETARD ' : e.echeance ? 'à faire   ' : '          ';
  const sens = e.sens ? ` ${e.sens === 'envoye' ? '→' : '←'}` : '';
  const montant = e.montant !== null ? ` · ${e.montant} ${e.unite ?? ''}`.trimEnd() : '';
  const fichiers = e.fichiers.length ? ` · ${e.fichiers.join(', ')}` : '';
  return `  #${String(e.id).padEnd(5)} ${dateEvenementFr(e.le).padEnd(19)} ${etat}${e.type.padEnd(11)}${sens} ${tronquer(e.resume, 90)}${montant}${fichiers}`;
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
      `${r.fichiers} e-mail(s), ${r.offres_trouvees} offre(s) : ${r.nouvelles} nouvelle(s) (${r.avec_description} avec description, ` +
        `${r.a_lire} à lire dans le navigateur), ${r.doublons} doublon(s), ${r.ecartees} écartée(s) sur l'intitulé.`,
    );
    console.log(v.keep ? 'E-mails conservés (--keep).' : `${r.fichiers_supprimes} e-mail(s) supprimé(s).`);
    for (const e of r.detail.ecartees) console.log(`  écartée #${e.id} ${tronquer(e.titre, 70)} (${e.motif})`);
    for (const e of r.erreurs) console.log(`  erreur ${e.fichier ?? e.url} : ${e.message}`);
    for (const f of r.sans_offre) console.log(`  aucune offre reconnue, e-mail conservé : ${f}`);
    if (r.nouvelles) console.log('Suite : postuler-juste a-lire');
  },

  'import-historique'(args) {
    const { v } = analyser(args, { source: { type: 'string' } });
    const { config, db } = contexte(v);
    const r = importerHistorique(db, (v.source as string | undefined) ?? config.dossierDonnees);
    if (v.json) return json(r);
    console.log(
      `Lots : ${r.lots.fichiers} fichier(s), ${r.lots.entrees} entrée(s), ${r.lots.offres_creees} offre(s) créée(s), ${r.lots.notes_ajoutees} note(s).`,
    );
    console.log(
      `Registre : ${r.registre.lignes} ligne(s), ${r.registre.offres} offre(s) dont ${r.registre.offres_creees} créée(s) ` +
        `(${r.registre.offres_sans_lien} sans lien), ${r.registre.statuts_ajoutes} statut(s), ${r.registre.notes_ajoutees} note(s), ` +
        `${r.registre.entreprises_corrigees} entreprise(s) corrigée(s).`,
    );
    if (r.suivi.ignore) console.log(`Suivi : non relu (${r.suivi.ignore}).`);
    else
      console.log(
        `Suivi : ${r.suivi.lignes} ligne(s), ${r.suivi.offres_creees} offre(s) créée(s), ${r.suivi.candidatures} candidature(s), ` +
          `${r.suivi.statuts_ajoutes} statut(s).`,
      );
    const J = r.journal;
    console.log(
      `Journaux : ${J.dossiers} dossier(s), ${J.lignes} ligne(s) datée(s), ${J.evenements_crees} événement(s) créé(s), ` +
        `${J.evenements_existants} déjà en base, ${J.evenements_retires} retiré(s), ${J.echeances} échéance(s) ; ` +
        `types : ${Object.entries(J.par_type).map(([t, n]) => `${t} ${n}`).join(', ') || '—'}.`,
    );
    for (const d of J.dossiers_rattaches) console.log(`  dossier rattaché à l'offre #${d.offre_id} : ${d.dossier}`);
    for (const d of J.dossiers_sans_offre) console.log(`  dossier sans offre en base : ${d}`);
    for (const d of J.dossiers_sans_suivi) console.log(`  dossier sans suivi daté : ${d}`);
    if (J.non_typees.length) {
      console.log(`Lignes de journal non typées, reprises en note (${J.non_typees.length}) :`);
      for (const n of J.non_typees) console.log(`  ${n.dossier}:${n.ligne} ${n.extrait}`);
    }
    if (J.sans_date.length) {
      console.log(`Lignes de journal sans date, non reprises (${J.sans_date.length}) :`);
      for (const n of J.sans_date) console.log(`  ${n.dossier}:${n.ligne} ${n.extrait}`);
    }
    for (const f of r.suivi.fusions) console.log(`  doublon fusionné : #${f.doublon} → #${f.offre} (${f.entreprise})`);
    const non = [...r.lots.erreurs, ...r.registre.non_reconnues, ...r.suivi.non_reconnues];
    if (non.length) {
      console.log(`Lignes non reconnues (${non.length}) :`);
      for (const n of non) console.log(`  ${n.fichier}:${n.ligne} ${n.raison} — ${n.extrait}`);
    }
    if (r.registre.liens_non_reconnus.length) {
      console.log(`Liens non reconnus (${r.registre.liens_non_reconnus.length}) :`);
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
    for (const s of statuts ?? []) if (!estStatut(s)) erreur(`Statut inconnu : ${s}`);
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
        ['id', 'note', 'statut', 'source', 'reçue', 'entreprise', 'titre'],
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
    console.log(`Page ${r.page}/${r.pages} · ${r.total} offre(s)`);
  },

  show(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const d = detailOffre(db, entier(pos[0], 'id'));
    if (!d) erreur(`Offre ${pos[0]} introuvable`);
    if (v.json) return json(d);
    console.log(afficherDetail(d));
  },

  'a-lire'(args) {
    const { v } = analyser(args, { limite: { type: 'string' }, complet: { type: 'boolean' } });
    const { db } = contexte(v);
    const r = offresALire(db, { limite: v.limite ? entier(v.limite, 'limite') : 500, complet: Boolean(v.complet) });
    const offres = r.offres;
    if (v.json) return json(r);
    if (!offres.length) return console.log('Aucune offre à lire.');
    for (const o of offres) {
      const mode = { description: 'description extraite', navigateur: 'à lire dans le navigateur', humain: 'page protégée : demander le texte' }[o.lecture];
      console.log(`#${o.id} [${o.source}] ${tronquer(o.titre, 80)}${o.entreprise ? ` — ${o.entreprise}` : ''}`);
      console.log(`    ${o.url ?? '(sans URL)'} · ${mode}`);
    }
    console.log(`${r.total} offre(s) à traiter. Détail JSON (descriptions comprises) : postuler-juste a-lire --json`);
  },

  noter(args) {
    const { v, pos } = analyser(args, { fichier: { type: 'string' }, json: { type: 'string' }, essai: { type: 'boolean' } });
    const { config, db } = contexte(v);
    let entrees: EntreeLot[];
    if (v.fichier) {
      entrees = entreesDuLot(JSON.parse(readFileSync(v.fichier as string, 'utf8').replace(/^﻿/, '')));
    } else {
      if (typeof v.json !== 'string') erreur('noter : --json \'{...}\' ou --fichier lot.json attendu');
      const e = JSON.parse(v.json) as EntreeLot | EntreeLot[];
      entrees = Array.isArray(e) ? e : [e];
      if (pos[0]) {
        if (entrees.length !== 1) erreur('noter <id> : une seule note attendue');
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
      const r = sansErreur(() => initialiserGrille(db, dossier));
      if (v.json) return json({ ok: true, cree: r.cree, chemin: r.chemin, version: r.version.version });
      return console.log(r.cree ? `Grille d'exemple copiée dans ${r.chemin} (version 1) : à adapter.` : `Une grille existe déjà : ${r.chemin}`);
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
      console.log(`Version ${r.version.version} : ${r.version.resume}`);
      return afficherImpact(r.impact);
    }
    if (v.modifier !== undefined) {
      if (!v.essai && !v.resume) erreur('grille --modifier : --resume "…" attendu (ou --essai pour un aperçu)');
      let changement: unknown;
      try {
        changement = JSON.parse(v.modifier as string);
      } catch (e) {
        erreur(`grille --modifier : JSON invalide (${(e as Error).message})`);
      }
      const r = sansErreur(() => modifierGrille(db, dossier, changement, { auteur: 'cli', resume: (v.resume as string) ?? '', essai: Boolean(v.essai) }));
      if (v.json) return json({ ok: true, ...r });
      console.log(r.enregistree ? `Version ${r.version} enregistrée.` : 'Essai : rien n’est enregistré.');
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
    console.log(`${G.nom} — version ${g.version} du ${g.le.slice(0, 10)} (${g.auteur}) : ${g.resume}`);
    console.log(`Fichier : ${cheminGrille(dossier)} · seuil « à regarder » : ${virgule(G.seuil)}`);
    const somme = G.criteres.reduce((s, c) => s + c.poids, 0);
    console.log('\nCritères (poids normalisés) :');
    for (const c of G.criteres) {
      console.log(`  ${c.id.padEnd(14)} ${String(Math.round((c.poids / somme) * 100)).padStart(3)} %  ${c.source === 'ia' ? 'IA    ' : 'calcul'}  ${c.libelle}`);
    }
    const t = G.baremes.teletravail;
    const r = G.baremes.remuneration;
    console.log(`\nTélétravail (0 à 5 j sur site) : ${t.jours_sur_site.join(' / ')} ; inconnu ${t.inconnu}`);
    console.log(
      `Rémunération (${r.reference}) : salaire plancher ${r.salaire.plancher}, cible ${r.salaire.cible_basse}-${r.salaire.cible_haute} K€ ; ` +
        `TJM plancher ${r.tjm.plancher}${r.tjm.plancher_full_remote ? ` (${r.tjm.plancher_full_remote} en full remote)` : ''}, cible ${r.tjm.cible_basse}-${r.tjm.cible_haute} € ; inconnue ${r.inconnue}`,
    );
    console.log('\nRègles bloquantes :');
    for (const x of G.regles) console.log(`  ${x.actif ? '●' : '○'} ${x.id.padEnd(18)} ${(x.effet === 'zero' ? '0' : x.effet === 'plafond' ? `plafond ${x.valeur}` : `${x.critere} < ${x.seuil}`).padEnd(10)} ${x.libelle}`);
    console.log('\nInventaire :');
    for (const n of ['fort', 'moyen', 'leger', 'zero'] as const) {
      const items = G.inventaire.filter((x) => x.niveau === n).map((x) => x.techno);
      if (items.length) console.log(`  ${LIBELLES_NIVEAUX[n].padEnd(6)} ${items.join(', ')}`);
    }
    if (G.exemples.length) {
      console.log('\nExemples de référence :');
      for (const e of G.exemples) console.log(`  ${virgule(noteExemple(G, e).note, 1).padStart(4)}  ${e.entreprise ? `${e.entreprise} — ` : ''}${e.titre}`);
    }
    if (v.consignes) console.log(`\nConsignes pour l'IA :\n${[...G.consignes, ...consignesIa(G)].map((x) => `- ${x}`).join('\n')}`);
  },

  renoter(args) {
    const { v } = analyser(args, {});
    const { config, db } = contexte(v);
    const r = sansErreur(() => renoter(db, config.dossierDonnees));
    if (v.json) return json({ ok: true, ...r });
    console.log(`Grille v${r.version}.`);
    afficherImpact(r.impact);
  },

  statut(args) {
    const { v, pos } = analyser(args, { commentaire: { type: 'string', short: 'm' } });
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    const statut = pos[1];
    if (!statut || !estStatut(statut)) erreur(`Statut attendu parmi : ${STATUTS.join(', ')}`);
    if (!offreParId(db, id)) erreur(`Offre ${id} introuvable`);
    ajouterStatut(db, id, statut, { commentaire: (v.commentaire as string | undefined) ?? null, origine: 'cli' });
    const o = offreParId(db, id)!;
    if (v.json) return json({ ok: true, id, statut: o.statut });
    console.log(`#${id} → ${LIBELLES_STATUTS[o.statut]}`);
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
    if (!offreParId(db, id)) erreur(`Offre ${id} introuvable`);
    const ajouts = reste.slice(1).filter((t) => t.startsWith('+')).map((t) => t.slice(1));
    const retraits = reste.slice(1).filter((t) => t.startsWith('-')).map((t) => t.slice(1));
    const autres = reste.slice(1).filter((t) => !/^[+-]/.test(t));
    if (autres.length) erreur(`tag : préfixer chaque tag par + ou - (${autres.join(' ')})`);
    const tags = modifierTags(db, id, ajouts, retraits);
    if (opts.json) return json({ ok: true, id, tags });
    console.log(`#${id} : ${tags.join(', ') || '(aucun tag)'}`);
  },

  lien(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (!offreParId(db, id)) erreur(`Offre ${id} introuvable`);
    if (pos[1] === undefined) erreur('lien : URL attendue (ou - pour effacer)');
    try {
      modifierLien(db, id, pos[1] === '-' ? null : pos[1]);
    } catch (e) {
      erreur((e as Error).message);
    }
    const o = offreParId(db, id)!;
    if (v.json) return json({ ok: true, id, url: o.url_canonique });
    console.log(`#${id} : ${o.url_canonique ?? '(aucun lien)'}`);
  },

  candidater(args) {
    const { v, pos } = analyser(args, {});
    const { config, db } = contexte(v);
    const id = entier(pos[0], 'id');
    const r = sansErreur(() => preparerCandidature(db, config.dossierDonnees, id, 'cli'));
    if (v.json) return json(r);
    console.log(afficherDetail(r.offre));
    console.log(`\nDossier suggéré : ${r.dossier_suggere}`);
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
    if (Object.values(champs).every((x) => x === undefined)) erreur('candidature : au moins une option attendue (--dossier, --canal…)');
    const r = sansErreur(() => suivreCandidature(db, id, champs, 'cli'));
    if (v.json) return json({ ok: true, id, statut: r.offre.statut, statut_ajoute: r.statut_ajoute, candidature: r.offre.candidature });
    console.log(afficherDetail(r.offre).split('\n\nDescription :')[0]);
  },

  'prochaine-action'(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (pos[1] === undefined) erreur('prochaine-action : texte attendu ("" ou - pour effacer)');
    const texte = pos.slice(1).join(' ');
    const r = sansErreur(() => suivreCandidature(db, id, { prochaine_action: texte === '-' ? null : texte }, 'cli'));
    const action = r.offre.candidature?.prochaine_action ?? null;
    if (v.json) return json({ ok: true, id, prochaine_action: action });
    console.log(`#${id} : ${action ?? '(aucune prochaine action)'}`);
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
    if (!v.type) erreur(`evenement : --type attendu (${TYPES_EVENEMENT.join(', ')})`);
    if (!v.resume) erreur('evenement : --resume "…" attendu');
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
    console.log(`Événement #${e.id} ajouté à l'offre #${id} : ${dateEvenementFr(e.le)} ${e.type}${e.fait ? '' : ' (échéance)'} — ${e.resume}`);
  },

  journal(args) {
    const { v, pos } = analyser(args, {});
    const { db } = contexte(v);
    const id = entier(pos[0], 'id');
    const o = offreParId(db, id);
    if (!o) erreur(`Offre ${id} introuvable`);
    const j = journal(db, id);
    if (v.json) return json({ ok: true, id, evenements: j });
    console.log(`#${id} ${o.titre}${o.entreprise ? ` — ${o.entreprise}` : ''}`);
    if (!j.length) return console.log('  (journal vide)');
    for (const e of j) console.log(ligneJournal(e));
  },

  echeances(args) {
    const { v } = analyser(args, { jours: { type: 'string' } });
    const { db } = contexte(v);
    const r = sansErreur(() => echeances(db, { jours: v.jours !== undefined ? Number(v.jours) : 7 }));
    if (v.json) return json({ ok: true, ...r });
    const ligne = (e: (typeof r.a_venir)[number]) =>
      `  #${String(e.id).padEnd(5)} ${dateEvenementFr(e.le).padEnd(19)} offre #${e.offre_id} ${tronquer(e.entreprise ?? e.titre, 28).padEnd(28)} ${LIBELLES_TYPES[e.type]} : ${tronquer(e.resume, 80)}`;
    console.log(`En retard (${r.en_retard.length}) :`);
    for (const e of r.en_retard) console.log(ligne(e));
    console.log(`À venir jusqu'au ${dateEvenementFr(r.jusqua)} (${r.a_venir.length}) :`);
    for (const e of r.a_venir) console.log(ligne(e));
  },

  fait(args) {
    const { v, pos } = analyser(args, { fait: { type: 'boolean' } });
    const { db } = contexte(v);
    const id = entier(pos[0], 'evenement_id');
    sansErreur(() => evenementOuErreur(db, id));
    const e = marquerFait(db, id, v.fait !== false);
    if (v.json) return json({ ok: true, evenement: e });
    console.log(`Événement #${id} ${e.fait ? 'fait' : 'rouvert (à faire)'} : ${e.resume}`);
  },

  fichiers(args) {
    const { v, pos } = analyser(args, {});
    const { config, db } = contexte(v);
    const id = entier(pos[0], 'id');
    if (!offreParId(db, id)) erreur(`Offre ${id} introuvable`);
    const r = fichiersDossier(db, config.dossierDonnees, id);
    if (v.json) return json({ ok: true, ...r });
    if (!r.dossier) return console.log(`#${id} : pas de dossier de candidature (postuler-juste candidature ${id} --dossier candidatures/…)`);
    if (!r.existe) return console.log(`#${id} : dossier ${r.dossier} absent du dossier de données`);
    console.log(`${r.dossier} (${r.fichiers.length} fichier(s)) :`);
    for (const f of r.fichiers) {
      console.log(`  ${f.chemin.padEnd(70)} ${String(Math.ceil(f.taille / 1024)).padStart(5)} Ko  ${f.modifie_le.slice(0, 10)}`);
    }
  },

  stats(args) {
    const { v } = analyser(args, {});
    const { db } = contexte(v);
    const s = statistiques(db);
    if (v.json) return json({ ok: true, ...s });
    console.log(`Envoyées : ${s.envoyees} · réponse : ${s.reponses} · entretien : ${s.entretiens} · proposition : ${s.propositions}`);
    console.log(
      s.delai_moyen_reponse_jours === null
        ? 'Délai avant première réponse : pas assez de données datées.'
        : `Délai moyen avant la première réponse : ${String(s.delai_moyen_reponse_jours).replace('.', ',')} j (sur ${s.delai_base} candidature(s)).`,
    );
  },

  'generer-suivi'(args) {
    const { v } = analyser(args, { sortie: { type: 'string', short: 'o' }, remplacer: { type: 'boolean' } });
    const { config, db } = contexte(v);
    const r = ecrireSuivi(db, config.dossierDonnees, { sortie: v.sortie as string | undefined, remplacer: Boolean(v.remplacer) });
    if (v.json) return json({ ok: true, ...r });
    console.log(`${r.fichier} : ${r.en_cours} en cours, ${r.sans_suite} envoyée(s) sans suite, ${r.closes} close(s).`);
  },

  async mcp(args) {
    const { v } = analyser(args, {});
    const { config, db } = contexte(v);
    const { demarrerMcp } = await import('../mcp/serveur.ts');
    await demarrerMcp(db, config);
  },

  async serve(args) {
    const { v } = analyser(args, { port: { type: 'string' }, inactivite: { type: 'string' } });
    const { config, db } = contexte(v);
    const port = v.port ? entier(v.port, 'port') : config.port;
    await demarrerServeur({ db, config, port, inactiviteMin: nombre(v.inactivite, 'inactivite') ?? 0 });
  },

  init(args) {
    const { v, pos } = analyser(args, { port: { type: 'string' }, 'nom-mcp': { type: 'string' } });
    if (pos.length !== 1) erreur('Usage : postuler-juste init <dossier> [--port 4410] [--nom-mcp postuler-juste]');
    const r = initialiserEspace({
      dossier: pos[0],
      port: v.port ? entier(v.port, 'port') : undefined,
      nomMcp: v['nom-mcp'] as string | undefined,
    });
    if (v.json) return json(r);
    console.log(`Espace de travail créé : ${r.dossier}`);
    console.log(`  configuration : ${r.config} (port ${r.port})`);
    console.log(`  serveur MCP « ${r.nom_mcp} » : ${r.mcp}`);
    console.log(`  navigateur pour les PDF : ${r.navigateur ?? 'aucun'}`);
    for (const a of r.avertissements) console.log(`  ⚠ ${a}`);
    console.log(`\nCommande de l'application, depuis l'espace : ${r.commande}`);
    console.log('\nÉtapes suivantes :');
    console.log(`  1. Dépose ton CV et l'export PDF de ton profil LinkedIn dans ${r.dossier}/a-deposer/`);
    console.log(`  2. Ouvre ton IA dans ${r.dossier} (Claude Code : cd dans le dossier puis « claude », et accepte le serveur MCP)`);
    console.log('  3. Colle-lui ce prompt :\n');
    console.log(r.invite);
  },

  cv(args) {
    const { v, pos } = analyser(args, { gabarit: { type: 'string' }, capture: { type: 'boolean' } });
    if (!pos.length) erreur('Usage : postuler-juste cv <cv.md>… [--gabarit <dossier>] [--capture]');
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
    if (!navigateur) erreur('Aucun Chrome, Edge ou Chromium trouvé (indiquer son chemin dans POSTULER_JUSTE_NAVIGATEUR)');
    const resultats = pos.map((md) => sansErreur(() => genererCv(md, gabarit, navigateur, { capture: Boolean(v.capture) })));
    if (v.json) return json({ ok: true, gabarit, cv: resultats });
    for (const r of resultats) {
      console.log(`${String(r.pages).padStart(2)} page(s)  ${r.pdf}${r.pages > 2 ? '  <-- DÉPASSE 2 PAGES' : ''}`);
      if (resultats.length === 1) console.log(`HTML : ${r.html}\nPDF  : ${r.pdf}${r.capture ? `\nIMAGE : ${r.capture}` : ''}\nPAGES : ${r.pages}`);
    }
  },

  aide() {
    process.stdout.write(AIDE);
  },
};

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(AIDE);
    return 0;
  }
  const fn = commandes[cmd];
  if (!fn) {
    process.stderr.write(`Commande inconnue : ${cmd}\n\n${AIDE}`);
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(AIDE);
    return 0;
  }
  try {
    await fn(args);
    return 0;
  } catch (e) {
    const err = e as Error & { utilisateur?: boolean; code?: string };
    const message = err.code?.startsWith('ERR_PARSE_ARGS') || err.utilisateur ? err.message : (err.stack ?? err.message);
    if (args.includes('--json')) process.stderr.write(`${JSON.stringify({ ok: false, erreur: err.message })}\n`);
    else process.stderr.write(`Erreur : ${message}\n`);
    return 1;
  }
}
