// Interface en ligne de commande de cap-emploi (pensée pour être pilotée par une IA : sorties JSON stables).
import { readFileSync } from 'node:fs';
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

const AIDE = `cap-emploi — offres, notes et candidatures (base SQLite locale)

Usage : cap-emploi <commande> [options]

Commandes
  ingest [--keep] [--no-fetch] [--emails <dossier>]
                        Lit les .eml de la boîte de réception, ajoute les nouvelles offres,
                        puis supprime les e-mails traités (sauf --keep)
  import-historique     Reprend candidatures/_lots/*.json, _ecartees.md et _SUIVI.md (idempotent)
  list [filtres]        Liste paginée des offres
      --statut a,b  --note-min N  --note-max N  --sans-note  --source s1,s2  --tag t
      --depuis AAAA-MM-JJ  --jusqua AAAA-MM-JJ (date de réception)  --texte "mots"
      --contrat CDI  --teletravail remote  --candidatures  --page N  --taille N
      --tri note|recue_le|publiee_le|titre|entreprise|…  --ordre asc|desc
  show <id>             Détail d'une offre (notes, statuts, tags, candidature)
  a-lire [--limite N] [--complet]
                        Offres à traiter sans note, avec l'URL à lire (ou la description déjà extraite)
  noter <id> --json '{"note": 6, "note_brute": 6.5, "penalites": "...", "colle": "...", "ecarts": "..."}'
  noter --fichier lot.json
                        Enregistre des notes (format des lots : {source, url, titre, …, note, colle, ecarts, lu})
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
  generer-suivi [--sortie <fichier>] [--remplacer]
                        Génère le suivi des candidatures depuis la base : par défaut
                        candidatures/_SUIVI.genere.md (aperçu) ; --remplacer écrit candidatures/_SUIVI.md
  serve [--port 4410]   Lance le tableau de bord (http://localhost:4410)
  mcp                   Serveur MCP (transport stdio) pour piloter cap-emploi depuis une IA

Options générales
  --data <dossier>      Dossier de données (sinon CAP_EMPLOI_DATA ou cap-emploi.config.json)
  --config <fichier>    Fichier de configuration
  --json                Sortie JSON (toutes les commandes)
`;

type Valeurs = Record<string, string | boolean | undefined>;

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

function analyser(args: string[], options: Record<string, { type: 'string' | 'boolean'; short?: string }>) {
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
  if (n) {
    l.push('', `Note ${n.note ?? '—'} (brute ${n.note_brute ?? '—'}${n.penalites ? `, pénalités : ${n.penalites}` : ''}) le ${n.notee_le}`);
    if (n.colle) l.push(`Ce qui colle : ${n.colle}`);
    if (n.ecarts) l.push(`Écarts : ${n.ecarts}`);
  }
  if (d.candidature) {
    const c = d.candidature;
    l.push('', `Candidature : ${[c.dossier, c.canal, c.envoyee_le && `envoyée le ${c.envoyee_le}`].filter(Boolean).join(' · ')}`);
    if (c.prochaine_action) l.push(`Prochaine action : ${c.prochaine_action}`);
  }
  if (d.statuts.length) {
    l.push('', 'Historique des statuts :');
    for (const s of d.statuts) l.push(`  ${s.le.slice(0, 10)}  ${s.statut.padEnd(10)} ${tronquer(s.commentaire, 100)}`);
  }
  if (d.description) l.push('', 'Description :', d.description);
  return l.join('\n');
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
    if (r.nouvelles) console.log('Suite : cap-emploi a-lire');
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
    console.log(`${r.total} offre(s) à traiter. Détail JSON (descriptions comprises) : cap-emploi a-lire --json`);
  },

  noter(args) {
    const { v, pos } = analyser(args, { fichier: { type: 'string' }, json: { type: 'string' } });
    const { db } = contexte(v);
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
    const resultats = sansErreur(() => noterOffres(db, entrees, 'cli'));
    json({ ok: true, notees: resultats.length, offres: resultats });
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
    const { v } = analyser(args, { port: { type: 'string' } });
    const { config, db } = contexte(v);
    const port = v.port ? entier(v.port, 'port') : config.port;
    await demarrerServeur({ db, config, port });
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
