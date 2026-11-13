// Serveur MCP (transport stdio) : expose le noyau de postuler-juste à une IA (Claude Code, Claude Desktop…).
// Aucune logique propre ici : chaque outil appelle les mêmes fonctions que la CLI et l'API.
// stdout est réservé au protocole : rien d'autre ne doit y être écrit.
// Langue : celle de la configuration (clé « langue » ou POSTULER_JUSTE_LANGUE), fixée à la création du serveur ;
// les noms des outils, des paramètres et des statuts restent en français (identifiants).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ErreurConfig, RACINE_APP, variable } from '../core/config.ts';
import type { OptionsConfig } from '../core/config.ts';
import type { Base } from '../db/base.ts';
import { transaction } from '../db/base.ts';
import { listerOffres } from '../core/requetes.ts';
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
import { consignesIa, exemplesCalcules, schemaChangement, UNITES } from '../core/grille.ts';
import {
  cheminGrille,
  grilleCourante,
  grilleObligatoire,
  historiqueGrille,
  modifierGrille,
  renoter,
  restaurerGrille,
  versionGrille,
} from '../core/grille-stockage.ts';
import { definirLangue } from '../i18n/index.ts';
import { messageNonInitialise, ouvrirEtat, type EtatMcp } from './etat.ts';
import { enregistrerOutilsEspace } from './espace.ts';
import { enregistrerOutilTableauDeBord } from './tableau-de-bord.ts';
import { sur } from './resultats.ts';
import { bi } from './textes.ts';
import {
  A_LIRE_DEFAUT,
  A_LIRE_MAX,
  A_LIRE_MAX_DESCRIPTIONS,
  detailPlafonne,
  impactPlafonne,
  ligneCompacte,
  LISTE_DEFAUT,
  LISTE_MAX,
  LONGUEUR_DESCRIPTION_PAGE,
  presenterIngestion,
  sansVides,
} from './presentation.ts';

const ORIGINE = 'mcp';

const INSTRUCTIONS = {
  fr: `postuler-juste aide l'utilisateur dans sa recherche d'emploi ou de missions. Son espace de travail (un dossier)
contient ses consignes, son contexte, ses CV et ses dossiers de candidature ; la base SQLite garde l'état des offres :
offres, notes, statuts, tags, candidatures. L'application n'appelle aucun modèle : c'est toi qui lis et notes.
Début de session : si l'espace n'existe pas (etat_espace), proposer de le créer (initialiser_espace, dossier confirmé par
l'utilisateur). Les consignes de l'espace font foi : AGENTS.md (ressource « consignes » ou lire_fichier AGENTS.md), à lire
avant tout ; prompts demarrage, traiter-emails, preparer-go, cv-cible. Sans accès direct aux fichiers ni terminal (Claude Desktop…) :
lister_fichiers / lire_fichier / ecrire_fichier (chemins relatifs à l'espace) au lieu de lire le disque, generer_cv (capture: true
pour voir les pages ; traiter ses avertissements de remplissage) au lieu de « postuler-juste cv », compter au lieu de « postuler-juste compter ».
Dans ce cas, ne propose jamais à l'utilisateur une commande de terminal à taper : cite l'outil. Pour parcourir ses offres ou régler sa
grille à la souris, propose-lui le tableau de bord : ouvrir_tableau_de_bord (renvoie l'adresse à cliquer), jamais « postuler-juste serve ».
Honnêteté d'abord : n'écrire dans un CV ou un message que ce que _CONTEXTE.md permet de revendiquer. C'est l'utilisateur qui envoie
ses candidatures.
Flux habituel : ingerer_emails (transmettre son a_dire : e-mails supprimés, erreurs) → offres_a_lire (résumé paginé) → grille
(lire la grille de notation : critères, barèmes, règles, inventaire, exemples) → (lire chaque offre avec lire_offre, noter ses critères) → noter_lot avec criteres / entrees / bloquants
(l'application calcule la note finale, ne la donne pas) → résumer à l'utilisateur → sur son « go » : candidater, préparer le dossier, enregistrer_candidature
→ generer_suivi. Sans « go » : changer_statut vers « ecartee » avec la raison.
Quand l'utilisateur raconte un appel, un entretien, un message, un devis : ajouter_evenement (avec le fichier
du dossier s'il y en a un, voir fichiers_dossier), puis la prochaine échéance (ajouter_evenement daté dans
le futur, fait: false). echeances liste ce qui est en retard ou à venir ; marquer_fait clôt une échéance.
Ne télécharge pas LinkedIn, Indeed ni Glassdoor par script : lis ces pages dans le navigateur de l'utilisateur
ou demande-lui le texte. Les consignes de candidature sont dans le dossier de données de l'utilisateur (renvoyé par
candidater) : les lire avant de rédiger. Ne modifie la grille (modifier_grille) qu'à la demande de l'utilisateur,
après un essai (essai: true) dont tu lui montres l'impact (offres et exemples_calcules). Ce que l'utilisateur a fait retirer
(tâche, idée) ne se recrée pas : noter le refus dans _JOURNAL-DECISIONS.md.`,
  en: `postuler-juste helps the user with their search for a job or freelance work. Speak and write in English. Their workspace
(a folder) holds their instructions, their context, their CVs and their application files; the SQLite database keeps the state
of the job ads: ads, scores, statuses, tags, applications. The application calls no model: you do the reading and scoring.
Tool, parameter and status names are French identifiers (ecartee = discarded, envoyee = sent…): use them as they are.
Start of a session: if the workspace does not exist (etat_espace), offer to create it (initialiser_espace, folder confirmed by
the user). The workspace's instructions prevail: AGENTS.md ("consignes" resource or lire_fichier AGENTS.md), to be read
before anything else; prompts demarrage, traiter-emails, preparer-go, cv-cible. Without direct file access or a terminal (Claude Desktop…):
lister_fichiers / lire_fichier / ecrire_fichier (paths relative to the workspace) instead of reading the disk, generer_cv (capture: true
to see the pages; deal with its page-fill warnings) instead of "postuler-juste cv", compter instead of "postuler-juste compter".
In that case, never ask the user to type a terminal command: name the tool. To browse their job ads or tune their grid with the
mouse, offer them the dashboard: ouvrir_tableau_de_bord (returns the address to click), never "postuler-juste serve".
Honesty first: only write in a CV or a message what _CONTEXTE.md allows them to claim. The user sends their applications
themselves.
Usual flow: ingerer_emails (pass on its a_dire: deleted e-mails, errors) → offres_a_lire (paged summary) → grille
(read the scoring grid: criteria, scales, rules, inventory, examples) → (read each job ad with lire_offre, score its criteria) → noter_lot with criteres / entrees / bloquants
(the application calculates the final score; do not give it) → summarise for the user → on their "go": candidater, prepare the application file, enregistrer_candidature
→ generer_suivi. No "go": changer_statut to "ecartee" with the reason.
When the user reports a call, an interview, a message, a quote: ajouter_evenement (with the application folder's
file if there is one, see fichiers_dossier), then the next deadline (ajouter_evenement dated in
the future, fait: false). echeances lists what is overdue or coming up; marquer_fait closes a deadline.
Do not download LinkedIn, Indeed or Glassdoor pages with a script: read them in the user's browser
or ask them for the text. The application instructions are in the user's data folder (returned by
candidater): read them before writing. Only change the grid (modifier_grille) when the user asks,
after a trial run (essai: true) whose impact you show them (job ads and exemples_calcules). Whatever the user had removed
(a task, an idea) is not recreated: record the refusal in _JOURNAL-DECISIONS.md.`,
};

/** Schémas des paramètres, construits dans la langue courante (descriptions comprises). */
function construireSchemas() {
  const id = z.number().int().positive().describe(bi({ fr: "Identifiant de l'offre dans postuler-juste (champ id)", en: 'Job ad id in postuler-juste (id field)' }));
  const nombreNote = (d: string) => z.union([z.number().min(0).max(10), z.string()]).nullable().optional().describe(d);

  /** Une note au format des lots (fichiers candidatures/_lots/*.json). */
  const champsNote = {
    criteres: z
      .record(
        z.string(),
        z.object({
          note: z.union([z.number().min(0).max(10), z.string()]).describe(bi({ fr: 'Sous-note de 0 à 10', en: 'Sub-score from 0 to 10' })),
          justification: z
            .string()
            .optional()
            .describe(bi({ fr: 'Justification courte (écarts pour le critère technique)', en: 'Short justification (gaps, for the technical criterion)' })),
        }),
      )
      .optional()
      .describe(
        bi({
          fr:
            "Sous-notes des critères notés par l'IA (voir l'outil grille) : { \"technique\": { \"note\": 8, \"justification\": \"…\" }, \"role\": {…}, … }. " +
            'Avec criteres, l\'application calcule la note finale (le champ note est ignoré).',
          en:
            'Sub-scores of the criteria scored by the AI (see the grille tool): { "technique": { "note": 8, "justification": "…" }, "role": {…}, … }. ' +
            'With criteres, the application calculates the final score (the note field is ignored).',
        }),
      ),
    entrees: z
      .object({
        jours_sur_site: z
          .number()
          .int()
          .min(0)
          .max(5)
          .nullable()
          .optional()
          .describe(bi({ fr: 'Jours sur site par semaine (0 = full remote, 5 = sur site)', en: 'Days on site per week (0 = fully remote, 5 = fully on site)' })),
        salaire_min: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe(bi({ fr: 'Rémunération basse en euros (55000, 450)', en: 'Lower pay figure, plain amount (55000, 450)' })),
        salaire_max: z.number().positive().nullable().optional().describe(bi({ fr: 'Rémunération haute en euros', en: 'Upper pay figure, plain amount' })),
        unite: z
          .enum(UNITES)
          .nullable()
          .optional()
          .describe(bi({ fr: 'an (salaire annuel brut), mois, jour (TJM), heure', en: 'an (gross annual salary), mois (month), jour (day rate), heure (hour)' })),
      })
      .optional()
      .describe(
        bi({
          fr: "Données d'entrée des critères calculés, quand l'offre les donne (sinon déduites des champs de l'offre)",
          en: "Inputs of the calculated criteria, when the job ad gives them (otherwise inferred from the job ad's fields)",
        }),
      ),
    bloquants: z
      .array(z.string())
      .optional()
      .describe(bi({ fr: 'Identifiants des règles bloquantes qui s’appliquent (voir grille), ex. ["stage"]', en: 'Ids of the blocking rules that apply (see grille), e.g. ["stage"]' })),
    note: nombreNote(bi({ fr: 'Note globale sur 10 (ancienne grille, sans criteres) ; ignorée si criteres est fourni', en: 'Overall score out of 10 (old grid, without criteres); ignored if criteres is given' })),
    note_brute: nombreNote(bi({ fr: 'Note globale avant pénalités (ancienne grille)', en: 'Overall score before penalties (old grid)' })),
    penalites: z
      .string()
      .optional()
      .describe(bi({ fr: 'Ancienne grille : pénalités en clair. Avec criteres, utiliser bloquants', en: 'Old grid: penalties in plain words. With criteres, use bloquants' })),
    colle: z.string().optional().describe(bi({ fr: "Ce qui colle avec le profil de l'utilisateur", en: "What matches the user's profile" })),
    ecarts: z.string().optional().describe(bi({ fr: 'Écarts à assumer ou raisons de ne pas y aller', en: 'Gaps to own up to, or reasons not to apply' })),
    lu: z.boolean().optional().describe(bi({ fr: "true si l'offre complète a été lue (pas seulement l'intitulé)", en: 'true if the full job ad was read (not just the title)' })),
    tags: z.array(z.string()).optional().describe(bi({ fr: "Tags à ajouter à l'offre (ex. wordpress, a-reprendre)", en: 'Tags to add to the job ad (e.g. wordpress, a-reprendre)' })),
  };
  const champsDescriptifs = {
    source: z
      .string()
      .optional()
      .describe(bi({ fr: 'Site de l’offre si elle est créée par son URL : linkedin, indeed, hellowork…', en: 'Site of the job ad if it is created from its URL: linkedin, indeed, hellowork…' })),
    titre: z.string().optional().describe(bi({ fr: "Intitulé du poste (ne complète que s'il manque en base)", en: 'Job title (only fills it in if missing from the database)' })),
    entreprise: z.string().optional().describe(bi({ fr: 'Entreprise (ne complète que si elle manque)', en: 'Company (only fills it in if missing)' })),
    lieu: z.string().optional(),
    contrat: z.string().optional().describe(bi({ fr: 'CDI, CDD, Freelance…', en: 'Permanent, fixed-term, freelance…' })),
    remuneration: z.string().optional().describe(bi({ fr: 'Texte libre : « 50-60 K€ », « 450 €/j »', en: 'Free text: "£50-60K", "£450/day"' })),
    teletravail: z.string().optional().describe(bi({ fr: 'full remote, hybride, 2 j/sem…', en: 'fully remote, hybrid, 2 days a week…' })),
    publiee: z.string().optional().describe(bi({ fr: 'Date de publication JJ/MM/AAAA, ou NC', en: 'Publication date DD/MM/YYYY, or NC (not stated)' })),
    stack: z.string().optional().describe(bi({ fr: 'Technologies demandées', en: 'Technologies required' })),
    description: z.string().optional().describe(bi({ fr: "Texte de l'offre, s'il n'est pas déjà en base", en: 'Text of the job ad, if not already in the database' })),
  };
  const entreeLot = z.object({
    id: id.optional().describe(bi({ fr: 'Identifiant postuler-juste (sinon url)', en: 'postuler-juste id (otherwise url)' })),
    url: z
      .string()
      .optional()
      .describe(bi({ fr: "URL de l'offre (si pas d'id) : l'offre est retrouvée, ou créée", en: 'URL of the job ad (if no id): the job ad is found, or created' })),
    ...champsDescriptifs,
    ...champsNote,
  });
  const texteFacultatif = (d: string) => z.string().nullable().optional().describe(d);
  return { id, entreeLot, texteFacultatif };
}

type Schemas = ReturnType<typeof construireSchemas>;

function normaliserEntree(e: z.infer<Schemas['entreeLot']>): EntreeLot {
  if (e.id === undefined && !e.url) throw new Error(bi({ fr: 'Chaque note doit avoir un "id" ou une "url"', en: 'Each score must have an "id" or a "url"' }));
  return e as EntreeLot;
}

export function creerServeurMcp(etat: EtatMcp): McpServer {
  definirLangue(etat.config.langue);
  const { id, entreeLot, texteFacultatif } = construireSchemas();
  const VERSION_APP = (JSON.parse(readFileSync(join(RACINE_APP, 'package.json'), 'utf8')) as { version: string }).version;
  const serveur = new McpServer({ name: 'postuler-juste', version: VERSION_APP }, { instructions: bi(INSTRUCTIONS) });
  const lecture = { readOnlyHint: true, openWorldHint: false };
  /** Base de l'espace ; erreur claire tant que l'espace n'est pas initialisé. */
  const base = (): Base => {
    if (!etat.db) throw new Error(messageNonInitialise(etat));
    return etat.db;
  };
  const donnees = (): string => {
    base();
    return etat.config.dossierDonnees;
  };
  enregistrerOutilsEspace(serveur, etat, donnees);
  enregistrerOutilTableauDeBord(serveur, etat);
  const chargerGrille = () => grilleCourante(base(), donnees());

  serveur.registerTool(
    'lister_offres',
    {
      title: bi({ fr: 'Lister les offres', en: 'List job ads' }),
      description: bi({
        fr:
          'Liste paginée des offres en base (sans la description : lire_offre pour le détail ; champs vides omis). ' +
          'Sert aussi à vérifier si une offre ou une entreprise a déjà été vue (texte). Renvoie total, page, pages, restantes et offres.',
        en:
          'Paged list of the job ads in the database (without the description: lire_offre for the details; empty fields left out). ' +
          'Also used to check whether a job ad or a company has been seen before (texte). Returns total, page, pages, restantes (remaining) and offres.',
      }),
      inputSchema: {
        statuts: z
          .array(z.enum(STATUTS))
          .optional()
          .describe(bi({ fr: `Statuts retenus, parmi : ${STATUTS.join(', ')}`, en: `Statuses to keep, among: ${STATUTS.join(', ')}` })),
        sources: z
          .array(z.string())
          .optional()
          .describe(
            bi({
              fr: 'Sources : linkedin, indeed, glassdoor, hellowork, free-work, collective, registre, suivi, manuel',
              en: 'Sources: linkedin, indeed, glassdoor, hellowork, free-work, collective, registre, suivi, manuel',
            }),
          ),
        tags: z.array(z.string()).optional().describe(bi({ fr: 'Tags (toutes requises)', en: 'Tags (all required)' })),
        note_min: z.number().optional().describe(bi({ fr: 'Note minimale (incluse)', en: 'Minimum score (inclusive)' })),
        note_max: z.number().optional().describe(bi({ fr: 'Note maximale (incluse)', en: 'Maximum score (inclusive)' })),
        sans_note: z
          .boolean()
          .optional()
          .describe(bi({ fr: 'true : seulement les offres sans note ; false : seulement les notées', en: 'true: only unscored job ads; false: only scored ones' })),
        texte: z
          .string()
          .optional()
          .describe(bi({ fr: 'Recherche plein texte (titre, entreprise, description, stack ; accents ignorés)', en: 'Full-text search (title, company, description, stack; accents ignored)' })),
        contrat: z.string().optional().describe(bi({ fr: 'Contrat contenant ce texte (CDI, Freelance…)', en: 'Contract containing this text (CDI, Freelance, Permanent…)' })),
        teletravail: z.string().optional().describe(bi({ fr: 'Télétravail contenant ce texte (remote, hybride…)', en: 'Remote work containing this text (remote, hybrid…)' })),
        recue_depuis: z.string().optional().describe(bi({ fr: 'Reçue à partir du AAAA-MM-JJ', en: 'Received from YYYY-MM-DD' })),
        recue_jusqua: z.string().optional().describe(bi({ fr: "Reçue jusqu'au AAAA-MM-JJ inclus", en: 'Received up to YYYY-MM-DD inclusive' })),
        publiee_depuis: z.string().optional().describe(bi({ fr: 'Publiée à partir du AAAA-MM-JJ', en: 'Published from YYYY-MM-DD' })),
        mes_candidatures: z
          .boolean()
          .optional()
          .describe(bi({ fr: 'true : seulement les candidatures envoyées et suivantes', en: 'true: only applications sent and beyond' })),
        page: z.number().int().min(1).optional().describe(bi({ fr: 'Page (1 par défaut)', en: 'Page (1 by default)' })),
        taille: z
          .number()
          .int()
          .min(1)
          .max(LISTE_MAX)
          .optional()
          .describe(bi({ fr: `Offres par page (${LISTE_DEFAUT} par défaut, ${LISTE_MAX} au plus)`, en: `Job ads per page (${LISTE_DEFAUT} by default, ${LISTE_MAX} at most)` })),
        tri: z
          .string()
          .optional()
          .describe(
            bi({
              fr: `Tri sur un ou plusieurs niveaux, séparés par des virgules, chacun avec son sens facultatif : « note », « recue_le:desc,note:desc ». Colonnes : ${COLONNES_TRI.join(', ')} (recue_le par défaut)`,
              en: `Sort on one or more levels, separated by commas, each with an optional direction: "note", "recue_le:desc,note:desc". Columns: ${COLONNES_TRI.join(', ')} (recue_le by default)`,
            }),
          ),
        ordre: z
          .enum(['asc', 'desc'])
          .optional()
          .describe(bi({ fr: 'Sens des niveaux de tri qui n’en précisent pas (desc par défaut)', en: 'Direction of the sort levels that do not state one (desc by default)' })),
      },
      annotations: lecture,
    },
    sur((a) => {
      const r = listerOffres(base(), {
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
        taille: a.taille ?? LISTE_DEFAUT,
        tri: a.tri,
        ordre: a.ordre,
      });
      const restantes = Math.max(0, r.total - (r.page - 1) * r.taille - r.offres.length);
      return { total: r.total, page: r.page, pages: r.pages, restantes, offres: r.offres.map(ligneCompacte) };
    }),
  );

  serveur.registerTool(
    'lire_offre',
    {
      title: bi({ fr: 'Lire une offre', en: 'Read a job ad' }),
      description: bi({
        fr:
          "Détail d'une offre : champs, description (coupée au-delà de 15 000 caractères, sauf complet: true), les 3 notes les plus récentes " +
          '(la première fait foi), historique des statuts, tags, candidature, journal. À appeler offre par offre pour lire et noter.',
        en:
          'Details of a job ad: fields, description (cut beyond 15,000 characters, unless complet: true), the 3 most recent scores ' +
          '(the first one prevails), status history, tags, application, log. Call it one job ad at a time to read and score.',
      }),
      inputSchema: { id, complet: z.boolean().optional().describe(bi({ fr: 'true : description entière, même très longue', en: 'true: whole description, even a very long one' })) },
      annotations: lecture,
    },
    sur(({ id, complet }) => {
      offreOuErreur(base(), id);
      return detailPlafonne(detailOffre(base(), id)!, { complet });
    }),
  );

  serveur.registerTool(
    'offres_a_lire',
    {
      title: bi({ fr: 'Offres à lire', en: 'Job ads to read' }),
      description: bi({
        fr:
          'Offres à traiter (statut nouvelle ou a-lire) sans note, des plus anciennes aux plus récentes, en résumé paginé : id, titre, ' +
          `entreprise, lieu, source, url, lecture, longueur_description (0 = pas de description en base). ${A_LIRE_DEFAUT} par page ; ` +
          'restantes = offres après cette page (page suivante : page + 1). Ensuite, lire chaque offre avec lire_offre(id). Champ « lecture » : ' +
          '« description » = texte en base (lire_offre) ; « navigateur » = ouvrir « url » dans le navigateur de l’utilisateur s’il y en a un, ' +
          'sinon lui demander le texte ; « humain » = page protégée (Glassdoor), demander le texte à l’utilisateur. descriptions: true joint ' +
          `les descriptions tronquées (${LONGUEUR_DESCRIPTION_PAGE} caractères, ${A_LIRE_MAX_DESCRIPTIONS} offres par page au plus).`,
        en:
          'Job ads to process (status nouvelle or a-lire) without a score, oldest first, as a paged summary: id, titre, ' +
          `entreprise, lieu, source, url, lecture, longueur_description (0 = no description in the database). ${A_LIRE_DEFAUT} per page; ` +
          'restantes = job ads after this page (next page: page + 1). Then read each job ad with lire_offre(id). "lecture" field: ' +
          '"description" = text in the database (lire_offre); "navigateur" = open "url" in the user\'s browser if there is one, ' +
          'otherwise ask them for the text; "humain" = protected page (Glassdoor), ask the user for the text. descriptions: true attaches ' +
          `the truncated descriptions (${LONGUEUR_DESCRIPTION_PAGE} characters, ${A_LIRE_MAX_DESCRIPTIONS} job ads per page at most).`,
      }),
      inputSchema: {
        limite: z
          .number()
          .int()
          .min(1)
          .max(A_LIRE_MAX)
          .optional()
          .describe(bi({ fr: `Offres par page (${A_LIRE_DEFAUT} par défaut)`, en: `Job ads per page (${A_LIRE_DEFAUT} by default)` })),
        page: z.number().int().min(1).optional().describe(bi({ fr: 'Page (1 par défaut)', en: 'Page (1 by default)' })),
        descriptions: z
          .boolean()
          .optional()
          .describe(
            bi({
              fr: `true : joindre les descriptions tronquées (page limitée à ${A_LIRE_MAX_DESCRIPTIONS} offres)`,
              en: `true: attach the truncated descriptions (page limited to ${A_LIRE_MAX_DESCRIPTIONS} job ads)`,
            }),
          ),
      },
      annotations: lecture,
    },
    sur((a) => {
      const limite = Math.min(a.limite ?? A_LIRE_DEFAUT, a.descriptions ? A_LIRE_MAX_DESCRIPTIONS : A_LIRE_MAX);
      const r = offresALire(base(), { limite, page: a.page, descriptions: Boolean(a.descriptions), longueur: LONGUEUR_DESCRIPTION_PAGE });
      return {
        ...r,
        offres: r.offres.map((o) => sansVides(o)),
        suite: r.restantes
          ? bi({
              fr: `offres_a_lire avec page: ${r.page + 1} pour les ${r.restantes} suivantes`,
              en: `offres_a_lire with page: ${r.page + 1} for the next ${r.restantes}`,
            })
          : null,
      };
    }),
  );

  serveur.registerTool(
    'noter_offre',
    {
      title: bi({ fr: 'Noter une offre', en: 'Score a job ad' }),
      description: bi({
        fr:
          "Enregistre une note pour une offre, désignée par id (ou par url : l'offre est créée si elle n'existe pas). Lire d'abord " +
          "l'outil grille. Fournir criteres (sous-notes des critères IA), entrees (jours sur site, salaire) et bloquants : l'application " +
          "calcule la note finale et renvoie sa décomposition. La note s'ajoute à l'historique (la dernière fait foi) ; une offre encore " +
          'à traiter passe en « notee ». Les champs descriptifs ne complètent que ce qui manque en base.',
        en:
          'Records a score for a job ad, given by id (or by url: the job ad is created if it does not exist). Read the grille tool ' +
          'first. Provide criteres (sub-scores of the AI criteria), entrees (days on site, salary) and bloquants: the application ' +
          'calculates the final score and returns its breakdown. The score is added to the history (the latest prevails); a job ad still ' +
          'to be processed moves to "notee" (scored). The descriptive fields only fill in what is missing from the database.',
      }),
      inputSchema: entreeLot.shape,
    },
    sur((e) => {
      const [r] = noterOffres(base(), [normaliserEntree(e)], ORIGINE, { grille: chargerGrille });
      return { ok: true, ...r };
    }),
  );

  serveur.registerTool(
    'noter_lot',
    {
      title: bi({ fr: 'Noter un lot', en: 'Score a batch' }),
      description: bi({
        fr:
          'Enregistre plusieurs notes d’un coup (format des fichiers de lot : chaque entrée a un id ou une url, et les champs de noter_offre, ' +
          'dont criteres / entrees / bloquants). Tout ou rien : une entrée invalide annule le lot. essai: true calcule sans enregistrer.',
        en:
          'Records several scores at once (batch file format: each entry has an id or a url, and the fields of noter_offre, ' +
          'including criteres / entrees / bloquants). All or nothing: one invalid entry cancels the batch. essai: true calculates without saving.',
      }),
      inputSchema: {
        offres: z.array(entreeLot).min(1).describe(bi({ fr: 'Entrées du lot', en: 'Batch entries' })),
        essai: z
          .boolean()
          .optional()
          .describe(bi({ fr: 'true : calcule les notes et les renvoie sans rien enregistrer', en: 'true: calculates the scores and returns them without saving anything' })),
      },
    },
    sur(({ offres, essai }) => {
      const r = noterOffres(base(), offres.map(normaliserEntree), ORIGINE, { grille: chargerGrille, essai });
      return { ok: true, essai: Boolean(essai), notees: essai ? 0 : r.length, offres: r };
    }),
  );

  serveur.registerTool(
    'grille',
    {
      title: bi({ fr: 'Grille de notation', en: 'Scoring grid' }),
      description: bi({
        fr:
          "Grille de notation courante de l'utilisateur, à lire avant de noter : critères et poids (normalisés), qui note quoi (IA ou calcul), " +
          'barèmes (télétravail, rémunération), règles bloquantes, inventaire de compétences (fort / moyen / léger / zéro), exemples de ' +
          'référence avec leur note calculée, seuil « à regarder » et consignes de notation (consignes_ia).',
        en:
          "The user's current scoring grid, to read before scoring: criteria and weights (normalised), who scores what (AI or calculation), " +
          'scales (remote work, pay), blocking rules, skills inventory (fort / moyen / leger / zero = strong / medium / light / none), reference ' +
          'examples with their calculated score, "worth a look" threshold and scoring instructions (consignes_ia).',
      }),
      inputSchema: { version: z.number().int().positive().optional().describe(bi({ fr: 'Version précise (par défaut : la courante)', en: 'Specific version (default: the current one)' })) },
      annotations: lecture,
    },
    sur(({ version }) => {
      const v = version ? versionGrille(base(), version) : grilleObligatoire(base(), donnees());
      const somme = v.grille.criteres.reduce((s, c) => s + c.poids, 0);
      return {
        fichier: cheminGrille(donnees()),
        version: v.version,
        le: v.le,
        auteur: v.auteur,
        resume: v.resume,
        consignes_ia: [...v.grille.consignes, ...consignesIa(v.grille)],
        poids_normalises: Object.fromEntries(v.grille.criteres.map((c) => [c.id, Math.round((c.poids / somme) * 1000) / 1000])),
        grille: v.grille,
        exemples_calcules: exemplesCalcules(v.grille, v.version),
        format_note: {
          id: 42,
          criteres: { technique: { note: 8, justification: '…' }, role: { note: 7, justification: '…' } },
          entrees: { jours_sur_site: 2, salaire_min: 55000, salaire_max: 65000, unite: 'an' },
          bloquants: [],
          colle: '…',
          ecarts: '…',
          lu: true,
        },
      };
    }),
  );

  serveur.registerTool(
    'modifier_grille',
    {
      title: bi({ fr: 'Modifier la grille', en: 'Change the grid' }),
      description: bi({
        fr:
          "Changement partiel de la grille, à la demande de l'utilisateur seulement : poids ({ technique: 40 }), seuil, barèmes " +
          '(teletravail.jours_sur_site, remuneration.salaire / tjm : plancher, cible_basse, cible_haute, plancher_full_remote), règles ' +
          '(ajout ou modification par id : libelle, effet zero | plafond | plafond_critere, valeur, critere, seuil, actif ; retirer_regles), critères (libellé, description), ' +
          'inventaire (ajouter [{ techno, niveau }], retirer [techno]), exemples de référence (ajouter [exemple complet, au format de ' +
          'grille.exemples : remplace celui de même titre et entreprise], retirer [titre]) : inutile de réécrire profil/grille.json. ' +
          "essai: true renvoie l'aperçu sans enregistrer : impact sur les offres notées et exemples_calcules (note de chaque exemple " +
          "de référence avant / après), utile même sur une base vide ; le montrer d'abord. Sinon crée une nouvelle version (avec le " +
          "résumé), recalcule toutes les notes à critères et renvoie l'impact (notes qui changent, offres qui franchissent le seuil). " +
          'restaurer_version revient à une version précédente.',
        en:
          "Partial change to the grid, only when the user asks: weights ({ technique: 40 }), threshold (seuil), scales " +
          '(teletravail.jours_sur_site, remuneration.salaire / tjm (day rate): plancher (floor), cible_basse, cible_haute, plancher_full_remote), rules ' +
          '(add or change by id: libelle, effet zero | plafond | plafond_critere, valeur, critere, seuil, actif; retirer_regles), criteria (libelle, description), ' +
          'inventory (ajouter [{ techno, niveau }], retirer [techno]), reference examples (ajouter [full example, in the format of ' +
          'grille.exemples: replaces the one with the same title and company], retirer [titre]): no need to rewrite profil/grille.json. ' +
          'essai: true returns a preview without saving: impact on the scored job ads and exemples_calcules (score of each reference ' +
          'example before / after), useful even with an empty database; show it first. Otherwise creates a new version (with the ' +
          'summary), recalculates every criteria-based score and returns the impact (scores that change, job ads that cross the threshold). ' +
          'restaurer_version goes back to an earlier version.',
      }),
      inputSchema: {
        changement: schemaChangement.optional().describe(bi({ fr: 'Changement partiel (champs absents inchangés)', en: 'Partial change (fields left out are unchanged)' })),
        resume: z
          .string()
          .optional()
          .describe(bi({ fr: 'Résumé du changement, gardé dans l’historique (obligatoire sauf en essai)', en: 'Summary of the change, kept in the history (required except for a trial run)' })),
        essai: z.boolean().optional().describe(bi({ fr: 'true : aperçu de l’impact sans enregistrer', en: 'true: preview of the impact without saving' })),
        restaurer_version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(bi({ fr: 'Revenir à cette version (à la place de changement)', en: 'Go back to this version (instead of changement)' })),
      },
    },
    sur(({ changement, resume, essai, restaurer_version }) => {
      if (restaurer_version !== undefined) {
        const r = restaurerGrille(base(), donnees(), restaurer_version, { auteur: ORIGINE, resume });
        return { ok: true, enregistree: true, version: r.version.version, impact: impactPlafonne(r.impact) };
      }
      if (!changement) throw new Error(bi({ fr: 'changement ou restaurer_version attendu', en: 'changement or restaurer_version expected' }));
      if (!essai && !resume?.trim()) throw new Error(bi({ fr: 'resume attendu (ou essai: true pour un aperçu)', en: 'resume expected (or essai: true for a preview)' }));
      const r = modifierGrille(base(), donnees(), changement, { auteur: ORIGINE, resume: resume ?? '', essai });
      return {
        ok: true,
        enregistree: r.enregistree,
        version: r.version,
        impact: impactPlafonne(r.impact),
        exemples_calcules: r.exemples_calcules,
        ...(r.impact.offres_recalculees === 0
          ? {
              remarque: bi({
                fr: 'Aucune offre notée à critères en base : l’effet se lit sur exemples_calcules (avant → note).',
                en: 'No criteria-based scored job ad in the database: read the effect on exemples_calcules (avant → note).',
              }),
            }
          : {}),
      };
    }),
  );

  serveur.registerTool(
    'renoter',
    {
      title: bi({ fr: 'Recalculer les notes', en: 'Recalculate the scores' }),
      description: bi({
        fr:
          "Recalcule avec la grille courante toutes les notes à critères (sans relire d'offre). Les notes globales de l'ancienne grille restent " +
          'figées. Utile après une correction des champs télétravail / rémunération des offres ; un changement de grille recalcule déjà tout.',
        en:
          'Recalculates every criteria-based score with the current grid (without rereading any job ad). Overall scores from the old grid stay ' +
          "frozen. Useful after correcting the job ads' remote work / pay fields; a change of grid already recalculates everything.",
      }),
      inputSchema: {},
    },
    sur(() => ({ ok: true, ...renoter(base(), donnees()) })),
  );

  serveur.registerTool(
    'historique_grille',
    {
      title: bi({ fr: 'Historique de la grille', en: 'Grid history' }),
      description: bi({
        fr: 'Versions de la grille, de la plus récente à la plus ancienne : version, date, auteur (interface, cli, mcp, fichier), résumé.',
        en: 'Versions of the grid, most recent first: version, date, author (interface, cli, mcp, fichier = file), summary.',
      }),
      inputSchema: {},
      annotations: lecture,
    },
    sur(() => {
      grilleCourante(base(), donnees());
      return { versions: historiqueGrille(base()) };
    }),
  );

  serveur.registerTool(
    'changer_statut',
    {
      title: bi({ fr: 'Changer le statut', en: 'Change the status' }),
      description: bi({
        fr:
          "Ajoute un statut à l'historique de l'offre (le dernier fait foi). « ecartee » quand l'utilisateur ne donne pas de go (mettre la raison " +
          'en commentaire), « envoyee », « relancee », « entretien », « refus », « close », « abandonnee » pour la suite d’une candidature.',
        en:
          "Adds a status to the job ad's history (the latest prevails). \"ecartee\" (discarded) when the user gives no go (put the reason " +
          'in the comment); "envoyee" (sent), "relancee" (followed up), "entretien" (interview), "refus" (rejected), "close" (closed), ' +
          '"abandonnee" (abandoned) for what happens next with an application.',
      }),
      inputSchema: {
        id,
        statut: z.enum(STATUTS).describe(bi({ fr: `Nouveau statut, parmi : ${STATUTS.join(', ')}`, en: `New status, among: ${STATUTS.join(', ')}` })),
        commentaire: z.string().optional().describe(bi({ fr: 'Raison, canal, date… (gardé dans l’historique)', en: 'Reason, channel, date… (kept in the history)' })),
      },
    },
    sur(({ id, statut, commentaire }) => {
      offreOuErreur(base(), id);
      ajouterStatut(base(), id, statut, { commentaire: commentaire ?? null, origine: ORIGINE });
      return { ok: true, id, statut: detailOffre(base(), id)!.statut };
    }),
  );

  serveur.registerTool(
    'modifier_tags',
    {
      title: bi({ fr: 'Modifier les tags', en: 'Change the tags' }),
      description: bi({
        fr: 'Ajoute et retire des tags sur une offre (minuscules, espaces remplacés par des tirets). Renvoie les tags à jour.',
        en: 'Adds and removes tags on a job ad (lower case, spaces replaced by hyphens). Returns the updated tags.',
      }),
      inputSchema: {
        id,
        ajouter: z.array(z.string()).optional().describe(bi({ fr: 'Tags à ajouter', en: 'Tags to add' })),
        retirer: z.array(z.string()).optional().describe(bi({ fr: 'Tags à retirer', en: 'Tags to remove' })),
      },
    },
    sur(({ id, ajouter, retirer }) => {
      offreOuErreur(base(), id);
      return { ok: true, id, tags: transaction(base(), () => modifierTags(base(), id, ajouter ?? [], retirer ?? [])) };
    }),
  );

  serveur.registerTool(
    'modifier_lien',
    {
      title: bi({ fr: 'Modifier le lien', en: 'Change the link' }),
      description: bi({
        fr: "Enregistre le lien (URL http ou https) de l'offre, ou l'efface avec null.",
        en: "Records the job ad's link (http or https URL), or clears it with null.",
      }),
      inputSchema: { id, url: z.string().nullable().describe(bi({ fr: 'Nouvelle URL, ou null pour effacer', en: 'New URL, or null to clear it' })) },
    },
    sur(({ id, url }) => {
      offreOuErreur(base(), id);
      modifierLien(base(), id, url);
      return { ok: true, id, url: detailOffre(base(), id)!.url_canonique };
    }),
  );

  serveur.registerTool(
    'candidater',
    {
      title: bi({ fr: 'Candidater', en: 'Apply' }),
      description: bi({
        fr:
          "À appeler sur le « go » de l'utilisateur : passe l'offre en « go » (si elle n'est pas déjà plus avancée) et renvoie tout pour préparer " +
          "la candidature : l'offre complète, le dossier de données, un dossier de candidature suggéré (candidatures/<entreprise-poste>) et les étapes. " +
          'Ensuite : créer le dossier selon les consignes de l’utilisateur, puis enregistrer_candidature.',
        en:
          'Call it on the user\'s "go": moves the job ad to "go" (unless it is already further along) and returns everything needed to prepare ' +
          'the application: the full job ad, the data folder, a suggested application folder (candidatures/<company-role>) and the steps. ' +
          "Then: create the folder following the user's instructions, then enregistrer_candidature.",
      }),
      inputSchema: { id },
    },
    sur(({ id }) => preparerCandidature(base(), donnees(), id, ORIGINE)),
  );

  serveur.registerTool(
    'enregistrer_candidature',
    {
      title: bi({ fr: 'Enregistrer la candidature', en: 'Record the application' }),
      description: bi({
        fr:
          "Crée ou met à jour la candidature d'une offre. Un champ absent est conservé ; null ou chaîne vide l'efface. Avec envoyee_le, " +
          'une offre pas encore envoyée passe en « envoyee ». La prochaine action apparaît dans le suivi (generer_suivi).',
        en:
          "Creates or updates a job ad's application. A field left out is kept; null or an empty string clears it. With envoyee_le, " +
          'a job ad not yet sent moves to "envoyee" (sent). The next action appears in the tracker (generer_suivi).',
      }),
      inputSchema: {
        id,
        dossier: texteFacultatif(
          bi({ fr: 'Dossier de candidature, relatif au dossier de données : candidatures/<entreprise-poste>', en: 'Application folder, relative to the data folder: candidatures/<company-role>' }),
        ),
        cv: texteFacultatif(bi({ fr: 'CV envoyé (chemin relatif au dossier de données, ex. CV/….pdf)', en: 'CV sent (path relative to the data folder, e.g. cv/….pdf)' })),
        canal: texteFacultatif(bi({ fr: 'Canal : LinkedIn, Hellowork, Malt, e-mail, site du recruteur…', en: "Channel: LinkedIn, Indeed, e-mail, the recruiter's website…" })),
        envoyee_le: texteFacultatif(
          bi({ fr: "Date d'envoi JJ/MM/AAAA ou AAAA-MM-JJ (ou texte libre : « ≈ 25/08/2026 »)", en: 'Date sent DD/MM/YYYY or YYYY-MM-DD (or free text: "≈ 25/08/2026")' }),
        ),
        message: texteFacultatif(bi({ fr: 'Message envoyé (version envoyée)', en: 'Message sent (the version actually sent)' })),
        prochaine_action: texteFacultatif(
          bi({
            fr: 'Prochaine action à mener : « Relancer le 04/11 », « Au 1er contact : salaire, télétravail »',
            en: 'Next action to take: "Follow up on 04/11", "At first contact: salary, remote work"',
          }),
        ),
      },
    },
    sur(({ id, ...champs }) => {
      const r = suivreCandidature(base(), id, champs, ORIGINE);
      return { ok: true, id, statut: r.offre.statut, statut_ajoute: r.statut_ajoute, candidature: r.offre.candidature };
    }),
  );

  const champsEvenement = {
    sens: z
      .enum(['envoye', 'recu'])
      .nullable()
      .optional()
      .describe(bi({ fr: "Pour un message : « envoye » (par l'utilisateur) ou « recu »", en: 'For a message: "envoye" (sent by the user) or "recu" (received)' })),
    details: texteFacultatif(
      bi({
        fr: 'Texte libre plus long (contexte, ce qui a été dit) ; pas de copie de document : citer le fichier',
        en: 'Longer free text (context, what was said); no copy of a document: refer to the file',
      }),
    ),
    canal: texteFacultatif(bi({ fr: 'Canal : LinkedIn, Malt, e-mail, téléphone, Zoom, Teams…', en: 'Channel: LinkedIn, e-mail, phone, Zoom, Teams…' })),
    interlocuteurs: texteFacultatif(
      bi({ fr: 'Personnes concernées : « Zoé (RH), M. Gabord (directeur digital) »', en: 'People involved: "Zoe (HR), Mr Gabord (head of digital)"' }),
    ),
    montant: z.number().nullable().optional().describe(bi({ fr: 'Montant (proposition, devis, salaire) : 3000, 450, 55', en: 'Amount (offer, quote, salary): 3000, 450, 55' })),
    unite: texteFacultatif(bi({ fr: 'Unité du montant : « € HT », « €/j », « K€/an »', en: 'Unit of the amount: "£ excl. VAT", "£/day", "K/year"' })),
    jours: z.number().nullable().optional().describe(bi({ fr: "Nombre de jours d'un devis", en: 'Number of days in a quote' })),
    fichiers: z
      .array(z.string())
      .nullable()
      .optional()
      .describe(
        bi({
          fr: 'Fichiers liés, chemins relatifs au dossier de données (« candidatures/x/devis.md ») : voir fichiers_dossier',
          en: 'Linked files, paths relative to the data folder ("candidatures/x/quote.md"): see fichiers_dossier',
        }),
      ),
  };

  serveur.registerTool(
    'ajouter_evenement',
    {
      title: bi({ fr: 'Ajouter un événement au journal', en: 'Add an event to the log' }),
      description: bi({
        fr:
          "Ajoute un événement daté au journal de la candidature d'une offre : message envoyé ou reçu, entretien ou appel, test, " +
          "proposition ou devis (montant, unité, jours), décision (refus, go, abandon), note. Daté dans le futur et pas fait, c'est une " +
          "échéance (relance, entretien prévu…) : elle apparaît dans echeances et devient la prochaine action du suivi. À appeler quand " +
          "l'utilisateur raconte un échange : l'événement, puis la prochaine échéance. Le contenu d'un document reste dans le dossier " +
          'de candidature : ne mettre que son chemin dans fichiers. « fait » vaut par défaut false pour une date future, true sinon.',
        en:
          "Adds a dated event to the log of a job ad's application: message sent or received, interview or call, test, " +
          'offer or quote (amount, unit, days), decision (rejection, go, withdrawal), note. Dated in the future and not done, it is a ' +
          'deadline (follow-up, planned interview…): it appears in echeances and becomes the next action in the tracker. Call it when ' +
          "the user reports an exchange: the event, then the next deadline. A document's content stays in the application " +
          'folder: only put its path in fichiers. "fait" defaults to false for a future date, true otherwise.',
      }),
      inputSchema: {
        id,
        type: z.enum(TYPES_EVENEMENT).describe(bi({ fr: `Type : ${TYPES_EVENEMENT.join(', ')}`, en: `Type: ${TYPES_EVENEMENT.join(', ')}` })),
        le: z
          .string()
          .optional()
          .describe(
            bi({
              fr: 'Date : JJ/MM/AAAA, JJ/MM/AAAA HH:MM, AAAA-MM-JJ, AAAA-MM-JJTHH:MM, « demain », « +3 » (jours). Défaut : maintenant',
              en: 'Date: DD/MM/YYYY, DD/MM/YYYY HH:MM, YYYY-MM-DD, YYYY-MM-DDTHH:MM, "today", "tomorrow", "+3" (days). Default: now',
            }),
          ),
        resume: z
          .string()
          .min(1)
          .describe(
            bi({
              fr: 'Résumé court : « Appel avec Zoé : périmètre validé », « Relancer si sans nouvelles »',
              en: 'Short summary: "Call with Zoe: scope agreed", "Follow up if no news"',
            }),
          ),
        fait: z
          .boolean()
          .optional()
          .describe(bi({ fr: 'false : échéance à faire ; true : déjà fait. Défaut selon la date', en: 'false: deadline to do; true: already done. Default depends on the date' })),
        ...champsEvenement,
      },
    },
    sur(({ id, ...saisie }) => ({ ok: true, evenement: ajouterEvenement(base(), id, saisie, ORIGINE) })),
  );

  serveur.registerTool(
    'modifier_evenement',
    {
      title: bi({ fr: 'Modifier un événement', en: 'Change an event' }),
      description: bi({
        fr:
          "Corrige un événement du journal (par son identifiant, champ id des événements). Champ absent = inchangé ; null = effacé " +
          '(sauf type, date et résumé). Pour clore une échéance, marquer_fait suffit.',
        en:
          'Corrects an event in the log (by its id, the id field of the events). Field left out = unchanged; null = cleared ' +
          '(except type, date and summary). To close a deadline, marquer_fait is enough.',
      }),
      inputSchema: {
        evenement_id: z.number().int().positive().describe(bi({ fr: "Identifiant de l'événement", en: 'Event id' })),
        type: z.enum(TYPES_EVENEMENT).optional(),
        le: z.string().optional().describe(bi({ fr: 'Nouvelle date (mêmes formats que ajouter_evenement)', en: 'New date (same formats as ajouter_evenement)' })),
        resume: z.string().min(1).optional(),
        fait: z.boolean().optional(),
        ...champsEvenement,
      },
    },
    sur(({ evenement_id, ...saisie }) => ({ ok: true, evenement: modifierEvenement(base(), evenement_id, saisie) })),
  );

  serveur.registerTool(
    'journal',
    {
      title: bi({ fr: 'Journal de la candidature', en: 'Application log' }),
      description: bi({
        fr:
          "Journal d'une offre : échéances pas encore faites d'abord (les retards en tête, en_retard: true), puis les événements faits, " +
          'du plus récent au plus ancien. Chaque événement : id, type, sens, le, fait, resume, details, canal, interlocuteurs, montant, ' +
          'unite, jours, fichiers.',
        en:
          "A job ad's log: deadlines not yet done first (overdue ones at the top, en_retard: true), then the events done, " +
          'most recent first. Each event: id, type, sens, le, fait, resume, details, canal, interlocuteurs, montant, ' +
          'unite, jours, fichiers.',
      }),
      inputSchema: { id },
      annotations: lecture,
    },
    sur(({ id }) => {
      offreOuErreur(base(), id);
      return { id, evenements: journal(base(), id) };
    }),
  );

  serveur.registerTool(
    'echeances',
    {
      title: bi({ fr: 'Échéances', en: 'Deadlines' }),
      description: bi({
        fr:
          "Échéances de toutes les candidatures : en_retard (date passée, pas faites) et a_venir (d'aujourd'hui à N jours), avec " +
          "l'offre (offre_id, entreprise, titre, statut). À consulter en début de session pour dire à l'utilisateur ce qui l'attend.",
        en:
          'Deadlines of all the applications: en_retard (overdue: date passed, not done) and a_venir (coming up: from today to N days), with ' +
          'the job ad (offre_id, entreprise, titre, statut). Check it at the start of a session to tell the user what lies ahead.',
      }),
      inputSchema: {
        jours: z.number().int().min(0).max(366).optional().describe(bi({ fr: 'Horizon en jours (7 par défaut)', en: 'Horizon in days (7 by default)' })),
      },
      annotations: lecture,
    },
    sur(({ jours }) => echeances(base(), { jours })),
  );

  serveur.registerTool(
    'marquer_fait',
    {
      title: bi({ fr: 'Marquer une échéance faite', en: 'Mark a deadline as done' }),
      description: bi({
        fr:
          "Marque un événement comme fait (l'échéance disparaît des échéances), ou le rouvre avec fait: false. Ajouter ensuite, s'il y a " +
          'lieu, ce qui s’est passé (ajouter_evenement) et la prochaine échéance.',
        en:
          'Marks an event as done (the deadline disappears from echeances), or reopens it with fait: false. Then add, where ' +
          'relevant, what happened (ajouter_evenement) and the next deadline.',
      }),
      inputSchema: {
        evenement_id: z.number().int().positive().describe(bi({ fr: "Identifiant de l'événement", en: 'Event id' })),
        fait: z.boolean().optional().describe(bi({ fr: 'true par défaut ; false pour rouvrir', en: 'true by default; false to reopen' })),
      },
    },
    sur(({ evenement_id, fait }) => {
      evenementOuErreur(base(), evenement_id);
      return { ok: true, evenement: marquerFait(base(), evenement_id, fait ?? true) };
    }),
  );

  serveur.registerTool(
    'fichiers_dossier',
    {
      title: bi({ fr: 'Fichiers du dossier de candidature', en: 'Files in the application folder' }),
      description: bi({
        fr:
          "Liste les fichiers du dossier de candidature d'une offre (chemin relatif au dossier de données, nom, taille, date) : " +
          "ce sont les chemins à citer dans « fichiers » d'un événement. Liste vide si la candidature n'a pas de dossier (le fixer avec " +
          'enregistrer_candidature, champ dossier).',
        en:
          "Lists the files in a job ad's application folder (path relative to the data folder, name, size, date): " +
          'these are the paths to quote in an event\'s "fichiers". Empty list if the application has no folder (set it with ' +
          'enregistrer_candidature, dossier field).',
      }),
      inputSchema: { id },
      annotations: lecture,
    },
    sur(({ id }) => {
      offreOuErreur(base(), id);
      return fichiersDossier(base(), donnees(), id);
    }),
  );

  serveur.registerTool(
    'ingerer_emails',
    {
      title: bi({ fr: 'Ingérer les e-mails', en: 'Ingest the e-mails' }),
      description: bi({
        fr:
          `Lit les e-mails d'alertes (.eml) de la boîte de réception (emails/), ajoute les nouvelles offres (doublons ignorés, ` +
          'intitulés exclus mis en « ecartee »), lit les descriptions publiques Hellowork / Free-Work, puis SUPPRIME les e-mails traités, sauf avec garder: true. ' +
          'Renvoie les compteurs, a_dire (à transmettre à l’utilisateur : e-mails supprimés, erreurs d’ingestion), erreurs et un détail ' +
          'abrégé. Suite : offres_a_lire.',
        en:
          'Reads the job alert e-mails (.eml) in the inbox (emails/), adds the new job ads (duplicates ignored, ' +
          'excluded titles set to "ecartee"), reads the public Hellowork / Free-Work descriptions, then DELETES the processed e-mails, unless garder: true. ' +
          'Returns the counters, a_dire (to pass on to the user: deleted e-mails, ingestion errors), erreurs and a shortened ' +
          'detail. Next: offres_a_lire.',
      }),
      inputSchema: {
        garder: z.boolean().optional().describe(bi({ fr: 'true : conserver les .eml après traitement', en: 'true: keep the .eml files after processing' })),
        telecharger: z.boolean().optional().describe(bi({ fr: 'false : ne pas lire les pages Hellowork / Free-Work', en: 'false: do not read the Hellowork / Free-Work pages' })),
      },
      annotations: { destructiveHint: true, openWorldHint: true },
    },
    sur(async (a) =>
      presenterIngestion(await ingererSelonConfig(base(), etat.config, { garder: a.garder, telecharger: a.telecharger }), { garder: a.garder }),
    ),
  );

  serveur.registerTool(
    'generer_suivi',
    {
      title: bi({ fr: 'Générer le suivi', en: 'Generate the tracker' }),
      description: bi({
        fr:
          'Génère le suivi des candidatures en Markdown depuis la base (sections En cours, Envoyées sans suite, Closes). Par défaut ' +
          "dans candidatures/_SUIVI.genere.md (aperçu) ; remplacer: true écrit candidatures/_SUIVI.md, à ne faire que si l'utilisateur l'a demandé.",
        en:
          'Generates the application tracker in Markdown from the database (sections In progress, Sent with no reply, Closed). By default ' +
          'in candidatures/_SUIVI.genere.md (preview); remplacer: true writes candidatures/_SUIVI.md, only to be done if the user asked for it.',
      }),
      inputSchema: {
        remplacer: z.boolean().optional().describe(bi({ fr: 'true : écrire candidatures/_SUIVI.md au lieu de l’aperçu', en: 'true: write candidatures/_SUIVI.md instead of the preview' })),
        sortie: z.string().optional().describe(bi({ fr: 'Fichier de sortie imposé (chemin absolu)', en: 'Forced output file (absolute path)' })),
      },
    },
    sur((a) => ({ ok: true, ...ecrireSuivi(base(), donnees(), { remplacer: a.remplacer, sortie: a.sortie, langue: etat.config.langue }) })),
  );

  return serveur;
}

/**
 * Comme ouvrirEtat, mais une langue inconnue dans l'environnement (réglage « Langue » de l'extension Claude Desktop mal
 * saisi) n'empêche pas le serveur de démarrer : elle est ignorée, avec un avertissement sur stderr.
 */
export function ouvrirEtatTolerant(options: OptionsConfig = {}): EtatMcp {
  try {
    return ouvrirEtat(options);
  } catch (e) {
    const env = options.env ?? process.env;
    if (!(e instanceof ErreurConfig && e.code === 'langue-inconnue') || !variable(env, 'LANGUE')) throw e;
    process.stderr.write(`postuler-juste: ${e.message}\n`);
    const sansLangue = { ...env };
    delete sansLangue.POSTULER_JUSTE_LANGUE;
    delete sansLangue.CAP_EMPLOI_LANGUE;
    return ouvrirEtat({ ...options, env: sansLangue });
  }
}

/**
 * Lance le serveur sur stdio. Le dossier de données vient de --data, POSTULER_JUSTE_DATA ou du fichier de config,
 * sinon du dossier par défaut (~/ma-recherche) ; s'il n'existe pas encore, le serveur démarre quand même
 * (outil initialiser_espace).
 */
export async function demarrerMcp(options: OptionsConfig = {}): Promise<void> {
  const etat = ouvrirEtatTolerant(options);
  const serveur = creerServeurMcp(etat);
  const transport = new StdioServerTransport();
  const fermer = async () => {
    await serveur.close().catch(() => undefined);
    etat.db?.close();
    process.exit(0);
  };
  process.stdin.on('end', fermer);
  process.on('SIGINT', fermer);
  process.on('SIGTERM', fermer);
  await serveur.connect(transport);
  const d = etat.config.dossierDonnees;
  process.stderr.write(
    bi({
      fr: `postuler-juste MCP prêt (données : ${d}${etat.db ? '' : ', espace non initialisé'})\n`,
      en: `postuler-juste MCP ready (data: ${d}${etat.db ? '' : ', workspace not initialised'})\n`,
    }),
  );
}
