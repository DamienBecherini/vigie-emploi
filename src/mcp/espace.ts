// Outils, prompts et ressource du serveur MCP pour un client sans accès aux fichiers ni au terminal (Claude Desktop…) :
// création de l'espace, consignes de l'espace en prompts, fichiers confinés au dossier de données, CV en PDF, comptage.
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

const oblique = (p: string) => p.replace(/\\/g, '/');

/** Image transmise à l'IA : au-delà, la plupart des clients la refusent. */
const IMAGE_MAX = 5 * 1024 * 1024;

/** Fichier texte lu par morceaux au-delà de cette taille (réponse lisible en entier par l'IA). */
const MORCEAU_TEXTE = 24_000;

/** Consignes de l'espace exposées en prompts : nom → fichiers lus sur le disque à chaque appel. */
const PROMPTS = {
  demarrage: {
    titre: 'Démarrage guidé',
    description:
      "Premier entretien (ou reprise) : lire ce que l'utilisateur a déposé, poser les questions, remplir _CONTEXTE.md, adapter la grille, " +
      "écrire un premier CV. Consignes lues dans l'espace (AGENTS.md puis DEMARRAGE.md). Crée l'espace s'il n'existe pas encore.",
    fichier: 'DEMARRAGE.md',
    consigne:
      "Suis le démarrage : vérifie d'abord de quels outils tu disposes, lis ce que j'ai déposé dans a-deposer/, " +
      'puis pose-moi tes questions, quelques-unes à la fois.',
  },
  'traiter-emails': {
    titre: 'Traiter les e-mails d’alertes',
    description: "Ingérer les alertes d'offres déposées dans emails/, lire et noter les offres avec la grille, puis présenter celles au-dessus du seuil.",
    fichier: 'procedures/traiter-emails.md',
    consigne: 'Traite maintenant les e-mails d’alertes en suivant cette procédure.',
  },
  'preparer-go': {
    titre: 'Préparer les candidatures en « go »',
    description: 'Dossier de candidature, CV ciblé et messages pour chaque offre en « go » sans dossier, puis liste des envois à faire.',
    fichier: 'procedures/preparer-go.md',
    consigne: 'Prépare maintenant mes candidatures en « go » en suivant cette procédure.',
  },
  'cv-cible': {
    titre: 'CV ciblé',
    description: 'Écrire un CV ciblé pour une offre et le convertir en PDF de 2 pages avec le gabarit de l’espace.',
    fichier: 'procedures/cv-cible.md',
    consigne: 'Écris le CV ciblé en suivant cette procédure.',
  },
} as const;

const ACCES_SANS_FICHIERS =
  "Si tu n'as pas d'accès direct à mes fichiers ni de terminal, utilise les outils du serveur postuler-juste : lister_fichiers, " +
  'lire_fichier, ecrire_fichier (chemins relatifs à mon espace), generer_cv (avec capture pour voir le rendu) et compter, ' +
  'à la place de la lecture directe et des commandes.';

/** Développe « ~ » et résout un dossier relatif depuis le dossier personnel (le dossier courant d'un client MCP est imprévisible). */
function dossierChoisi(d: string | undefined): string {
  if (!d?.trim()) return dossierParDefaut();
  const t = d.trim().replace(/^~(?=$|[\\/])/, homedir());
  return resolve(homedir(), t);
}

function lireConsigne(dossier: string, fichier: string): string {
  const chemin = join(dossier, fichier);
  if (!existsSync(chemin)) return `(${fichier} est absent de l'espace ${oblique(dossier)}.)`;
  return readFileSync(chemin, 'utf8').replace(/^﻿/, '').trim();
}

export function enregistrerOutilsEspace(serveur: McpServer, etat: EtatMcp, donnees: () => string): void {
  const lecture = { readOnlyHint: true, openWorldHint: false };
  /** Dossier qu'une prochaine session retrouvera sans rien changer à la configuration du client. */
  const dossierDeDemarrage = resolve(etat.config.dossierDonnees);

  // ---------------------------------------------------------------------------------------------
  // Prompts et ressource : consignes de l'espace, relues sur le disque à chaque appel.

  for (const [nom, p] of Object.entries(PROMPTS)) {
    const argsSchema = nom === 'cv-cible' ? { offre: z.string().optional().describe("Offre visée : numéro, entreprise ou intitulé") } : undefined;
    serveur.registerPrompt(
      nom,
      { title: p.titre, description: p.description, ...(argsSchema ? { argsSchema } : {}) },
      (args: { offre?: string }): GetPromptResult => {
        let texte: string;
        if (!etat.db) {
          const d = oblique(etat.config.dossierDonnees);
          texte =
            nom === 'demarrage'
              ? `Je veux démarrer postuler-juste, mais mon espace de travail n'existe pas encore (${messageNonInitialise(etat)}). ` +
                `Propose-moi de le créer dans ${d}, ou dans le dossier que je choisis, et appelle initialiser_espace. ` +
                "Ensuite, lis AGENTS.md puis DEMARRAGE.md de l'espace avec lire_fichier et suis le démarrage : vérifie d'abord de quels " +
                'outils tu disposes, dis-moi de déposer mon CV dans a-deposer/, lis-le, puis pose-moi tes questions, quelques-unes à la fois.'
              : `Mon espace postuler-juste n'existe pas encore (${messageNonInitialise(etat)}). Commence par le prompt « demarrage ».`;
        } else {
          const dossier = etat.config.dossierDonnees;
          const offre = args?.offre?.trim() ? `\n\nOffre visée : ${args.offre.trim()}` : '';
          texte =
            `Consignes de mon espace postuler-juste (${oblique(dossier)}), lues sur le disque. ${ACCES_SANS_FICHIERS}\n\n` +
            `===== AGENTS.md (consignes générales) =====\n\n${lireConsigne(dossier, 'AGENTS.md')}\n\n` +
            `===== ${p.fichier} =====\n\n${lireConsigne(dossier, p.fichier)}\n\n` +
            `=====\n\n${p.consigne}${offre}`;
        }
        return { description: p.titre, messages: [{ role: 'user', content: { type: 'text', text: texte } }] };
      },
    );
  }

  serveur.registerResource(
    'consignes',
    'postuler-juste://espace/AGENTS.md',
    {
      title: "Consignes générales de l'espace (AGENTS.md)",
      description: "Règles de l'IA dans l'espace de l'utilisateur : honnêteté, procédures, outils. Lues sur le disque à chaque lecture.",
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
      title: "État de l'espace",
      description:
        "Où est l'espace de travail, s'il est initialisé, quel navigateur sert aux PDF, quel gabarit de CV est installé. À appeler en début " +
        'de session si on ne sait pas encore où en est l’utilisateur.',
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
        demarrage_fait: initialise ? !/À COMPLÉTER/.test(lireConsigne(dossier, '_CONTEXTE.md').split('\n')[0] ?? '') : false,
        navigateur_pdf: trouverNavigateur(),
        gabarit_cv: initialise && existsSync(join(dossier, 'cv', 'gabarit', 'gabarit.css')) ? 'cv/gabarit' : 'gabarit livré par défaut (sobre)',
        prompts: Object.keys(PROMPTS),
      };
    }),
  );

  serveur.registerTool(
    'initialiser_espace',
    {
      title: "Créer l'espace de travail",
      description:
        "Crée l'espace de travail de l'utilisateur (consignes, contexte à remplir, a-deposer/, cv/, candidatures/, grille d'exemple, base) " +
        `dans un dossier neuf ou vide, puis s'y installe. Dossier par défaut : celui du serveur (${oblique(etat.config.dossierDonnees)}). ` +
        "Demander à l'utilisateur de confirmer le dossier avant l'appel. Ensuite : lui dire de déposer son CV et l'export PDF de son " +
        'profil LinkedIn dans a-deposer/, puis suivre le prompt « demarrage » (ou lire AGENTS.md et DEMARRAGE.md avec lire_fichier).',
      inputSchema: {
        dossier: z
          .string()
          .optional()
          .describe('Dossier à créer (absolu, ou relatif au dossier personnel ; « ~ » accepté). Défaut : le dossier du serveur'),
        gabarit: z.string().optional().describe('Gabarit de CV : sobre (défaut), moderne, compact (voir lister_gabarits)'),
      },
    },
    sur(({ dossier, gabarit }) => {
      const cible = dossier?.trim() ? dossierChoisi(dossier) : resolve(etat.config.dossierDonnees);
      const app = resolve(RACINE_APP);
      const versCible = relative(app, cible);
      if (!versCible || (!versCible.startsWith('..') && !isAbsolute(versCible))) {
        refuser(`${oblique(cible)} est dans le dossier de l'application : choisir un dossier à part (par exemple ${oblique(dossierParDefaut())})`);
      }
      if (espaceExiste(cible)) {
        const ouvert = etat.db && resolve(etat.config.dossierDonnees).toLowerCase() === cible.toLowerCase();
        refuser(
          ouvert
            ? `L'espace ${oblique(cible)} existe déjà et le serveur l'utilise : rien à créer. Suite : prompt « demarrage », ou lire_fichier DEMARRAGE.md.`
            : `Le dossier ${oblique(cible)} n'est pas vide : choisir un dossier neuf ou vide.`,
        );
      }
      const r = initialiserEspace({ dossier: cible, gabarit });
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
                `Ce dossier n'est pas celui que le serveur ouvrira au prochain lancement (${oblique(dossierDeDemarrage)}). ` +
                  `Pour les prochaines sessions, l'utilisateur doit l'indiquer dans la configuration de son client MCP : ` +
                  `"env": { "POSTULER_JUSTE_DATA": "${r.dossier}" } (Claude Desktop : claude_desktop_config.json, puis redémarrer).`,
              ]),
        ],
        suite: [
          `Demander à l'utilisateur de déposer son CV (PDF, Word, texte) et l'export PDF de son profil LinkedIn dans ${r.dossier}/a-deposer/ ` +
            "(avec l'explorateur de fichiers), puis de le dire.",
          'Lire AGENTS.md puis DEMARRAGE.md (lire_fichier) et suivre le démarrage ; ou proposer à l’utilisateur le prompt « demarrage ».',
        ],
      };
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Fichiers de l'espace

  serveur.registerTool(
    'lister_fichiers',
    {
      title: "Lister les fichiers de l'espace",
      description:
        "Contenu d'un dossier de l'espace de travail (chemin relatif : « . », « a-deposer », « cv », « candidatures/x ») : fichiers (taille, " +
        'date) et sous-dossiers, sur 1 à 4 niveaux. Les fichiers cachés et data/ (la base) ne sont pas listés.',
      inputSchema: {
        dossier: z.string().optional().describe('Dossier relatif à l’espace (racine par défaut)'),
        profondeur: z.number().int().min(1).max(4).optional().describe('Niveaux parcourus (1 par défaut : le dossier seul)'),
      },
      annotations: lecture,
    },
    sur(({ dossier, profondeur }) => listerEspace(donnees(), dossier ?? '.', profondeur ?? 1)),
  );

  serveur.registerTool(
    'lire_fichier',
    {
      title: "Lire un fichier de l'espace",
      description:
        "Lit un fichier de l'espace de travail (chemin relatif). Texte (.md, .txt, .json, .csv…) : le contenu tel quel. PDF : le texte extrait, " +
        'page par page. Word (.docx) : le texte. Image (.png, .jpg, .webp, .gif) : l’image elle-même. Autre format : demander à ' +
        "l'utilisateur un export PDF ou texte. data/ (la base) et les fichiers cachés sont inaccessibles.",
      inputSchema: {
        chemin: z.string().min(1).describe('Chemin relatif à l’espace : « _CONTEXTE.md », « a-deposer/CV.pdf »'),
        debut: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(`Fichier texte long : position (en caractères) d'où reprendre la lecture ; un morceau fait ${MORCEAU_TEXTE} caractères au plus`),
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
        const suite = fin < texte.length ? `suite : lire_fichier avec debut: ${fin}` : 'fin du fichier';
        return { content: [{ type: 'text', text: `[${l.chemin} : caractères ${d} à ${fin} sur ${texte.length} ; ${suite}]\n\n${texte.slice(d, fin)}` }] };
      };
      if (l.genre === 'texte') return morceau(l.texte);
      if (l.extension === '.pdf') {
        const { pages, texte } = await textePdf(l.donnees);
        if (texte.join('').trim().length > 20) {
          const corps = texte.map((t, i) => `----- page ${i + 1} / ${pages} -----\n${t}`).join('\n\n');
          return morceau(`${l.chemin} (PDF, ${pages} page(s), texte extrait) :\n\n${corps}`);
        }
        return {
          content: [
            {
              type: 'text',
              text:
                `${l.chemin} : PDF de ${pages} page(s) sans couche texte (document scanné ou image). Le PDF est joint ci-dessous ; si tu ne ` +
                "peux pas le lire, demande à l'utilisateur de le glisser directement dans la conversation, ou d'en coller le texte.",
            },
            { type: 'resource', resource: { uri: `file:///${oblique(cheminDansEspace(donnees(), l.chemin).absolu).replace(/^\/+/, '')}`, mimeType: 'application/pdf', blob: l.donnees.toString('base64') } },
          ],
        };
      }
      const typeImage = TYPES_IMAGE[l.extension];
      if (typeImage) {
        if (l.taille > IMAGE_MAX) refuser(`Image trop lourde (${Math.round(l.taille / 1024)} Ko) : demander à l'utilisateur de la glisser dans la conversation`);
        return {
          content: [
            { type: 'text', text: `${l.chemin} (image, ${Math.round(l.taille / 1024)} Ko) :` },
            { type: 'image', data: l.donnees.toString('base64'), mimeType: typeImage },
          ],
        };
      }
      if (l.extension === '.docx') {
        const texte = texteDocx(l.donnees);
        if (texte) return morceau(`${l.chemin} (Word, texte extrait) :\n\n${texte}`);
      }
      refuser(`Format non lu : ${l.chemin} (${l.extension || 'sans extension'}). Demander à l'utilisateur un export PDF ou texte.`);
    }),
  );

  serveur.registerTool(
    'ecrire_fichier',
    {
      title: "Écrire un fichier de l'espace",
      description:
        `Crée ou remplace un fichier texte de l'espace (extensions : ${EXTENSIONS_ECRITURE.join(', ')}) ; les dossiers parents sont créés. ` +
        'Renvoie existait: true si un fichier a été remplacé (le dire à l’utilisateur s’il ne s’y attendait pas). creer_seulement: true ' +
        'refuse de remplacer : à utiliser pour un document qui a pu être envoyé (nouvelle version : suffixe « V2 »). Toujours écrire le ' +
        'fichier en entier. Interdit : data/, fichiers cachés, chemins hors de l’espace.',
      inputSchema: {
        chemin: z.string().min(1).describe('Chemin relatif à l’espace : « _CONTEXTE.md », « cv/Prenom_NOM_CV-Titre.md »'),
        contenu: z.string().describe('Contenu complet du fichier (UTF-8)'),
        creer_seulement: z.boolean().optional().describe('true : erreur si le fichier existe déjà'),
      },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    sur(({ chemin, contenu, creer_seulement }) => ({ ok: true, ...ecrireEspace(donnees(), chemin, contenu, { creerSeulement: creer_seulement }) })),
  );

  serveur.registerTool(
    'deplacer_fichier',
    {
      title: "Déplacer ou renommer un fichier de l'espace",
      description:
        "Déplace ou renomme un fichier dans l'espace (par exemple un document déposé vers un dossier de candidature). La destination ne " +
        'doit pas exister : rien n’est écrasé. Aucune suppression possible par ces outils.',
      inputSchema: {
        source: z.string().min(1).describe('Chemin relatif du fichier'),
        destination: z.string().min(1).describe('Nouveau chemin relatif'),
      },
    },
    sur(({ source, destination }) => ({ ok: true, ...deplacerEspace(donnees(), source, destination) })),
  );

  // ---------------------------------------------------------------------------------------------
  // CV et texte

  serveur.registerTool(
    'generer_cv',
    {
      title: 'Générer le PDF d’un CV',
      description:
        'Convertit un CV Markdown de l’espace (« cv/<nom>.md ») en PDF A4 écrit à côté, avec le gabarit de l’espace (cv/gabarit). Renvoie ' +
        'le nombre de pages (cible : 2 ; au-delà, couper du texte, pas la police), le remplissage de chaque page mesuré sur le PDF ' +
        '(remplissage, en % de la hauteur utile) avec ses avertissements (saut de page mal placé, dernière page trop vide) à corriger ' +
        'avant de présenter le CV, et pdf_existait (un PDF déjà envoyé ne s’écrase pas : nouveau nom avec « V2 »). capture: true joint ' +
        "l'image des vraies pages du PDF, l'une sous l'autre : la regarder.",
      inputSchema: {
        chemin: z.string().min(1).describe('CV Markdown, relatif à l’espace'),
        capture: z.boolean().optional().describe('true : joindre l’image PNG des pages du PDF'),
      },
    },
    surContenu(async ({ chemin, capture }): Promise<CallToolResult> => {
      const espace = donnees();
      const c = cheminDansEspace(espace, chemin);
      if (extname(c.absolu).toLowerCase() !== '.md') refuser(`CV Markdown attendu (.md) : ${c.relatif}`);
      if (!c.existe) refuser(`CV introuvable : ${c.relatif}`);
      const navigateur = trouverNavigateur();
      if (!navigateur) refuser('Aucun Chrome, Edge ou Chromium trouvé : installer Chrome ou Edge, ou indiquer son chemin dans POSTULER_JUSTE_NAVIGATEUR');
      const local = join(espace, 'cv', 'gabarit');
      const gabarit = existsSync(join(local, 'gabarit.css')) ? local : GABARIT_DEFAUT;
      const pdfAvant = c.absolu.replace(/\.md$/i, '.pdf');
      const pdfExistait = existsSync(pdfAvant);
      const r = genererCv(c.absolu, gabarit, navigateur, { capture: Boolean(capture) });
      const rel = (p: string) => oblique(relative(espace, p));
      const mise = await analyserPages(readFileSync(r.pdf)).catch((e: Error) => ({
        pages: [],
        avertissements: [`Remplissage des pages non mesuré (${e.message}) : vérifier sur la capture.`],
      }));
      const infos = {
        ok: true,
        pdf: rel(r.pdf),
        pages: r.pages,
        depasse_2_pages: r.pages > 2,
        remplissage: mise.pages.map((p) => `page ${p.page} : ${p.remplissage} %`),
        avertissements: [...(r.pages > 2 ? [`${r.pages} pages : couper du texte pour tenir en 2 (pas réduire la police).`] : []), ...mise.avertissements],
        pdf_existait: pdfExistait,
        gabarit: gabarit === local ? 'cv/gabarit' : 'gabarit livré (sobre)',
        capture: r.capture ? rel(r.capture) : null,
      };
      const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(infos, null, 2) }];
      if (r.capture) content.push({ type: 'image', data: readFileSync(r.capture).toString('base64'), mimeType: 'image/png' });
      return { content };
    }),
  );

  serveur.registerTool(
    'compter',
    {
      title: 'Compter les caractères',
      description:
        "Nombre de caractères et de mots de chaque message à copier-coller (blocs encadrés « ──── début … ──── » / « ──── fin … ──── ») " +
        "d'un texte ou d'un fichier de l'espace, sinon du texte entier. À utiliser pour respecter la limite d'un formulaire (la vraie valeur, pas une estimation).",
      inputSchema: {
        texte: z.string().optional().describe('Texte à mesurer'),
        chemin: z.string().optional().describe('Ou fichier de l’espace (dossier-candidature.md…)'),
      },
      annotations: lecture,
    },
    sur(({ texte, chemin }) => {
      if (texte === undefined && !chemin) refuser('texte ou chemin attendu');
      if (texte !== undefined) return { ok: true, blocs: compterTexte(texte) };
      const l = lireEspace(donnees(), chemin!);
      if (l.genre !== 'texte') refuser(`Fichier texte attendu : ${l.chemin}`);
      return { ok: true, fichier: l.chemin, blocs: compterTexte(l.texte) };
    }),
  );

  serveur.registerTool(
    'lister_gabarits',
    {
      title: 'Gabarits de CV',
      description: 'Gabarits de CV livrés (nom et description) ; celui de l’espace est dans cv/gabarit. choisir_gabarit en installe un.',
      inputSchema: {},
      annotations: lecture,
    },
    sur(() => ({ gabarits: listerGabarits() })),
  );

  serveur.registerTool(
    'choisir_gabarit',
    {
      title: 'Choisir le gabarit de CV',
      description:
        "Installe un gabarit livré dans cv/gabarit (commun à tous les CV de l'utilisateur ; l'ancien est gardé dans cv/gabarit-<date>/, la " +
        "photo est reprise). À faire à la demande de l'utilisateur, puis régénérer le CV (generer_cv avec capture) pour lui montrer le rendu.",
      inputSchema: { nom: z.string().min(1).describe('Nom du gabarit : sobre, moderne, compact…') },
    },
    sur(({ nom }) => {
      const espace = donnees();
      const r = choisirGabarit(espace, nom);
      return { ok: true, dossier: oblique(relative(espace, r.dossier)), ancien: r.ancien ? oblique(relative(espace, r.ancien)) : null };
    }),
  );

}
