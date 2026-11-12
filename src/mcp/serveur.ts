// Serveur MCP (transport stdio) : expose le noyau de postuler-juste à une IA (Claude Code, Claude Desktop…).
// Aucune logique propre ici : chaque outil appelle les mêmes fonctions que la CLI et l'API.
// stdout est réservé au protocole : rien d'autre ne doit y être écrit.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { RACINE_APP } from '../core/config.ts';
import type { OptionsConfig } from '../core/config.ts';
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
import { messageNonInitialise, ouvrirEtat, type EtatMcp } from './etat.ts';
import { enregistrerOutilsEspace } from './espace.ts';
import { sur } from './resultats.ts';
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

const INSTRUCTIONS = `postuler-juste aide l'utilisateur dans sa recherche d'emploi ou de missions. Son espace de travail (un dossier)
contient ses consignes, son contexte, ses CV et ses dossiers de candidature ; la base SQLite garde l'état des offres :
offres, notes, statuts, tags, candidatures. L'application n'appelle aucun modèle : c'est toi qui lis et notes.
Début de session : si l'espace n'existe pas (etat_espace), proposer de le créer (initialiser_espace, dossier confirmé par
l'utilisateur). Les consignes de l'espace font foi : AGENTS.md (ressource « consignes » ou lire_fichier AGENTS.md), à lire
avant tout ; prompts demarrage, traiter-emails, preparer-go, cv-cible. Sans accès direct aux fichiers ni terminal (Claude Desktop…) :
lister_fichiers / lire_fichier / ecrire_fichier (chemins relatifs à l'espace) au lieu de lire le disque, generer_cv (capture: true
pour voir le rendu) au lieu de « postuler-juste cv », compter au lieu de « postuler-juste compter ».
Honnêteté d'abord : n'écrire dans un CV ou un message que ce que _CONTEXTE.md permet de revendiquer. C'est l'utilisateur qui envoie
ses candidatures.
Flux habituel : ingerer_emails → offres_a_lire → grille (lire la grille de notation : critères, barèmes, règles,
inventaire, exemples) → (lire chaque offre, noter ses critères) → noter_lot avec criteres / entrees / bloquants
(l'application calcule la note finale, ne la donne pas) → résumer à l'utilisateur → sur son « go » : candidater, préparer le dossier, enregistrer_candidature
→ generer_suivi. Sans « go » : changer_statut vers « ecartee » avec la raison.
Quand l'utilisateur raconte un appel, un entretien, un message, un devis : ajouter_evenement (avec le fichier
du dossier s'il y en a un, voir fichiers_dossier), puis la prochaine échéance (ajouter_evenement daté dans
le futur, fait: false). echeances liste ce qui est en retard ou à venir ; marquer_fait clôt une échéance.
Ne télécharge pas LinkedIn, Indeed ni Glassdoor par script : lis ces pages dans le navigateur de l'utilisateur
ou demande-lui le texte. Les consignes de candidature sont dans le dossier de données de l'utilisateur (renvoyé par
candidater) : les lire avant de rédiger. Ne modifie la grille (modifier_grille) qu'à la demande de l'utilisateur,
après un essai (essai: true) dont tu lui montres l'impact.`;

const id = z.number().int().positive().describe("Identifiant de l'offre dans postuler-juste (champ id)");
const texteFacultatif = (d: string) => z.string().nullable().optional().describe(d);
const nombreNote = (d: string) => z.union([z.number().min(0).max(10), z.string()]).nullable().optional().describe(d);

/** Une note au format des lots (fichiers candidatures/_lots/*.json). */
const champsNote = {
  criteres: z
    .record(
      z.string(),
      z.object({
        note: z.union([z.number().min(0).max(10), z.string()]).describe('Sous-note de 0 à 10'),
        justification: z.string().optional().describe('Justification courte (écarts pour le critère technique)'),
      }),
    )
    .optional()
    .describe(
      "Sous-notes des critères notés par l'IA (voir l'outil grille) : { \"technique\": { \"note\": 8, \"justification\": \"…\" }, \"role\": {…}, … }. " +
        "Avec criteres, l'application calcule la note finale (le champ note est ignoré).",
    ),
  entrees: z
    .object({
      jours_sur_site: z.number().int().min(0).max(5).nullable().optional().describe('Jours sur site par semaine (0 = full remote, 5 = sur site)'),
      salaire_min: z.number().positive().nullable().optional().describe('Rémunération basse en euros (55000, 450)'),
      salaire_max: z.number().positive().nullable().optional().describe('Rémunération haute en euros'),
      unite: z.enum(UNITES).nullable().optional().describe('an (salaire annuel brut), mois, jour (TJM), heure'),
    })
    .optional()
    .describe("Données d'entrée des critères calculés, quand l'offre les donne (sinon déduites des champs de l'offre)"),
  bloquants: z.array(z.string()).optional().describe('Identifiants des règles bloquantes qui s’appliquent (voir grille), ex. ["stage"]'),
  note: nombreNote('Note globale sur 10 (ancienne grille, sans criteres) ; ignorée si criteres est fourni'),
  note_brute: nombreNote('Note globale avant pénalités (ancienne grille)'),
  penalites: z.string().optional().describe('Ancienne grille : pénalités en clair. Avec criteres, utiliser bloquants'),
  colle: z.string().optional().describe("Ce qui colle avec le profil de l'utilisateur"),
  ecarts: z.string().optional().describe('Écarts à assumer ou raisons de ne pas y aller'),
  lu: z.boolean().optional().describe("true si l'offre complète a été lue (pas seulement l'intitulé)"),
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
  id: id.optional().describe('Identifiant postuler-juste (sinon url)'),
  url: z.string().optional().describe("URL de l'offre (si pas d'id) : l'offre est retrouvée, ou créée"),
  ...champsDescriptifs,
  ...champsNote,
});

function normaliserEntree(e: z.infer<typeof entreeLot>): EntreeLot {
  if (e.id === undefined && !e.url) throw new Error('Chaque note doit avoir un "id" ou une "url"');
  return e as EntreeLot;
}

export function creerServeurMcp(etat: EtatMcp): McpServer {
  const VERSION_APP = (JSON.parse(readFileSync(join(RACINE_APP, 'package.json'), 'utf8')) as { version: string }).version;
  const serveur = new McpServer({ name: 'postuler-juste', version: VERSION_APP }, { instructions: INSTRUCTIONS });
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
  const chargerGrille = () => grilleCourante(base(), donnees());

  serveur.registerTool(
    'lister_offres',
    {
      title: 'Lister les offres',
      description:
        "Liste paginée des offres en base (sans la description : lire_offre pour le détail ; champs vides omis). " +
        'Sert aussi à vérifier si une offre ou une entreprise a déjà été vue (texte). Renvoie total, page, pages, restantes et offres.',
      inputSchema: {
        statuts: z.array(z.enum(STATUTS)).optional().describe(`Statuts retenus, parmi : ${STATUTS.join(', ')}`),
        sources: z.array(z.string()).optional().describe('Sources : linkedin, indeed, glassdoor, hellowork, free-work, collective, registre, suivi, manuel'),
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
        taille: z.number().int().min(1).max(LISTE_MAX).optional().describe(`Offres par page (${LISTE_DEFAUT} par défaut, ${LISTE_MAX} au plus)`),
        tri: z.string().optional().describe(`Tri sur un ou plusieurs niveaux, séparés par des virgules, chacun avec son sens facultatif : « note », « recue_le:desc,note:desc ». Colonnes : ${COLONNES_TRI.join(', ')} (recue_le par défaut)`),
        ordre: z.enum(['asc', 'desc']).optional().describe('Sens des niveaux de tri qui n’en précisent pas (desc par défaut)'),
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
      title: 'Lire une offre',
      description:
        "Détail d'une offre : champs, description (coupée au-delà de 15 000 caractères, sauf complet: true), les 3 notes les plus récentes " +
        '(la première fait foi), historique des statuts, tags, candidature, journal. À appeler offre par offre pour lire et noter.',
      inputSchema: { id, complet: z.boolean().optional().describe('true : description entière, même très longue') },
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
      title: 'Offres à lire',
      description:
        'Offres à traiter (statut nouvelle ou a-lire) sans note, des plus anciennes aux plus récentes, en résumé paginé : id, titre, ' +
        `entreprise, lieu, source, url, lecture, longueur_description (0 = pas de description en base). ${A_LIRE_DEFAUT} par page ; ` +
        'restantes = offres après cette page (page suivante : page + 1). Ensuite, lire chaque offre avec lire_offre(id). Champ « lecture » : ' +
        '« description » = texte en base (lire_offre) ; « navigateur » = ouvrir « url » dans le navigateur de l’utilisateur s’il y en a un, ' +
        'sinon lui demander le texte ; « humain » = page protégée (Glassdoor), demander le texte à l’utilisateur. descriptions: true joint ' +
        `les descriptions tronquées (${LONGUEUR_DESCRIPTION_PAGE} caractères, ${A_LIRE_MAX_DESCRIPTIONS} offres par page au plus).`,
      inputSchema: {
        limite: z.number().int().min(1).max(A_LIRE_MAX).optional().describe(`Offres par page (${A_LIRE_DEFAUT} par défaut)`),
        page: z.number().int().min(1).optional().describe('Page (1 par défaut)'),
        descriptions: z
          .boolean()
          .optional()
          .describe(`true : joindre les descriptions tronquées (page limitée à ${A_LIRE_MAX_DESCRIPTIONS} offres)`),
      },
      annotations: lecture,
    },
    sur((a) => {
      const limite = Math.min(a.limite ?? A_LIRE_DEFAUT, a.descriptions ? A_LIRE_MAX_DESCRIPTIONS : A_LIRE_MAX);
      const r = offresALire(base(), { limite, page: a.page, descriptions: Boolean(a.descriptions), longueur: LONGUEUR_DESCRIPTION_PAGE });
      return {
        ...r,
        offres: r.offres.map((o) => sansVides(o)),
        suite: r.restantes ? `offres_a_lire avec page: ${r.page + 1} pour les ${r.restantes} suivantes` : null,
      };
    }),
  );

  serveur.registerTool(
    'noter_offre',
    {
      title: 'Noter une offre',
      description:
        "Enregistre une note pour une offre, désignée par id (ou par url : l'offre est créée si elle n'existe pas). Lire d'abord " +
        "l'outil grille. Fournir criteres (sous-notes des critères IA), entrees (jours sur site, salaire) et bloquants : l'application " +
        "calcule la note finale et renvoie sa décomposition. La note s'ajoute à l'historique (la dernière fait foi) ; une offre encore " +
        'à traiter passe en « notee ». Les champs descriptifs ne complètent que ce qui manque en base.',
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
      title: 'Noter un lot',
      description:
        'Enregistre plusieurs notes d’un coup (format des fichiers de lot : chaque entrée a un id ou une url, et les champs de noter_offre, ' +
        'dont criteres / entrees / bloquants). Tout ou rien : une entrée invalide annule le lot. essai: true calcule sans enregistrer.',
      inputSchema: {
        offres: z.array(entreeLot).min(1).describe('Entrées du lot'),
        essai: z.boolean().optional().describe('true : calcule les notes et les renvoie sans rien enregistrer'),
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
      title: 'Grille de notation',
      description:
        "Grille de notation courante de l'utilisateur, à lire avant de noter : critères et poids (normalisés), qui note quoi (IA ou calcul), " +
        'barèmes (télétravail, rémunération), règles bloquantes, inventaire de compétences (fort / moyen / léger / zéro), exemples de ' +
        'référence avec leur note calculée, seuil « à regarder » et consignes de notation (consignes_ia).',
      inputSchema: { version: z.number().int().positive().optional().describe('Version précise (par défaut : la courante)') },
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
      title: 'Modifier la grille',
      description:
        "Changement partiel de la grille, à la demande de l'utilisateur seulement : poids ({ technique: 40 }), seuil, barèmes " +
        '(teletravail.jours_sur_site, remuneration.salaire / tjm : plancher, cible_basse, cible_haute, plancher_full_remote), règles ' +
        '(ajout ou modification par id : libelle, effet zero | plafond | plafond_critere, valeur, critere, seuil, actif ; retirer_regles), critères (libellé, description), ' +
        'inventaire (ajouter [{ techno, niveau }], retirer [techno]), exemples de référence (ajouter [exemple complet, au format de ' +
        'grille.exemples : remplace celui de même titre et entreprise], retirer [titre]) : inutile de réécrire profil/grille.json. ' +
        "essai: true renvoie l'aperçu sans enregistrer : impact sur les offres notées et exemples_calcules (note de chaque exemple " +
        "de référence avant / après), utile même sur une base vide ; le montrer d'abord. Sinon crée une nouvelle version (avec le " +
        "résumé), recalcule toutes les notes à critères et renvoie l'impact (notes qui changent, offres qui franchissent le seuil). " +
        'restaurer_version revient à une version précédente.',
      inputSchema: {
        changement: schemaChangement.optional().describe('Changement partiel (champs absents inchangés)'),
        resume: z.string().optional().describe('Résumé du changement, gardé dans l’historique (obligatoire sauf en essai)'),
        essai: z.boolean().optional().describe('true : aperçu de l’impact sans enregistrer'),
        restaurer_version: z.number().int().positive().optional().describe('Revenir à cette version (à la place de changement)'),
      },
    },
    sur(({ changement, resume, essai, restaurer_version }) => {
      if (restaurer_version !== undefined) {
        const r = restaurerGrille(base(), donnees(), restaurer_version, { auteur: ORIGINE, resume });
        return { ok: true, enregistree: true, version: r.version.version, impact: impactPlafonne(r.impact) };
      }
      if (!changement) throw new Error('changement ou restaurer_version attendu');
      if (!essai && !resume?.trim()) throw new Error('resume attendu (ou essai: true pour un aperçu)');
      const r = modifierGrille(base(), donnees(), changement, { auteur: ORIGINE, resume: resume ?? '', essai });
      return {
        ok: true,
        enregistree: r.enregistree,
        version: r.version,
        impact: impactPlafonne(r.impact),
        exemples_calcules: r.exemples_calcules,
        ...(r.impact.offres_recalculees === 0
          ? { remarque: 'Aucune offre notée à critères en base : l’effet se lit sur exemples_calcules (avant → note).' }
          : {}),
      };
    }),
  );

  serveur.registerTool(
    'renoter',
    {
      title: 'Recalculer les notes',
      description:
        "Recalcule avec la grille courante toutes les notes à critères (sans relire d'offre). Les notes globales de l'ancienne grille restent " +
        "figées. Utile après une correction des champs télétravail / rémunération des offres ; un changement de grille recalcule déjà tout.",
      inputSchema: {},
    },
    sur(() => ({ ok: true, ...renoter(base(), donnees()) })),
  );

  serveur.registerTool(
    'historique_grille',
    {
      title: 'Historique de la grille',
      description: 'Versions de la grille, de la plus récente à la plus ancienne : version, date, auteur (interface, cli, mcp, fichier), résumé.',
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
      offreOuErreur(base(), id);
      ajouterStatut(base(), id, statut, { commentaire: commentaire ?? null, origine: ORIGINE });
      return { ok: true, id, statut: detailOffre(base(), id)!.statut };
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
      offreOuErreur(base(), id);
      return { ok: true, id, tags: transaction(base(), () => modifierTags(base(), id, ajouter ?? [], retirer ?? [])) };
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
      offreOuErreur(base(), id);
      modifierLien(base(), id, url);
      return { ok: true, id, url: detailOffre(base(), id)!.url_canonique };
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
    sur(({ id }) => preparerCandidature(base(), donnees(), id, ORIGINE)),
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
      const r = suivreCandidature(base(), id, champs, ORIGINE);
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
    sur(({ id, ...saisie }) => ({ ok: true, evenement: ajouterEvenement(base(), id, saisie, ORIGINE) })),
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
    sur(({ evenement_id, ...saisie }) => ({ ok: true, evenement: modifierEvenement(base(), evenement_id, saisie) })),
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
      offreOuErreur(base(), id);
      return { id, evenements: journal(base(), id) };
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
    sur(({ jours }) => echeances(base(), { jours })),
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
      evenementOuErreur(base(), evenement_id);
      return { ok: true, evenement: marquerFait(base(), evenement_id, fait ?? true) };
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
      offreOuErreur(base(), id);
      return fichiersDossier(base(), donnees(), id);
    }),
  );

  serveur.registerTool(
    'ingerer_emails',
    {
      title: 'Ingérer les e-mails',
      description:
        `Lit les e-mails d'alertes (.eml) de la boîte de réception (emails/), ajoute les nouvelles offres (doublons ignorés, ` +
        "intitulés exclus mis en « ecartee »), lit les descriptions publiques Hellowork / Free-Work, puis SUPPRIME les e-mails traités, sauf avec garder: true. " +
        'Renvoie les compteurs, a_dire (à transmettre à l’utilisateur : e-mails supprimés, erreurs d’ingestion), erreurs et un détail ' +
        'abrégé. Suite : offres_a_lire.',
      inputSchema: {
        garder: z.boolean().optional().describe('true : conserver les .eml après traitement'),
        telecharger: z.boolean().optional().describe('false : ne pas lire les pages Hellowork / Free-Work'),
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
      title: 'Générer le suivi',
      description:
        'Génère le suivi des candidatures en Markdown depuis la base (sections En cours, Envoyées sans suite, Closes). Par défaut ' +
        "dans candidatures/_SUIVI.genere.md (aperçu) ; remplacer: true écrit candidatures/_SUIVI.md, à ne faire que si l'utilisateur l'a demandé.",
      inputSchema: {
        remplacer: z.boolean().optional().describe('true : écrire candidatures/_SUIVI.md au lieu de l’aperçu'),
        sortie: z.string().optional().describe('Fichier de sortie imposé (chemin absolu)'),
      },
    },
    sur((a) => ({ ok: true, ...ecrireSuivi(base(), donnees(), { remplacer: a.remplacer, sortie: a.sortie }) })),
  );

  return serveur;
}

/**
 * Lance le serveur sur stdio. Le dossier de données vient de --data, POSTULER_JUSTE_DATA ou du fichier de config,
 * sinon du dossier par défaut (~/ma-recherche) ; s'il n'existe pas encore, le serveur démarre quand même
 * (outil initialiser_espace).
 */
export async function demarrerMcp(options: OptionsConfig = {}): Promise<void> {
  const etat = ouvrirEtat(options);
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
  process.stderr.write(`postuler-juste MCP prêt (données : ${d}${etat.db ? '' : ', espace non initialisé'})\n`);
}
