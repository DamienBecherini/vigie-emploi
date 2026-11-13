// Serveur MCP (transport stdio) : expose le noyau de vigie-emploi à une IA (Claude Code, Claude Desktop…).
// Aucune logique propre ici : chaque outil appelle les mêmes fonctions que la CLI et l'API.
// stdout est réservé au protocole : rien d'autre ne doit y être écrit.
// Langue : celle de la configuration (clé « langue » ou VIGIE_EMPLOI_LANGUE), fixée à la création du serveur ;
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
import { bi, bt, tm } from './textes.ts';
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

const INSTRUCTIONS = bt('serveur.INSTRUCTIONS');

/** Schémas des paramètres, construits dans la langue courante (descriptions comprises). */
function construireSchemas() {
  const id = z.number().int().positive().describe(tm('serveur.id'));
  const nombreNote = (d: string) => z.union([z.number().min(0).max(10), z.string()]).nullable().optional().describe(d);

  /** Une note au format des lots (fichiers candidatures/_lots/*.json). */
  const champsNote = {
    criteres: z
      .record(
        z.string(),
        z.object({
          note: z.union([z.number().min(0).max(10), z.string()]).describe(tm('serveur.champsNote.criteres.note')),
          justification: z
            .string()
            .optional()
            .describe(tm('serveur.champsNote.criteres.justification')),
        }),
      )
      .optional()
      .describe(
        tm('serveur.champsNote.criteres'),
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
          .describe(tm('serveur.champsNote.entrees.jours_sur_site')),
        salaire_min: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe(tm('serveur.champsNote.entrees.salaire_min')),
        salaire_max: z.number().positive().nullable().optional().describe(tm('serveur.champsNote.entrees.salaire_max')),
        unite: z
          .enum(UNITES)
          .nullable()
          .optional()
          .describe(tm('serveur.champsNote.entrees.unite')),
      })
      .optional()
      .describe(
        tm('serveur.champsNote.entrees'),
      ),
    bloquants: z
      .array(z.string())
      .optional()
      .describe(tm('serveur.champsNote.bloquants')),
    note: nombreNote(tm('serveur.champsNote.note')),
    note_brute: nombreNote(tm('serveur.champsNote.note_brute')),
    penalites: z
      .string()
      .optional()
      .describe(tm('serveur.champsNote.penalites')),
    colle: z.string().optional().describe(tm('serveur.champsNote.colle')),
    ecarts: z.string().optional().describe(tm('serveur.champsNote.ecarts')),
    lu: z.boolean().optional().describe(tm('serveur.champsNote.lu')),
    tags: z.array(z.string()).optional().describe(tm('serveur.champsNote.tags')),
  };
  const champsDescriptifs = {
    source: z
      .string()
      .optional()
      .describe(tm('serveur.champsDescriptifs.source')),
    titre: z.string().optional().describe(tm('serveur.champsDescriptifs.titre')),
    entreprise: z.string().optional().describe(tm('serveur.champsDescriptifs.entreprise')),
    lieu: z.string().optional(),
    contrat: z.string().optional().describe(tm('serveur.champsDescriptifs.contrat')),
    remuneration: z.string().optional().describe(tm('serveur.champsDescriptifs.remuneration')),
    teletravail: z.string().optional().describe(tm('serveur.champsDescriptifs.teletravail')),
    publiee: z.string().optional().describe(tm('serveur.champsDescriptifs.publiee')),
    stack: z.string().optional().describe(tm('serveur.champsDescriptifs.stack')),
    description: z.string().optional().describe(tm('serveur.champsDescriptifs.description')),
  };
  const entreeLot = z.object({
    id: id.optional().describe(tm('serveur.entreeLot.id')),
    url: z
      .string()
      .optional()
      .describe(tm('serveur.entreeLot.url')),
    ...champsDescriptifs,
    ...champsNote,
  });
  const texteFacultatif = (d: string) => z.string().nullable().optional().describe(d);
  return { id, entreeLot, texteFacultatif };
}

type Schemas = ReturnType<typeof construireSchemas>;

function normaliserEntree(e: z.infer<Schemas['entreeLot']>): EntreeLot {
  if (e.id === undefined && !e.url) throw new Error(tm('serveur.normaliserEntree'));
  return e as EntreeLot;
}

export function creerServeurMcp(etat: EtatMcp): McpServer {
  definirLangue(etat.config.langue);
  const { id, entreeLot, texteFacultatif } = construireSchemas();
  const VERSION_APP = (JSON.parse(readFileSync(join(RACINE_APP, 'package.json'), 'utf8')) as { version: string }).version;
  const serveur = new McpServer({ name: 'vigie-emploi', version: VERSION_APP }, { instructions: bi(INSTRUCTIONS) });
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
      title: tm('serveur.lister_offres.title'),
      description: tm('serveur.lister_offres.description'),
      inputSchema: {
        statuts: z
          .array(z.enum(STATUTS))
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.statuts', { p1: String(STATUTS.join(', ')) })),
        sources: z
          .array(z.string())
          .optional()
          .describe(
            tm('serveur.lister_offres.inputSchema.sources'),
          ),
        tags: z.array(z.string()).optional().describe(tm('serveur.lister_offres.inputSchema.tags')),
        note_min: z.number().optional().describe(tm('serveur.lister_offres.inputSchema.note_min')),
        note_max: z.number().optional().describe(tm('serveur.lister_offres.inputSchema.note_max')),
        sans_note: z
          .boolean()
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.sans_note')),
        texte: z
          .string()
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.texte')),
        contrat: z.string().optional().describe(tm('serveur.lister_offres.inputSchema.contrat')),
        teletravail: z.string().optional().describe(tm('serveur.lister_offres.inputSchema.teletravail')),
        recue_depuis: z.string().optional().describe(tm('serveur.lister_offres.inputSchema.recue_depuis')),
        recue_jusqua: z.string().optional().describe(tm('serveur.lister_offres.inputSchema.recue_jusqua')),
        publiee_depuis: z.string().optional().describe(tm('serveur.lister_offres.inputSchema.publiee_depuis')),
        mes_candidatures: z
          .boolean()
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.mes_candidatures')),
        page: z.number().int().min(1).optional().describe(tm('serveur.lister_offres.inputSchema.page')),
        taille: z
          .number()
          .int()
          .min(1)
          .max(LISTE_MAX)
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.taille', { LISTE_DEFAUT: String(LISTE_DEFAUT), LISTE_MAX: String(LISTE_MAX) })),
        tri: z
          .string()
          .optional()
          .describe(
            tm('serveur.lister_offres.inputSchema.tri', { p1: String(COLONNES_TRI.join(', ')) }),
          ),
        ordre: z
          .enum(['asc', 'desc'])
          .optional()
          .describe(tm('serveur.lister_offres.inputSchema.ordre')),
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
      title: tm('serveur.lire_offre.title'),
      description: tm('serveur.lire_offre.description'),
      inputSchema: { id, complet: z.boolean().optional().describe(tm('serveur.lire_offre.inputSchema.complet')) },
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
      title: tm('serveur.offres_a_lire.title'),
      description: tm('serveur.offres_a_lire.description', { A_LIRE_DEFAUT: String(A_LIRE_DEFAUT), LONGUEUR_DESCRIPTION_PAGE: String(LONGUEUR_DESCRIPTION_PAGE), A_LIRE_MAX_DESCRIPTIONS: String(A_LIRE_MAX_DESCRIPTIONS) }),
      inputSchema: {
        limite: z
          .number()
          .int()
          .min(1)
          .max(A_LIRE_MAX)
          .optional()
          .describe(tm('serveur.offres_a_lire.inputSchema.limite', { A_LIRE_DEFAUT: String(A_LIRE_DEFAUT) })),
        page: z.number().int().min(1).optional().describe(tm('serveur.offres_a_lire.inputSchema.page')),
        descriptions: z
          .boolean()
          .optional()
          .describe(
            tm('serveur.offres_a_lire.inputSchema.descriptions', { A_LIRE_MAX_DESCRIPTIONS: String(A_LIRE_MAX_DESCRIPTIONS) }),
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
          ? tm('serveur.offres_a_lire.suite', { p1: String(r.page + 1), restantes: String(r.restantes) })
          : null,
      };
    }),
  );

  serveur.registerTool(
    'noter_offre',
    {
      title: tm('serveur.noter_offre.title'),
      description: tm('serveur.noter_offre.description'),
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
      title: tm('serveur.noter_lot.title'),
      description: tm('serveur.noter_lot.description'),
      inputSchema: {
        offres: z.array(entreeLot).min(1).describe(tm('serveur.noter_lot.inputSchema.offres')),
        essai: z
          .boolean()
          .optional()
          .describe(tm('serveur.noter_lot.inputSchema.essai')),
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
      title: tm('serveur.grille.title'),
      description: tm('serveur.grille.description'),
      inputSchema: { version: z.number().int().positive().optional().describe(tm('serveur.grille.inputSchema.version')) },
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
      title: tm('serveur.modifier_grille.title'),
      description: tm('serveur.modifier_grille.description'),
      inputSchema: {
        changement: schemaChangement.optional().describe(tm('serveur.modifier_grille.inputSchema.changement')),
        resume: z
          .string()
          .optional()
          .describe(tm('serveur.modifier_grille.inputSchema.resume')),
        essai: z.boolean().optional().describe(tm('serveur.modifier_grille.inputSchema.essai')),
        restaurer_version: z
          .number()
          .int()
          .positive()
          .optional()
          .describe(tm('serveur.modifier_grille.inputSchema.restaurer_version')),
      },
    },
    sur(({ changement, resume, essai, restaurer_version }) => {
      if (restaurer_version !== undefined) {
        const r = restaurerGrille(base(), donnees(), restaurer_version, { auteur: ORIGINE, resume });
        return { ok: true, enregistree: true, version: r.version.version, impact: impactPlafonne(r.impact) };
      }
      if (!changement) throw new Error(tm('serveur.modifier_grille'));
      if (!essai && !resume?.trim()) throw new Error(tm('serveur.modifier_grille_2'));
      const r = modifierGrille(base(), donnees(), changement, { auteur: ORIGINE, resume: resume ?? '', essai });
      return {
        ok: true,
        enregistree: r.enregistree,
        version: r.version,
        impact: impactPlafonne(r.impact),
        exemples_calcules: r.exemples_calcules,
        ...(r.impact.offres_recalculees === 0
          ? {
              remarque: tm('serveur.modifier_grille.remarque'),
            }
          : {}),
      };
    }),
  );

  serveur.registerTool(
    'renoter',
    {
      title: tm('serveur.renoter.title'),
      description: tm('serveur.renoter.description'),
      inputSchema: {},
    },
    sur(() => ({ ok: true, ...renoter(base(), donnees()) })),
  );

  serveur.registerTool(
    'historique_grille',
    {
      title: tm('serveur.historique_grille.title'),
      description: tm('serveur.historique_grille.description'),
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
      title: tm('serveur.changer_statut.title'),
      description: tm('serveur.changer_statut.description'),
      inputSchema: {
        id,
        statut: z.enum(STATUTS).describe(tm('serveur.changer_statut.inputSchema.statut', { p1: String(STATUTS.join(', ')) })),
        commentaire: z.string().optional().describe(tm('serveur.changer_statut.inputSchema.commentaire')),
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
      title: tm('serveur.modifier_tags.title'),
      description: tm('serveur.modifier_tags.description'),
      inputSchema: {
        id,
        ajouter: z.array(z.string()).optional().describe(tm('serveur.modifier_tags.inputSchema.ajouter')),
        retirer: z.array(z.string()).optional().describe(tm('serveur.modifier_tags.inputSchema.retirer')),
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
      title: tm('serveur.modifier_lien.title'),
      description: tm('serveur.modifier_lien.description'),
      inputSchema: { id, url: z.string().nullable().describe(tm('serveur.modifier_lien.inputSchema.url')) },
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
      title: tm('serveur.candidater.title'),
      description: tm('serveur.candidater.description'),
      inputSchema: { id },
    },
    sur(({ id }) => preparerCandidature(base(), donnees(), id, ORIGINE)),
  );

  serveur.registerTool(
    'enregistrer_candidature',
    {
      title: tm('serveur.enregistrer_candidature.title'),
      description: tm('serveur.enregistrer_candidature.description'),
      inputSchema: {
        id,
        dossier: texteFacultatif(
          tm('serveur.enregistrer_candidature.inputSchema.dossier'),
        ),
        cv: texteFacultatif(tm('serveur.enregistrer_candidature.inputSchema.cv')),
        canal: texteFacultatif(tm('serveur.enregistrer_candidature.inputSchema.canal')),
        envoyee_le: texteFacultatif(
          tm('serveur.enregistrer_candidature.inputSchema.envoyee_le'),
        ),
        message: texteFacultatif(tm('serveur.enregistrer_candidature.inputSchema.message')),
        prochaine_action: texteFacultatif(
          tm('serveur.enregistrer_candidature.inputSchema.prochaine_action'),
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
      .describe(tm('serveur.champsEvenement.sens')),
    details: texteFacultatif(
      tm('serveur.champsEvenement.details'),
    ),
    canal: texteFacultatif(tm('serveur.champsEvenement.canal')),
    interlocuteurs: texteFacultatif(
      tm('serveur.champsEvenement.interlocuteurs'),
    ),
    montant: z.number().nullable().optional().describe(tm('serveur.champsEvenement.montant')),
    unite: texteFacultatif(tm('serveur.champsEvenement.unite')),
    jours: z.number().nullable().optional().describe(tm('serveur.champsEvenement.jours')),
    fichiers: z
      .array(z.string())
      .nullable()
      .optional()
      .describe(
        tm('serveur.champsEvenement.fichiers'),
      ),
  };

  serveur.registerTool(
    'ajouter_evenement',
    {
      title: tm('serveur.ajouter_evenement.title'),
      description: tm('serveur.ajouter_evenement.description'),
      inputSchema: {
        id,
        type: z.enum(TYPES_EVENEMENT).describe(tm('serveur.ajouter_evenement.inputSchema.type', { p1: String(TYPES_EVENEMENT.join(', ')) })),
        le: z
          .string()
          .optional()
          .describe(
            tm('serveur.ajouter_evenement.inputSchema.le'),
          ),
        resume: z
          .string()
          .min(1)
          .describe(
            tm('serveur.ajouter_evenement.inputSchema.resume'),
          ),
        fait: z
          .boolean()
          .optional()
          .describe(tm('serveur.ajouter_evenement.inputSchema.fait')),
        ...champsEvenement,
      },
    },
    sur(({ id, ...saisie }) => ({ ok: true, evenement: ajouterEvenement(base(), id, saisie, ORIGINE) })),
  );

  serveur.registerTool(
    'modifier_evenement',
    {
      title: tm('serveur.modifier_evenement.title'),
      description: tm('serveur.modifier_evenement.description'),
      inputSchema: {
        evenement_id: z.number().int().positive().describe(tm('serveur.modifier_evenement.inputSchema.evenement_id')),
        type: z.enum(TYPES_EVENEMENT).optional(),
        le: z.string().optional().describe(tm('serveur.modifier_evenement.inputSchema.le')),
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
      title: tm('serveur.journal.title'),
      description: tm('serveur.journal.description'),
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
      title: tm('serveur.echeances.title'),
      description: tm('serveur.echeances.description'),
      inputSchema: {
        jours: z.number().int().min(0).max(366).optional().describe(tm('serveur.echeances.inputSchema.jours')),
      },
      annotations: lecture,
    },
    sur(({ jours }) => echeances(base(), { jours })),
  );

  serveur.registerTool(
    'marquer_fait',
    {
      title: tm('serveur.marquer_fait.title'),
      description: tm('serveur.marquer_fait.description'),
      inputSchema: {
        evenement_id: z.number().int().positive().describe(tm('serveur.marquer_fait.inputSchema.evenement_id')),
        fait: z.boolean().optional().describe(tm('serveur.marquer_fait.inputSchema.fait')),
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
      title: tm('serveur.fichiers_dossier.title'),
      description: tm('serveur.fichiers_dossier.description'),
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
      title: tm('serveur.ingerer_emails.title'),
      description: tm('serveur.ingerer_emails.description'),
      inputSchema: {
        garder: z.boolean().optional().describe(tm('serveur.ingerer_emails.inputSchema.garder')),
        telecharger: z.boolean().optional().describe(tm('serveur.ingerer_emails.inputSchema.telecharger')),
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
      title: tm('serveur.generer_suivi.title'),
      description: tm('serveur.generer_suivi.description'),
      inputSchema: {
        remplacer: z.boolean().optional().describe(tm('serveur.generer_suivi.inputSchema.remplacer')),
        sortie: z.string().optional().describe(tm('serveur.generer_suivi.inputSchema.sortie')),
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
    process.stderr.write(`vigie-emploi: ${e.message}\n`);
    const sansLangue = { ...env };
    for (const prefixe of ['VIGIE_EMPLOI', 'POSTULER_JUSTE', 'CAP_EMPLOI']) delete sansLangue[`${prefixe}_LANGUE`];
    return ouvrirEtat({ ...options, env: sansLangue });
  }
}

/**
 * Lance le serveur sur stdio. Le dossier de données vient de --data, VIGIE_EMPLOI_DATA ou du fichier de config,
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
    tm('serveur.demarrerMcp', { d: String(d), p2: String(etat.db ? '' : ', espace non initialisé'), p3: String(etat.db ? '' : ', workspace not initialised') }),
  );
}
