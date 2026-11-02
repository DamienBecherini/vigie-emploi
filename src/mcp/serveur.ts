// Serveur MCP (transport stdio) : expose le noyau de cap-emploi à une IA (Claude Code, Claude Desktop…).
// Aucune logique propre ici : chaque outil appelle les mêmes fonctions que la CLI et l'API.
// stdout est réservé au protocole : rien d'autre ne doit y être écrit.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Config } from '../core/config.ts';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { listerOffres, TAILLE_MAX } from '../core/requetes.ts';
import { ajouterStatut, detailOffre, modifierLien, modifierTags } from '../core/offres.ts';
import { noterOffres, offreOuErreur, offresALire, preparerCandidature, suivreCandidature } from '../core/actions.ts';
import type { EntreeLot } from '../core/notation.ts';
import { COLONNES_TRI, STATUTS } from '../core/statuts.ts';
import { ingererSelonConfig } from '../ingest/ingest.ts';
import { ecrireSuivi } from '../export/suivi.ts';
import {
  ajouterEvenement,
  echeances,
  evenementOuErreur,
  journal,
  marquerFait,
  modifierEvenement,
  TYPES_EVENEMENT,
} from '../core/evenements.ts';
import { fichiersDossier } from '../core/fichiers.ts';

const ORIGINE = 'mcp';

const INSTRUCTIONS = `cap-emploi garde l'état des offres d'emploi et de mission de l'utilisateur (base SQLite locale) :
offres, notes, statuts, tags, candidatures. L'application n'appelle aucun modèle : c'est toi qui lis et notes.
Flux habituel : ingerer_emails → offres_a_lire → (lire chaque offre, la noter selon la grille de l'utilisateur)
→ noter_lot → résumer à l'utilisateur → sur son « go » : candidater, préparer le dossier, enregistrer_candidature
→ generer_suivi. Sans « go » : changer_statut vers « ecartee » avec la raison.
Quand l'utilisateur raconte un appel, un entretien, un message, un devis : ajouter_evenement (avec le fichier
du dossier s'il y en a un, voir fichiers_dossier), puis la prochaine échéance (ajouter_evenement daté dans
le futur, fait: false). echeances liste ce qui est en retard ou à venir ; marquer_fait clôt une échéance.
Ne télécharge pas LinkedIn, Indeed ni Glassdoor par script : lis ces pages dans le navigateur de l'utilisateur
ou demande-lui le texte. La grille de notation et les consignes de candidature sont dans le dossier de données
de l'utilisateur (renvoyé par candidater) : les lire avant de noter ou de rédiger.`;

const id = z.number().int().positive().describe("Identifiant de l'offre dans cap-emploi (champ id)");
const texteFacultatif = (d: string) => z.string().nullable().optional().describe(d);
const nombreNote = (d: string) => z.union([z.number().min(0).max(10), z.string()]).nullable().optional().describe(d);

/** Une note au format des lots (fichiers candidatures/_lots/*.json). */
const champsNote = {
  note: nombreNote('Note finale sur 10 (après pénalités), ex. 6 ou 5.5'),
  note_brute: nombreNote('Note avant pénalités, sur 10'),
  penalites: z.string().optional().describe('Pénalités appliquées, en clair : « -0,5 difficultés (…) »'),
  colle: z.string().optional().describe("Ce qui colle avec le profil de l'utilisateur"),
  ecarts: z.string().optional().describe('Écarts à assumer ou raisons de ne pas y aller'),
  lu: z.boolean().optional().describe("true si l'offre complète a été lue (pas seulement l'intitulé)"),
  grille_version: z.string().optional().describe('Version de la grille de notation utilisée, si elle en a une'),
  tags: z.array(z.string()).optional().describe("Tags à ajouter à l'offre (ex. wordpress, a-reprendre)"),
};
const champsDescriptifs = {
  source: z.string().optional().describe('Site de l’offre si elle est créée par son URL : linkedin, indeed, hellowork…'),
  titre: z.string().optional().describe("Intitulé du poste (ne complète que s'il manque en base)"),
  entreprise: z.string().optional().describe('Entreprise (ne complète que si elle manque)'),
  lieu: z.string().optional(),
  contrat: z.string().optional().describe('CDI, CDD, Freelance…'),
  remuneration: z.string().optional().describe('Texte libre : « 50-60 K€ », « 450 €/j »'),
  teletravail: z.string().optional().describe('full remote, hybride, 2 j/sem…'),
  publiee: z.string().optional().describe('Date de publication JJ/MM/AAAA, ou NC'),
  stack: z.string().optional().describe('Technologies demandées'),
  description: z.string().optional().describe("Texte de l'offre, s'il n'est pas déjà en base"),
};
const entreeLot = z.object({
  id: id.optional().describe('Identifiant cap-emploi (sinon url)'),
  url: z.string().optional().describe("URL de l'offre (si pas d'id) : l'offre est retrouvée, ou créée"),
  ...champsDescriptifs,
  ...champsNote,
});

function resultat(x: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(x, null, 2) }] };
}

function echec(e: unknown): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: `Erreur : ${(e as Error).message}` }] };
}

/** Exécute l'outil et transforme toute exception en résultat d'erreur lisible par l'IA. */
function sur<A>(fn: (a: A) => unknown | Promise<unknown>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return resultat(await fn(a));
    } catch (e) {
      return echec(e);
    }
  };
}

function normaliserEntree(e: z.infer<typeof entreeLot>): EntreeLot {
  if (e.id === undefined && !e.url) throw new Error('Chaque note doit avoir un "id" ou une "url"');
  return e as EntreeLot;
}

export function creerServeurMcp(db: Base, config: Config): McpServer {
  const serveur = new McpServer({ name: 'cap-emploi', version: '0.3.0' }, { instructions: INSTRUCTIONS });
  const lecture = { readOnlyHint: true, openWorldHint: false };

  serveur.registerTool(
    'lister_offres',
    {
      title: 'Lister les offres',
      description:
        "Liste paginée des offres en base (sans la description : lire_offre pour le détail). Mêmes filtres que la commande « cap-emploi list ». " +
        'Sert aussi à vérifier si une offre ou une entreprise a déjà été vue (texte). Renvoie total, page, pages et offres.',
      inputSchema: {
        statuts: z.array(z.enum(STATUTS)).optional().describe(`Statuts retenus, parmi : ${STATUTS.join(', ')}`),
        sources: z.array(z.string()).optional().describe('Sources : linkedin, indeed, glassdoor, hellowork, free-work, registre, suivi, manuel'),
        tags: z.array(z.string()).optional().describe('Tags (toutes requises)'),
        note_min: z.number().optional().describe('Note minimale (incluse)'),
        note_max: z.number().optional().describe('Note maximale (incluse)'),
        sans_note: z.boolean().optional().describe('true : seulement les offres sans note ; false : seulement les notées'),
        texte: z.string().optional().describe('Recherche plein texte (titre, entreprise, description, stack ; accents ignorés)'),
        contrat: z.string().optional().describe('Contrat contenant ce texte (CDI, Freelance…)'),
        teletravail: z.string().optional().describe('Télétravail contenant ce texte (remote, hybride…)'),
        recue_depuis: z.string().optional().describe('Reçue à partir du AAAA-MM-JJ'),
        recue_jusqua: z.string().optional().describe("Reçue jusqu'au AAAA-MM-JJ inclus"),
        publiee_depuis: z.string().optional().describe('Publiée à partir du AAAA-MM-JJ'),
        mes_candidatures: z.boolean().optional().describe('true : seulement les candidatures envoyées et suivantes'),
        page: z.number().int().min(1).optional().describe('Page (1 par défaut)'),
        taille: z.number().int().min(1).max(TAILLE_MAX).optional().describe('Offres par page (50 par défaut)'),
        tri: z.enum(COLONNES_TRI).optional().describe('Colonne de tri (recue_le par défaut)'),
        ordre: z.enum(['asc', 'desc']).optional().describe('Ordre (desc par défaut)'),
      },
      annotations: lecture,
    },
    sur((a) =>
      listerOffres(db, {
        statuts: a.statuts,
        sources: a.sources,
        tags: a.tags,
        noteMin: a.note_min,
        noteMax: a.note_max,
        sansNote: a.sans_note,
        q: a.texte,
        contrat: a.contrat,
        teletravail: a.teletravail,
        recueDepuis: a.recue_depuis,
        recueJusqua: a.recue_jusqua,
        publieeDepuis: a.publiee_depuis,
        mesCandidatures: a.mes_candidatures,
        page: a.page,
        taille: a.taille,
        tri: a.tri,
        ordre: a.ordre,
      }),
    ),
  );

  serveur.registerTool(
    'lire_offre',
    {
      title: 'Lire une offre',
      description:
        "Détail complet d'une offre : champs, description, toutes les notes (la première est la plus récente), historique des statuts, tags, candidature.",
      inputSchema: { id },
      annotations: lecture,
    },
    sur(({ id }) => {
      offreOuErreur(db, id);
      return detailOffre(db, id);
    }),
  );

  serveur.registerTool(
    'offres_a_lire',
    {
      title: 'Offres à lire',
      description:
        'Offres à traiter (statut nouvelle ou a-lire) sans note, des plus anciennes aux plus récentes. Champ « lecture » : ' +
        '« description » = le texte est dans « description » ; « navigateur » = ouvrir « url » dans le navigateur de l’utilisateur ; ' +
        '« humain » = page protégée (Glassdoor), demander le texte à l’utilisateur.',
      inputSchema: {
        limite: z.number().int().min(1).max(TAILLE_MAX).optional().describe('Nombre maximal d’offres (500 par défaut)'),
        complet: z.boolean().optional().describe('true : descriptions entières (sinon tronquées à 2 500 caractères)'),
      },
      annotations: lecture,
    },
    sur((a) => offresALire(db, { limite: a.limite, complet: a.complet })),
  );

  serveur.registerTool(
    'noter_offre',
    {
      title: 'Noter une offre',
      description:
        "Enregistre une note pour une offre, désignée par id (ou par url : l'offre est créée si elle n'existe pas). La note s'ajoute " +
        "à l'historique (la dernière fait foi) ; une offre encore à traiter passe en « notee ». Les champs descriptifs ne complètent " +
        'que ce qui manque en base.',
      inputSchema: entreeLot.shape,
    },
    sur((e) => {
      const [r] = noterOffres(db, [normaliserEntree(e)], ORIGINE);
      return { ok: true, ...r };
    }),
  );

  serveur.registerTool(
    'noter_lot',
    {
      title: 'Noter un lot',
      description:
        'Enregistre plusieurs notes d’un coup (format des fichiers de lot : chaque entrée a un id ou une url, et les champs de noter_offre). ' +
        'Tout ou rien : une entrée invalide annule le lot.',
      inputSchema: { offres: z.array(entreeLot).min(1).describe('Entrées du lot') },
    },
    sur(({ offres }) => {
      const r = noterOffres(db, offres.map(normaliserEntree), ORIGINE);
      return { ok: true, notees: r.length, offres: r };
    }),
  );

  serveur.registerTool(
    'changer_statut',
    {
      title: 'Changer le statut',
      description:
        "Ajoute un statut à l'historique de l'offre (le dernier fait foi). « ecartee » quand l'utilisateur ne donne pas de go (mettre la raison " +
        'en commentaire), « envoyee », « relancee », « entretien », « refus », « close », « abandonnee » pour la suite d’une candidature.',
      inputSchema: {
        id,
        statut: z.enum(STATUTS).describe(`Nouveau statut, parmi : ${STATUTS.join(', ')}`),
        commentaire: z.string().optional().describe('Raison, canal, date… (gardé dans l’historique)'),
      },
    },
    sur(({ id, statut, commentaire }) => {
      offreOuErreur(db, id);
      ajouterStatut(db, id, statut, { commentaire: commentaire ?? null, origine: ORIGINE });
      return { ok: true, id, statut: detailOffre(db, id)!.statut };
    }),
  );

  serveur.registerTool(
    'modifier_tags',
    {
      title: 'Modifier les tags',
      description: "Ajoute et retire des tags sur une offre (minuscules, espaces remplacés par des tirets). Renvoie les tags à jour.",
      inputSchema: {
        id,
        ajouter: z.array(z.string()).optional().describe('Tags à ajouter'),
        retirer: z.array(z.string()).optional().describe('Tags à retirer'),
      },
    },
    sur(({ id, ajouter, retirer }) => {
      offreOuErreur(db, id);
      return { ok: true, id, tags: transaction(db, () => modifierTags(db, id, ajouter ?? [], retirer ?? [])) };
    }),
  );

  serveur.registerTool(
    'modifier_lien',
    {
      title: 'Modifier le lien',
      description: "Enregistre le lien (URL http ou https) de l'offre, ou l'efface avec null.",
      inputSchema: { id, url: z.string().nullable().describe('Nouvelle URL, ou null pour effacer') },
    },
    sur(({ id, url }) => {
      offreOuErreur(db, id);
      modifierLien(db, id, url);
      return { ok: true, id, url: detailOffre(db, id)!.url_canonique };
    }),
  );

  serveur.registerTool(
    'candidater',
    {
      title: 'Candidater',
      description:
        "À appeler sur le « go » de l'utilisateur : passe l'offre en « go » (si elle n'est pas déjà plus avancée) et renvoie tout pour préparer " +
        "la candidature : l'offre complète, le dossier de données, un dossier de candidature suggéré (candidatures/<entreprise-poste>) et les étapes. " +
        'Ensuite : créer le dossier selon les consignes de l’utilisateur, puis enregistrer_candidature.',
      inputSchema: { id },
    },
    sur(({ id }) => preparerCandidature(db, config.dossierDonnees, id, ORIGINE)),
  );

  serveur.registerTool(
    'enregistrer_candidature',
    {
      title: 'Enregistrer la candidature',
      description:
        "Crée ou met à jour la candidature d'une offre. Un champ absent est conservé ; null ou chaîne vide l'efface. Avec envoyee_le, " +
        "une offre pas encore envoyée passe en « envoyee ». La prochaine action apparaît dans le suivi (generer_suivi).",
      inputSchema: {
        id,
        dossier: texteFacultatif('Dossier de candidature, relatif au dossier de données : candidatures/<entreprise-poste>'),
        cv: texteFacultatif('CV envoyé (chemin relatif au dossier de données, ex. CV/….pdf)'),
        canal: texteFacultatif('Canal : LinkedIn, Hellowork, Malt, e-mail, site du recruteur…'),
        envoyee_le: texteFacultatif("Date d'envoi JJ/MM/AAAA ou AAAA-MM-JJ (ou texte libre : « ≈ 25/08/2026 »)"),
        message: texteFacultatif('Message envoyé (version envoyée)'),
        prochaine_action: texteFacultatif('Prochaine action à mener : « Relancer le 04/11 », « Au 1er contact : salaire, télétravail »'),
      },
    },
    sur(({ id, ...champs }) => {
      const r = suivreCandidature(db, id, champs, ORIGINE);
      return { ok: true, id, statut: r.offre.statut, statut_ajoute: r.statut_ajoute, candidature: r.offre.candidature };
    }),
  );

  const champsEvenement = {
    sens: z.enum(['envoye', 'recu']).nullable().optional().describe("Pour un message : « envoye » (par l'utilisateur) ou « recu »"),
    details: texteFacultatif('Texte libre plus long (contexte, ce qui a été dit) ; pas de copie de document : citer le fichier'),
    canal: texteFacultatif('Canal : LinkedIn, Malt, e-mail, téléphone, Zoom, Teams…'),
    interlocuteurs: texteFacultatif('Personnes concernées : « Zoé (RH), M. Gabord (directeur digital) »'),
    montant: z.number().nullable().optional().describe('Montant (proposition, devis, salaire) : 3000, 450, 55'),
    unite: texteFacultatif('Unité du montant : « € HT », « €/j », « K€/an »'),
    jours: z.number().nullable().optional().describe("Nombre de jours d'un devis"),
    fichiers: z
      .array(z.string())
      .nullable()
      .optional()
      .describe('Fichiers liés, chemins relatifs au dossier de données (« candidatures/x/devis.md ») : voir fichiers_dossier'),
  };

  serveur.registerTool(
    'ajouter_evenement',
    {
      title: 'Ajouter un événement au journal',
      description:
        "Ajoute un événement daté au journal de la candidature d'une offre : message envoyé ou reçu, entretien ou appel, test, " +
        "proposition ou devis (montant, unité, jours), décision (refus, go, abandon), note. Daté dans le futur et pas fait, c'est une " +
        "échéance (relance, entretien prévu…) : elle apparaît dans echeances et devient la prochaine action du suivi. À appeler quand " +
        "l'utilisateur raconte un échange : l'événement, puis la prochaine échéance. Le contenu d'un document reste dans le dossier " +
        "de candidature : ne mettre que son chemin dans fichiers. « fait » vaut par défaut false pour une date future, true sinon.",
      inputSchema: {
        id,
        type: z.enum(TYPES_EVENEMENT).describe(`Type : ${TYPES_EVENEMENT.join(', ')}`),
        le: z
          .string()
          .optional()
          .describe("Date : JJ/MM/AAAA, JJ/MM/AAAA HH:MM, AAAA-MM-JJ, AAAA-MM-JJTHH:MM, « demain », « +3 » (jours). Défaut : maintenant"),
        resume: z.string().min(1).describe('Résumé court : « Appel avec Zoé : périmètre validé », « Relancer si sans nouvelles »'),
        fait: z.boolean().optional().describe('false : échéance à faire ; true : déjà fait. Défaut selon la date'),
        ...champsEvenement,
      },
    },
    sur(({ id, ...saisie }) => ({ ok: true, evenement: ajouterEvenement(db, id, saisie, ORIGINE) })),
  );

  serveur.registerTool(
    'modifier_evenement',
    {
      title: 'Modifier un événement',
      description:
        "Corrige un événement du journal (par son identifiant, champ id des événements). Champ absent = inchangé ; null = effacé " +
        '(sauf type, date et résumé). Pour clore une échéance, marquer_fait suffit.',
      inputSchema: {
        evenement_id: z.number().int().positive().describe("Identifiant de l'événement"),
        type: z.enum(TYPES_EVENEMENT).optional(),
        le: z.string().optional().describe('Nouvelle date (mêmes formats que ajouter_evenement)'),
        resume: z.string().min(1).optional(),
        fait: z.boolean().optional(),
        ...champsEvenement,
      },
    },
    sur(({ evenement_id, ...saisie }) => ({ ok: true, evenement: modifierEvenement(db, evenement_id, saisie) })),
  );

  serveur.registerTool(
    'journal',
    {
      title: 'Journal de la candidature',
      description:
        "Journal d'une offre : échéances pas encore faites d'abord (les retards en tête, en_retard: true), puis les événements faits, " +
        'du plus récent au plus ancien. Chaque événement : id, type, sens, le, fait, resume, details, canal, interlocuteurs, montant, ' +
        'unite, jours, fichiers.',
      inputSchema: { id },
      annotations: lecture,
    },
    sur(({ id }) => {
      offreOuErreur(db, id);
      return { id, evenements: journal(db, id) };
    }),
  );

  serveur.registerTool(
    'echeances',
    {
      title: 'Échéances',
      description:
        "Échéances de toutes les candidatures : en_retard (date passée, pas faites) et a_venir (d'aujourd'hui à N jours), avec " +
        "l'offre (offre_id, entreprise, titre, statut). À consulter en début de session pour dire à l'utilisateur ce qui l'attend.",
      inputSchema: { jours: z.number().int().min(0).max(366).optional().describe('Horizon en jours (7 par défaut)') },
      annotations: lecture,
    },
    sur(({ jours }) => echeances(db, { jours })),
  );

  serveur.registerTool(
    'marquer_fait',
    {
      title: 'Marquer une échéance faite',
      description:
        "Marque un événement comme fait (l'échéance disparaît des échéances), ou le rouvre avec fait: false. Ajouter ensuite, s'il y a " +
        'lieu, ce qui s’est passé (ajouter_evenement) et la prochaine échéance.',
      inputSchema: {
        evenement_id: z.number().int().positive().describe("Identifiant de l'événement"),
        fait: z.boolean().optional().describe('true par défaut ; false pour rouvrir'),
      },
    },
    sur(({ evenement_id, fait }) => {
      evenementOuErreur(db, evenement_id);
      return { ok: true, evenement: marquerFait(db, evenement_id, fait ?? true) };
    }),
  );

  serveur.registerTool(
    'fichiers_dossier',
    {
      title: 'Fichiers du dossier de candidature',
      description:
        "Liste les fichiers du dossier de candidature d'une offre (chemin relatif au dossier de données, nom, taille, date) : " +
        "ce sont les chemins à citer dans « fichiers » d'un événement. Liste vide si la candidature n'a pas de dossier (le fixer avec " +
        'enregistrer_candidature, champ dossier).',
      inputSchema: { id },
      annotations: lecture,
    },
    sur(({ id }) => {
      offreOuErreur(db, id);
      return fichiersDossier(db, config.dossierDonnees, id);
    }),
  );

  serveur.registerTool(
    'ingerer_emails',
    {
      title: 'Ingérer les e-mails',
      description:
        `Lit les e-mails d'alertes (.eml) de la boîte de réception (${config.emails}), ajoute les nouvelles offres (doublons ignorés, ` +
        "intitulés exclus mis en « ecartee »), lit les descriptions publiques Hellowork / Free-Work, puis SUPPRIME les e-mails traités, sauf avec garder: true. " +
        'Renvoie nouvelles, doublons, ecartees, a_lire, erreurs et le détail. Suite : offres_a_lire.',
      inputSchema: {
        garder: z.boolean().optional().describe('true : conserver les .eml après traitement (option --keep)'),
        telecharger: z.boolean().optional().describe('false : ne pas lire les pages Hellowork / Free-Work'),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    sur((a) => ingererSelonConfig(db, config, { garder: a.garder, telecharger: a.telecharger })),
  );

  serveur.registerTool(
    'generer_suivi',
    {
      title: 'Générer le suivi',
      description:
        'Génère le suivi des candidatures en Markdown depuis la base (sections En cours, Envoyées sans suite, Closes). Par défaut ' +
        "dans candidatures/_SUIVI.genere.md (aperçu) ; remplacer: true écrit candidatures/_SUIVI.md, à ne faire que si l'utilisateur l'a demandé.",
      inputSchema: {
        remplacer: z.boolean().optional().describe('true : écrire candidatures/_SUIVI.md au lieu de l’aperçu'),
        sortie: z.string().optional().describe('Fichier de sortie imposé (chemin absolu)'),
      },
    },
    sur((a) => ({ ok: true, ...ecrireSuivi(db, config.dossierDonnees, { remplacer: a.remplacer, sortie: a.sortie }) })),
  );

  return serveur;
}

export async function demarrerMcp(db: Base, config: Config): Promise<void> {
  const serveur = creerServeurMcp(db, config);
  const transport = new StdioServerTransport();
  const fermer = async () => {
    await serveur.close().catch(() => undefined);
    db.close();
    process.exit(0);
  };
  process.stdin.on('end', fermer);
  process.on('SIGINT', fermer);
  process.on('SIGTERM', fermer);
  await serveur.connect(transport);
  process.stderr.write(`cap-emploi MCP prêt (données : ${config.dossierDonnees})\n`);
}
