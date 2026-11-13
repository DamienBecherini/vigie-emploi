// Outils, prompts et ressource du serveur MCP pour un client sans accès aux fichiers ni au terminal (Claude Desktop…) :
// création de l'espace, consignes de l'espace en prompts, fichiers confinés au dossier de données, CV en PDF, comptage.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { RACINE_APP } from '../core/config.ts';
import { cheminDansEspace, deplacerEspace, ecrireEspace, lireEspace, listerEspace, refuser, EXTENSIONS_ECRITURE } from '../core/acces-fichiers.ts';
import { textePdf, texteDocx, TYPES_IMAGE } from '../core/extraction.ts';
import { compterTexte } from '../core/compter.ts';
import { choisirGabarit, GABARIT_DEFAUT, genererCv, listerGabarits, trouverNavigateur } from '../cv/cv.ts';
import { analyserPages } from '../cv/pages.ts';
import { initialiserEspace } from '../init/init.ts';
import { basculer, dossierParDefaut, espaceExiste, messageNonInitialise, type EtatMcp } from './etat.ts';
import { sur, surContenu } from './resultats.ts';
import { bi, type Bilingue } from './textes.ts';
import { LANGUES, type Langue } from '../i18n/index.ts';

const oblique = (p: string) => p.replace(/\\/g, '/');

/** Image transmise à l'IA : au-delà, la plupart des clients la refusent. */
const IMAGE_MAX = 5 * 1024 * 1024;

/** Fichier texte lu par morceaux au-delà de cette taille (réponse lisible en entier par l'IA). */
const MORCEAU_TEXTE = 24_000;

/** Consignes de l'espace exposées en prompts : nom → fichiers lus sur le disque à chaque appel. */
const PROMPTS: Record<string, { titre: Bilingue; description: Bilingue; fichier: string; consigne: Bilingue }> = {
  demarrage: {
    titre: { fr: 'Démarrage guidé', en: 'Guided onboarding' },
    description: {
      fr:
        "Premier entretien (ou reprise) : lire ce que l'utilisateur a déposé, poser les questions, remplir _CONTEXTE.md, adapter la grille, " +
        "écrire un premier CV. Consignes lues dans l'espace (AGENTS.md puis DEMARRAGE.md). Crée l'espace s'il n'existe pas encore.",
      en:
        'First interview (or resuming it): read what the user has dropped in, ask the questions, fill in _CONTEXTE.md, adapt the grid, ' +
        'write a first CV. Instructions read from the workspace (AGENTS.md then DEMARRAGE.md). Creates the workspace if it does not exist yet.',
    },
    fichier: 'DEMARRAGE.md',
    consigne: {
      fr:
        "Suis le démarrage : vérifie d'abord de quels outils tu disposes, lis ce que j'ai déposé dans a-deposer/, " +
        'puis pose-moi tes questions, quelques-unes à la fois.',
      en:
        'Follow the onboarding: first check which tools you have, read what I have dropped into a-deposer/, ' +
        'then ask me your questions, a few at a time. Talk to me in English.',
    },
  },
  'traiter-emails': {
    titre: { fr: 'Traiter les e-mails d’alertes', en: 'Process the job alert e-mails' },
    description: {
      fr: "Ingérer les alertes d'offres déposées dans emails/, lire et noter les offres avec la grille, puis présenter celles au-dessus du seuil.",
      en: 'Ingest the job alerts dropped into emails/, read and score the job ads with the grid, then present those above the threshold.',
    },
    fichier: 'procedures/traiter-emails.md',
    consigne: {
      fr: 'Traite maintenant les e-mails d’alertes en suivant cette procédure.',
      en: 'Now process the job alert e-mails following this procedure.',
    },
  },
  'preparer-go': {
    titre: { fr: 'Préparer les candidatures en « go »', en: 'Prepare the applications marked "go"' },
    description: {
      fr: 'Dossier de candidature, CV ciblé et messages pour chaque offre en « go » sans dossier, puis liste des envois à faire.',
      en: 'Application file, targeted CV and messages for each job ad marked "go" without a folder, then the list of submissions to make.',
    },
    fichier: 'procedures/preparer-go.md',
    consigne: {
      fr: 'Prépare maintenant mes candidatures en « go » en suivant cette procédure.',
      en: 'Now prepare my applications marked "go" following this procedure.',
    },
  },
  'cv-cible': {
    titre: { fr: 'CV ciblé', en: 'Targeted CV' },
    description: {
      fr: 'Écrire un CV ciblé pour une offre et le convertir en PDF de 2 pages avec le gabarit de l’espace.',
      en: "Write a CV targeted at a job ad and convert it into a 2-page PDF with the workspace's template.",
    },
    fichier: 'procedures/cv-cible.md',
    consigne: { fr: 'Écris le CV ciblé en suivant cette procédure.', en: 'Write the targeted CV following this procedure.' },
  },
};

const ACCES_SANS_FICHIERS: Bilingue = {
  fr:
    "Si tu n'as pas d'accès direct à mes fichiers ni de terminal, utilise les outils du serveur postuler-juste : lister_fichiers, " +
    'lire_fichier, ecrire_fichier (chemins relatifs à mon espace), generer_cv (avec capture pour voir le rendu) et compter, ' +
    'à la place de la lecture directe et des commandes.',
  en:
    "If you have no direct access to my files and no terminal, use the postuler-juste server's tools: lister_fichiers, " +
    'lire_fichier, ecrire_fichier (paths relative to my workspace), generer_cv (with capture to see the result) and compter, ' +
    'instead of reading files directly and running commands.',
};

/** Développe « ~ » et résout un dossier relatif depuis le dossier personnel (le dossier courant d'un client MCP est imprévisible). */
function dossierChoisi(d: string | undefined): string {
  if (!d?.trim()) return dossierParDefaut();
  const t = d.trim().replace(/^~(?=$|[\\/])/, homedir());
  return resolve(homedir(), t);
}

function lireConsigne(dossier: string, fichier: string): string {
  const chemin = join(dossier, fichier);
  if (!existsSync(chemin)) return bi({ fr: `(${fichier} est absent de l'espace ${oblique(dossier)}.)`, en: `(${fichier} is missing from the workspace ${oblique(dossier)}.)` });
  return readFileSync(chemin, 'utf8').replace(/^﻿/, '').trim();
}

export function enregistrerOutilsEspace(serveur: McpServer, etat: EtatMcp, donnees: () => string): void {
  const lecture = { readOnlyHint: true, openWorldHint: false };
  /** Dossier qu'une prochaine session retrouvera sans rien changer à la configuration du client. */
  const dossierDeDemarrage = resolve(etat.config.dossierDonnees);

  // ---------------------------------------------------------------------------------------------
  // Prompts et ressource : consignes de l'espace, relues sur le disque à chaque appel.

  for (const [nom, p] of Object.entries(PROMPTS)) {
    const argsSchema =
      nom === 'cv-cible'
        ? { offre: z.string().optional().describe(bi({ fr: 'Offre visée : numéro, entreprise ou intitulé', en: 'Target job ad: number, company or title' })) }
        : undefined;
    serveur.registerPrompt(
      nom,
      { title: bi(p.titre), description: bi(p.description), ...(argsSchema ? { argsSchema } : {}) },
      (args: { offre?: string }): GetPromptResult => {
        let texte: string;
        if (!etat.db) {
          const d = oblique(etat.config.dossierDonnees);
          texte =
            nom === 'demarrage'
              ? bi({
                  fr:
                    `Je veux démarrer postuler-juste, mais mon espace de travail n'existe pas encore (${messageNonInitialise(etat)}). ` +
                    `Propose-moi de le créer dans ${d}, ou dans le dossier que je choisis, et appelle initialiser_espace. ` +
                    "Ensuite, lis AGENTS.md puis DEMARRAGE.md de l'espace avec lire_fichier et suis le démarrage : vérifie d'abord de quels " +
                    'outils tu disposes, dis-moi de déposer mon CV dans a-deposer/, lis-le, puis pose-moi tes questions, quelques-unes à la fois.',
                  en:
                    `I want to get started with postuler-juste, but my workspace does not exist yet (${messageNonInitialise(etat)}). ` +
                    `Offer to create it in ${d}, or in the folder I choose, and call initialiser_espace. ` +
                    'Then read AGENTS.md and DEMARRAGE.md from the workspace with lire_fichier and follow the onboarding: first check which ' +
                    'tools you have, tell me to drop my CV into a-deposer/, read it, then ask me your questions, a few at a time. Talk to me in English.',
                })
              : bi({
                  fr: `Mon espace postuler-juste n'existe pas encore (${messageNonInitialise(etat)}). Commence par le prompt « demarrage ».`,
                  en: `My postuler-juste workspace does not exist yet (${messageNonInitialise(etat)}). Start with the "demarrage" prompt.`,
                });
        } else {
          const dossier = etat.config.dossierDonnees;
          const visee = args?.offre?.trim();
          const offre = visee ? `\n\n${bi({ fr: `Offre visée : ${visee}`, en: `Target job ad: ${visee}` })}` : '';
          texte =
            bi({
              fr: `Consignes de mon espace postuler-juste (${oblique(dossier)}), lues sur le disque. ${ACCES_SANS_FICHIERS.fr}\n\n`,
              en: `Instructions of my postuler-juste workspace (${oblique(dossier)}), read from disk. ${ACCES_SANS_FICHIERS.en}\n\n`,
            }) +
            `===== AGENTS.md (${bi({ fr: 'consignes générales', en: 'general instructions' })}) =====\n\n${lireConsigne(dossier, 'AGENTS.md')}\n\n` +
            `===== ${p.fichier} =====\n\n${lireConsigne(dossier, p.fichier)}\n\n` +
            `=====\n\n${bi(p.consigne)}${offre}`;
        }
        return { description: bi(p.titre), messages: [{ role: 'user', content: { type: 'text', text: texte } }] };
      },
    );
  }

  serveur.registerResource(
    'consignes',
    'postuler-juste://espace/AGENTS.md',
    {
      title: bi({ fr: "Consignes générales de l'espace (AGENTS.md)", en: "The workspace's general instructions (AGENTS.md)" }),
      description: bi({
        fr: "Règles de l'IA dans l'espace de l'utilisateur : honnêteté, procédures, outils. Lues sur le disque à chaque lecture.",
        en: "The AI's rules in the user's workspace: honesty, procedures, tools. Read from disk at each access.",
      }),
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: etat.db ? lireConsigne(etat.config.dossierDonnees, 'AGENTS.md') : messageNonInitialise(etat),
        },
      ],
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Espace

  serveur.registerTool(
    'etat_espace',
    {
      title: bi({ fr: "État de l'espace", en: 'Workspace status' }),
      description: bi({
        fr:
          "Où est l'espace de travail, s'il est initialisé, quel navigateur sert aux PDF, quel gabarit de CV est installé. À appeler en début " +
          'de session si on ne sait pas encore où en est l’utilisateur.',
        en:
          'Where the workspace is, whether it is initialised, which browser is used for PDFs, which CV template is installed. Call it at the start ' +
          'of a session if you do not yet know where the user stands.',
      }),
      inputSchema: {},
      annotations: lecture,
    },
    sur(() => {
      const dossier = etat.config.dossierDonnees;
      const initialise = Boolean(etat.db);
      return {
        dossier: oblique(dossier),
        initialise,
        dossier_par_defaut: etat.parDefaut,
        message: initialise ? null : messageNonInitialise(etat),
        demarrage_fait: initialise ? !/À COMPLÉTER|TO BE COMPLETED/.test(lireConsigne(dossier, '_CONTEXTE.md').split('\n')[0] ?? '') : false,
        navigateur_pdf: trouverNavigateur(),
        gabarit_cv: initialise && existsSync(join(dossier, 'cv', 'gabarit', 'gabarit.css')) ? 'cv/gabarit' : bi({ fr: 'gabarit livré par défaut (sobre)', en: 'default bundled template (sobre)' }),
        langue: etat.config.langue,
        prompts: Object.keys(PROMPTS),
      };
    }),
  );

  serveur.registerTool(
    'initialiser_espace',
    {
      title: bi({ fr: "Créer l'espace de travail", en: 'Create the workspace' }),
      description: bi({
        fr:
          "Crée l'espace de travail de l'utilisateur (consignes, contexte à remplir, a-deposer/, cv/, candidatures/, grille d'exemple, base) " +
          `dans un dossier neuf ou vide, puis s'y installe. Dossier par défaut : celui du serveur (${oblique(etat.config.dossierDonnees)}). ` +
          "Demander à l'utilisateur de confirmer le dossier avant l'appel. Ensuite : lui dire de déposer son CV et l'export PDF de son " +
          'profil LinkedIn dans a-deposer/, puis suivre le prompt « demarrage » (ou lire AGENTS.md et DEMARRAGE.md avec lire_fichier). ' +
          "Annoncer le déroulé exact : session 1 = lecture des documents, questions, contexte ; session 2 (nouvelle conversation) = grille, premier CV, alertes.",
        en:
          "Creates the user's workspace (instructions, context to fill in, a-deposer/ drop folder, cv/, candidatures/, sample grid, database) " +
          `in a new or empty folder, then switches to it. Default folder: the server's (${oblique(etat.config.dossierDonnees)}). ` +
          'Ask the user to confirm the folder before the call. Then: tell them to drop their CV and the PDF export of their ' +
          'LinkedIn profile into a-deposer/, then follow the "demarrage" prompt (or read AGENTS.md and DEMARRAGE.md with lire_fichier). ' +
          'Announce the exact sequence: session 1 = reading the documents, questions, context; session 2 (new conversation) = grid, first CV, alerts.',
      }),
      inputSchema: {
        dossier: z
          .string()
          .optional()
          .describe(
            bi({
              fr: 'Dossier à créer (absolu, ou relatif au dossier personnel ; « ~ » accepté). Défaut : le dossier du serveur',
              en: 'Folder to create (absolute, or relative to the home folder; "~" accepted). Default: the server\'s folder',
            }),
          ),
        gabarit: z
          .string()
          .optional()
          .describe(bi({ fr: 'Gabarit de CV : sobre (défaut), moderne, compact (voir lister_gabarits)', en: 'CV template: sobre (default), moderne, compact (see lister_gabarits)' })),
        langue: z
          .enum(LANGUES)
          .optional()
          .describe(
            bi({
              fr: `Langue de l'espace (consignes de l'IA, interface, suivi) : fr ou en. Défaut : ${etat.config.langue} (configuration du serveur)`,
              en: `Language of the workspace (AI instructions, dashboard, tracker): fr or en. Default: ${etat.config.langue} (server configuration)`,
            }),
          ),
      },
    },
    sur(({ dossier, gabarit, langue }: { dossier?: string; gabarit?: string; langue?: Langue }) => {
      const cible = dossier?.trim() ? dossierChoisi(dossier) : resolve(etat.config.dossierDonnees);
      const app = resolve(RACINE_APP);
      const versCible = relative(app, cible);
      if (!versCible || (!versCible.startsWith('..') && !isAbsolute(versCible))) {
        refuser(
          bi({
            fr: `${oblique(cible)} est dans le dossier de l'application : choisir un dossier à part (par exemple ${oblique(dossierParDefaut())})`,
            en: `${oblique(cible)} is inside the application's folder: choose a separate folder (for example ${oblique(dossierParDefaut())})`,
          }),
        );
      }
      if (espaceExiste(cible)) {
        const ouvert = etat.db && resolve(etat.config.dossierDonnees).toLowerCase() === cible.toLowerCase();
        refuser(
          ouvert
            ? bi({
                fr: `L'espace ${oblique(cible)} existe déjà et le serveur l'utilise : rien à créer. Suite : prompt « demarrage », ou lire_fichier DEMARRAGE.md.`,
                en: `The workspace ${oblique(cible)} already exists and the server is using it: nothing to create. Next: "demarrage" prompt, or lire_fichier DEMARRAGE.md.`,
              })
            : bi({
                fr: `Le dossier ${oblique(cible)} n'est pas vide : choisir un dossier neuf ou vide.`,
                en: `The folder ${oblique(cible)} is not empty: choose a new or empty folder.`,
              }),
        );
      }
      const r = initialiserEspace({ dossier: cible, gabarit, langue: langue ?? etat.config.langue });
      basculer(etat, cible);
      const persistant = cible.toLowerCase() === dossierDeDemarrage.toLowerCase();
      return {
        ok: true,
        dossier: r.dossier,
        navigateur_pdf: r.navigateur,
        avertissements: [
          ...r.avertissements,
          ...(persistant
            ? []
            : [
                bi({
                  fr:
                    `Ce dossier n'est pas celui que le serveur ouvrira au prochain lancement (${oblique(dossierDeDemarrage)}). ` +
                    `Pour les prochaines sessions, l'utilisateur doit l'indiquer à son client MCP. Extension Claude Desktop : ` +
                    `Paramètres > Extensions > postuler-juste > Configurer, champ « Dossier de l'espace ». Configuration écrite à la main : ` +
                    `"env": { "POSTULER_JUSTE_DATA": "${r.dossier}" } (claude_desktop_config.json, puis redémarrer).`,
                  en:
                    `This folder is not the one the server will open next time it starts (${oblique(dossierDeDemarrage)}). ` +
                    `For future sessions, the user must give it to their MCP client. Claude Desktop extension: ` +
                    `Settings > Extensions > postuler-juste > Configure, "Workspace folder" field. Hand-written configuration: ` +
                    `"env": { "POSTULER_JUSTE_DATA": "${r.dossier}" } (claude_desktop_config.json, then restart).`,
                }),
              ]),
        ],
        suite: [
          bi({
            fr:
              `Demander à l'utilisateur de déposer son CV (PDF, Word, texte) et l'export PDF de son profil LinkedIn dans ${r.dossier}/a-deposer/ ` +
              "(avec l'explorateur de fichiers), puis de le dire.",
            en:
              `Ask the user to drop their CV (PDF, Word, text) and the PDF export of their LinkedIn profile into ${r.dossier}/a-deposer/ ` +
              '(with their file explorer), then to say so.',
          }),
          bi({
            fr: 'Lire AGENTS.md puis DEMARRAGE.md (lire_fichier) et suivre le démarrage ; ou proposer à l’utilisateur le prompt « demarrage ».',
            en: 'Read AGENTS.md then DEMARRAGE.md (lire_fichier) and follow the onboarding; or suggest the "demarrage" prompt to the user.',
          }),
        ],
      };
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Fichiers de l'espace

  serveur.registerTool(
    'lister_fichiers',
    {
      title: bi({ fr: "Lister les fichiers de l'espace", en: 'List the workspace files' }),
      description: bi({
        fr:
          "Contenu d'un dossier de l'espace de travail (chemin relatif : « . », « a-deposer », « cv », « candidatures/x ») : fichiers (taille, " +
          'date) et sous-dossiers, sur 1 à 4 niveaux. Les fichiers cachés et data/ (la base) ne sont pas listés.',
        en:
          'Contents of a workspace folder (relative path: ".", "a-deposer", "cv", "candidatures/x"): files (size, ' +
          'date) and subfolders, over 1 to 4 levels. Hidden files and data/ (the database) are not listed.',
      }),
      inputSchema: {
        dossier: z.string().optional().describe(bi({ fr: 'Dossier relatif à l’espace (racine par défaut)', en: 'Folder relative to the workspace (root by default)' })),
        profondeur: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe(bi({ fr: 'Niveaux parcourus (1 par défaut : le dossier seul)', en: 'Levels explored (1 by default: the folder only)' })),
      },
      annotations: lecture,
    },
    sur(({ dossier, profondeur }) => listerEspace(donnees(), dossier ?? '.', profondeur ?? 1)),
  );

  serveur.registerTool(
    'lire_fichier',
    {
      title: bi({ fr: "Lire un fichier de l'espace", en: 'Read a workspace file' }),
      description: bi({
        fr:
          "Lit un fichier de l'espace de travail (chemin relatif). Texte (.md, .txt, .json, .csv…) : le contenu tel quel. PDF : le texte extrait, " +
          'page par page. Word (.docx) : le texte. Image (.png, .jpg, .webp, .gif) : l’image elle-même. Autre format : demander à ' +
          "l'utilisateur un export PDF ou texte. data/ (la base) et les fichiers cachés sont inaccessibles.",
        en:
          'Reads a workspace file (relative path). Text (.md, .txt, .json, .csv…): the content as it is. PDF: the extracted text, ' +
          'page by page. Word (.docx): the text. Image (.png, .jpg, .webp, .gif): the image itself. Any other format: ask ' +
          'the user for a PDF or text export. data/ (the database) and hidden files cannot be accessed.',
      }),
      inputSchema: {
        chemin: z.string().min(1).describe(bi({ fr: 'Chemin relatif à l’espace : « _CONTEXTE.md », « a-deposer/CV.pdf »', en: 'Path relative to the workspace: "_CONTEXTE.md", "a-deposer/CV.pdf"' })),
        debut: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            bi({
              fr: `Fichier texte long : position (en caractères) d'où reprendre la lecture ; un morceau fait ${MORCEAU_TEXTE} caractères au plus`,
              en: `Long text file: position (in characters) from which to resume reading; a chunk is ${MORCEAU_TEXTE} characters at most`,
            }),
          ),
      },
      annotations: lecture,
    },
    surContenu(async ({ chemin, debut }): Promise<CallToolResult> => {
      const l = lireEspace(donnees(), chemin);
      /** Texte entier, ou le morceau demandé s'il est long. */
      const morceau = (texte: string): CallToolResult => {
        const d = debut ?? 0;
        if (d === 0 && texte.length <= MORCEAU_TEXTE) return { content: [{ type: 'text', text: texte }] };
        const fin = Math.min(texte.length, d + MORCEAU_TEXTE);
        const suite =
          fin < texte.length
            ? bi({ fr: `suite : lire_fichier avec debut: ${fin}`, en: `next: lire_fichier with debut: ${fin}` })
            : bi({ fr: 'fin du fichier', en: 'end of file' });
        const entete = bi({
          fr: `[${l.chemin} : caractères ${d} à ${fin} sur ${texte.length} ; ${suite}]`,
          en: `[${l.chemin}: characters ${d} to ${fin} of ${texte.length}; ${suite}]`,
        });
        return { content: [{ type: 'text', text: `${entete}\n\n${texte.slice(d, fin)}` }] };
      };
      if (l.genre === 'texte') return morceau(l.texte);
      if (l.extension === '.pdf') {
        const { pages, texte, liens } = await textePdf(l.donnees);
        if (texte.join('').trim().length > 20) {
          const titreLiens = bi({ fr: 'Liens de la page', en: 'Links on the page' });
          const corps = texte
            .map((t, i) => `----- page ${i + 1} / ${pages} -----\n${t}${liens[i]?.length ? `\n\n${titreLiens} : ${liens[i].join(' · ')}` : ''}`)
            .join('\n\n');
          return morceau(bi({ fr: `${l.chemin} (PDF, ${pages} page(s), texte extrait) :\n\n${corps}`, en: `${l.chemin} (PDF, ${pages} page(s), extracted text):\n\n${corps}` }));
        }
        return {
          content: [
            {
              type: 'text',
              text: bi({
                fr:
                  `${l.chemin} : PDF de ${pages} page(s) sans couche texte (document scanné ou image). Le PDF est joint ci-dessous ; si tu ne ` +
                  "peux pas le lire, demande à l'utilisateur de le glisser directement dans la conversation, ou d'en coller le texte.",
                en:
                  `${l.chemin}: PDF of ${pages} page(s) with no text layer (scanned document or image). The PDF is attached below; if you cannot ` +
                  'read it, ask the user to drag it straight into the conversation, or to paste its text.',
              }),
            },
            { type: 'resource', resource: { uri: `file:///${oblique(cheminDansEspace(donnees(), l.chemin).absolu).replace(/^\/+/, '')}`, mimeType: 'application/pdf', blob: l.donnees.toString('base64') } },
          ],
        };
      }
      const typeImage = TYPES_IMAGE[l.extension];
      if (typeImage) {
        if (l.taille > IMAGE_MAX) refuser(
            bi({
              fr: `Image trop lourde (${Math.round(l.taille / 1024)} Ko) : demander à l'utilisateur de la glisser dans la conversation`,
              en: `Image too large (${Math.round(l.taille / 1024)} KB): ask the user to drag it into the conversation`,
            }),
          );
        return {
          content: [
            { type: 'text', text: bi({ fr: `${l.chemin} (image, ${Math.round(l.taille / 1024)} Ko) :`, en: `${l.chemin} (image, ${Math.round(l.taille / 1024)} KB):` }) },
            { type: 'image', data: l.donnees.toString('base64'), mimeType: typeImage },
          ],
        };
      }
      if (l.extension === '.docx') {
        const texte = texteDocx(l.donnees);
        if (texte) return morceau(bi({ fr: `${l.chemin} (Word, texte extrait) :\n\n${texte}`, en: `${l.chemin} (Word, extracted text):\n\n${texte}` }));
      }
      refuser(
        bi({
          fr: `Format non lu : ${l.chemin} (${l.extension || 'sans extension'}). Demander à l'utilisateur un export PDF ou texte.`,
          en: `Format not read: ${l.chemin} (${l.extension || 'no extension'}). Ask the user for a PDF or text export.`,
        }),
      );
    }),
  );

  serveur.registerTool(
    'ecrire_fichier',
    {
      title: bi({ fr: "Écrire un fichier de l'espace", en: 'Write a workspace file' }),
      description: bi({
        fr:
          `Crée ou remplace un fichier texte de l'espace (extensions : ${EXTENSIONS_ECRITURE.join(', ')}) ; les dossiers parents sont créés. ` +
          'Renvoie existait: true si un fichier a été remplacé (le dire à l’utilisateur s’il ne s’y attendait pas). creer_seulement: true ' +
          'refuse de remplacer : à utiliser pour un document qui a pu être envoyé (nouvelle version : suffixe « V2 »). Toujours écrire le ' +
          'fichier en entier. Interdit : data/, fichiers cachés, chemins hors de l’espace.',
        en:
          `Creates or replaces a text file in the workspace (extensions: ${EXTENSIONS_ECRITURE.join(', ')}); parent folders are created. ` +
          'Returns existait: true if a file was replaced (tell the user if they did not expect it). creer_seulement: true ' +
          'refuses to replace: use it for a document that may have been sent (new version: suffix "V2"). Always write the ' +
          'whole file. Not allowed: data/, hidden files, paths outside the workspace.',
      }),
      inputSchema: {
        chemin: z
          .string()
          .min(1)
          .describe(bi({ fr: 'Chemin relatif à l’espace : « _CONTEXTE.md », « cv/Prenom_NOM_CV-Titre.md »', en: 'Path relative to the workspace: "_CONTEXTE.md", "cv/FirstName_LASTNAME_CV-Title.md"' })),
        contenu: z.string().describe(bi({ fr: 'Contenu complet du fichier (UTF-8)', en: 'Full content of the file (UTF-8)' })),
        creer_seulement: z.boolean().optional().describe(bi({ fr: 'true : erreur si le fichier existe déjà', en: 'true: error if the file already exists' })),
      },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    sur(({ chemin, contenu, creer_seulement }) => ({ ok: true, ...ecrireEspace(donnees(), chemin, contenu, { creerSeulement: creer_seulement }) })),
  );

  serveur.registerTool(
    'deplacer_fichier',
    {
      title: bi({ fr: "Déplacer ou renommer un fichier de l'espace", en: 'Move or rename a workspace file' }),
      description: bi({
        fr:
          "Déplace ou renomme un fichier dans l'espace (par exemple un document déposé vers un dossier de candidature). La destination ne " +
          'doit pas exister : rien n’est écrasé. Aucune suppression possible par ces outils.',
        en:
          'Moves or renames a file within the workspace (for example a dropped document into an application folder). The destination ' +
          'must not exist: nothing is overwritten. No deletion is possible with these tools.',
      }),
      inputSchema: {
        source: z.string().min(1).describe(bi({ fr: 'Chemin relatif du fichier', en: 'Relative path of the file' })),
        destination: z.string().min(1).describe(bi({ fr: 'Nouveau chemin relatif', en: 'New relative path' })),
      },
    },
    sur(({ source, destination }) => ({ ok: true, ...deplacerEspace(donnees(), source, destination) })),
  );

  // ---------------------------------------------------------------------------------------------
  // CV et texte

  /** Lien cliquable vers un fichier local (file:///D:/… sous Windows, file:///home/… ailleurs), espaces et accents encodés. */
  const lienFichier = (absolu: string) => pathToFileURL(absolu).href;

  serveur.registerTool(
    'generer_cv',
    {
      title: bi({ fr: 'Générer le PDF d’un CV', en: 'Generate a CV PDF' }),
      description: bi({
        fr:
          'Convertit un CV Markdown de l’espace (« cv/<nom>.md ») en PDF A4 écrit à côté, avec le gabarit de l’espace (cv/gabarit). Renvoie ' +
          'le nombre de pages (cible : 2 ; au-delà, couper du texte, pas la police), le remplissage de chaque page mesuré sur le PDF ' +
          '(remplissage, en % de la hauteur utile) avec ses avertissements (saut de page mal placé, dernière page trop vide) à corriger ' +
          'avant de présenter le CV, et pdf_existait (un PDF déjà envoyé ne s’écrase pas : nouveau nom avec « V2 »). capture: true joint ' +
          "l'image des vraies pages du PDF, l'une sous l'autre : la regarder.",
        en:
          'Converts a Markdown CV in the workspace ("cv/<name>.md") into an A4 PDF written next to it, with the workspace\'s template (cv/gabarit). Returns ' +
          'the page count (target: 2; beyond that, cut text, not the font size), how full each page is, measured on the PDF ' +
          '(remplissage, as a % of the usable height) with its warnings (badly placed page break, last page too empty) to fix ' +
          'before presenting the CV, and pdf_existait (a PDF already sent is not overwritten: new name with "V2"). capture: true attaches ' +
          'the image of the actual pages of the PDF, one below the other: look at it.',
      }),
      inputSchema: {
        chemin: z.string().min(1).describe(bi({ fr: 'CV Markdown, relatif à l’espace', en: 'Markdown CV, relative to the workspace' })),
        capture: z.boolean().optional().describe(bi({ fr: 'true : joindre l’image PNG des pages du PDF', en: "true: attach the PNG image of the PDF's pages" })),
      },
    },
    surContenu(async ({ chemin, capture }): Promise<CallToolResult> => {
      const espace = donnees();
      const c = cheminDansEspace(espace, chemin);
      if (extname(c.absolu).toLowerCase() !== '.md') refuser(bi({ fr: `CV Markdown attendu (.md) : ${c.relatif}`, en: `Markdown CV expected (.md): ${c.relatif}` }));
      if (!c.existe) refuser(bi({ fr: `CV introuvable : ${c.relatif}`, en: `CV not found: ${c.relatif}` }));
      const navigateur = trouverNavigateur();
      if (!navigateur) {
        refuser(
          bi({
            fr: 'Aucun Chrome, Edge ou Chromium trouvé : installer Chrome ou Edge, ou indiquer son chemin dans POSTULER_JUSTE_NAVIGATEUR',
            en: 'No Chrome, Edge or Chromium found: install Chrome or Edge, or give its path in POSTULER_JUSTE_NAVIGATEUR',
          }),
        );
      }
      const local = join(espace, 'cv', 'gabarit');
      const gabarit = existsSync(join(local, 'gabarit.css')) ? local : GABARIT_DEFAUT;
      const pdfAvant = c.absolu.replace(/\.md$/i, '.pdf');
      const pdfExistait = existsSync(pdfAvant);
      const r = genererCv(c.absolu, gabarit, navigateur, { capture: Boolean(capture) });
      const rel = (p: string) => oblique(relative(espace, p));
      const mise = await analyserPages(readFileSync(r.pdf)).catch((e: Error) => ({
        pages: [],
        avertissements: [bi({ fr: `Remplissage des pages non mesuré (${e.message}) : vérifier sur la capture.`, en: `Page fill not measured (${e.message}): check on the capture.` })],
      }));
      const infos = {
        ok: true,
        pdf: rel(r.pdf),
        pages: r.pages,
        depasse_2_pages: r.pages > 2,
        remplissage: mise.pages.map((p) => bi({ fr: `page ${p.page} : ${p.remplissage} %`, en: `page ${p.page}: ${p.remplissage}%` })),
        avertissements: [
          ...(r.pages > 2
            ? [
                bi({
                  fr: `${r.pages} pages : couper du texte pour tenir en 2 (pas réduire la police).`,
                  en: `${r.pages} pages: cut text to fit on 2 (do not shrink the font).`,
                }),
              ]
            : []),
          ...mise.avertissements,
        ],
        pdf_existait: pdfExistait,
        gabarit: gabarit === local ? 'cv/gabarit' : bi({ fr: 'gabarit livré (sobre)', en: 'bundled template (sobre)' }),
        capture: r.capture ? rel(r.capture) : null,
        liens: { pdf: lienFichier(r.pdf), markdown: lienFichier(c.absolu) },
        a_dire: bi({
          fr: `Donner à l'utilisateur les deux liens cliquables : [PDF](${lienFichier(r.pdf)}) · [Markdown](${lienFichier(c.absolu)})`,
          en: `Give the user both clickable links: [PDF](${lienFichier(r.pdf)}) · [Markdown](${lienFichier(c.absolu)})`,
        }),
      };
      const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(infos, null, 2) }];
      if (r.capture) content.push({ type: 'image', data: readFileSync(r.capture).toString('base64'), mimeType: 'image/png' });
      return { content };
    }),
  );

  serveur.registerTool(
    'compter',
    {
      title: bi({ fr: 'Compter les caractères', en: 'Count characters' }),
      description: bi({
        fr:
          "Nombre de caractères et de mots de chaque message à copier-coller (blocs encadrés « ──── début … ──── » / « ──── fin … ──── ») " +
          "d'un texte ou d'un fichier de l'espace, sinon du texte entier. À utiliser pour respecter la limite d'un formulaire (la vraie valeur, pas une estimation).",
        en:
          'Number of characters and words of each copy-and-paste message (blocks framed by "──── start … ────" / "──── end … ────") ' +
          'in a text or a workspace file, otherwise of the whole text. Use it to stay within a form\'s limit (the real figure, not an estimate).',
      }),
      inputSchema: {
        texte: z.string().optional().describe(bi({ fr: 'Texte à mesurer', en: 'Text to measure' })),
        chemin: z.string().optional().describe(bi({ fr: 'Ou fichier de l’espace (dossier-candidature.md…)', en: 'Or a workspace file (dossier-candidature.md…)' })),
      },
      annotations: lecture,
    },
    sur(({ texte, chemin }) => {
      if (texte === undefined && !chemin) refuser(bi({ fr: 'texte ou chemin attendu', en: 'texte or chemin expected' }));
      if (texte !== undefined) return { ok: true, blocs: compterTexte(texte) };
      const l = lireEspace(donnees(), chemin!);
      if (l.genre !== 'texte') refuser(bi({ fr: `Fichier texte attendu : ${l.chemin}`, en: `Text file expected: ${l.chemin}` }));
      return { ok: true, fichier: l.chemin, blocs: compterTexte(l.texte) };
    }),
  );

  serveur.registerTool(
    'lister_gabarits',
    {
      title: bi({ fr: 'Gabarits de CV', en: 'CV templates' }),
      description: bi({
        fr: 'Gabarits de CV livrés (nom et description) ; celui de l’espace est dans cv/gabarit. choisir_gabarit en installe un.',
        en: "Bundled CV templates (name and description); the workspace's one is in cv/gabarit. choisir_gabarit installs one.",
      }),
      inputSchema: {},
      annotations: lecture,
    },
    sur(() => ({ gabarits: listerGabarits() })),
  );

  serveur.registerTool(
    'choisir_gabarit',
    {
      title: bi({ fr: 'Choisir le gabarit de CV', en: 'Choose the CV template' }),
      description: bi({
        fr:
          "Installe un gabarit livré dans cv/gabarit (commun à tous les CV de l'utilisateur ; l'ancien est gardé dans cv/gabarit-<date>/, la " +
          "photo est reprise). À faire à la demande de l'utilisateur, puis régénérer le CV (generer_cv avec capture) pour lui montrer le rendu.",
        en:
          "Installs a bundled template in cv/gabarit (shared by all the user's CVs; the old one is kept in cv/gabarit-<date>/, the " +
          'photo is carried over). Only at the user\'s request, then regenerate the CV (generer_cv with capture) to show them the result.',
      }),
      inputSchema: { nom: z.string().min(1).describe(bi({ fr: 'Nom du gabarit : sobre, moderne, compact…', en: 'Template name: sobre, moderne, compact…' })) },
    },
    sur(({ nom }) => {
      const espace = donnees();
      const r = choisirGabarit(espace, nom);
      return { ok: true, dossier: oblique(relative(espace, r.dossier)), ancien: r.ancien ? oblique(relative(espace, r.ancien)) : null };
    }),
  );

}
