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
import { bi, bt, tm, type Bilingue } from './textes.ts';
import { LANGUES, type Langue } from '../i18n/index.ts';

const oblique = (p: string) => p.replace(/\\/g, '/');

/** Image transmise à l'IA : au-delà, la plupart des clients la refusent. */
const IMAGE_MAX = 5 * 1024 * 1024;

/** Fichier texte lu par morceaux au-delà de cette taille (réponse lisible en entier par l'IA). */
const MORCEAU_TEXTE = 24_000;

/** Consignes de l'espace exposées en prompts : nom → fichiers lus sur le disque à chaque appel. */
const PROMPTS: Record<string, { titre: Bilingue; description: Bilingue; fichier: string; consigne: Bilingue }> = {
  demarrage: {
    titre: bt('espace.PROMPTS.demarrage.titre'),
    description: bt('espace.PROMPTS.demarrage.description'),
    fichier: 'DEMARRAGE.md',
    consigne: bt('espace.PROMPTS.demarrage.consigne'),
  },
  'traiter-emails': {
    titre: bt('espace.PROMPTS.traiter_emails.titre'),
    description: bt('espace.PROMPTS.traiter_emails.description'),
    fichier: 'procedures/traiter-emails.md',
    consigne: bt('espace.PROMPTS.traiter_emails.consigne'),
  },
  'preparer-go': {
    titre: bt('espace.PROMPTS.preparer_go.titre'),
    description: bt('espace.PROMPTS.preparer_go.description'),
    fichier: 'procedures/preparer-go.md',
    consigne: bt('espace.PROMPTS.preparer_go.consigne'),
  },
  'cv-cible': {
    titre: bt('espace.PROMPTS.cv_cible.titre'),
    description: bt('espace.PROMPTS.cv_cible.description'),
    fichier: 'procedures/cv-cible.md',
    consigne: bt('espace.PROMPTS.cv_cible.consigne'),
  },
};

/** Développe « ~ » et résout un dossier relatif depuis le dossier personnel (le dossier courant d'un client MCP est imprévisible). */
function dossierChoisi(d: string | undefined): string {
  if (!d?.trim()) return dossierParDefaut();
  const t = d.trim().replace(/^~(?=$|[\\/])/, homedir());
  return resolve(homedir(), t);
}

function lireConsigne(dossier: string, fichier: string): string {
  const chemin = join(dossier, fichier);
  if (!existsSync(chemin)) return tm('espace.lireConsigne', { fichier: String(fichier), p2: String(oblique(dossier)) });
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
        ? { offre: z.string().optional().describe(tm('espace.argsSchema.offre')) }
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
              ? tm('espace.enregistrerOutilsEspace', { p1: String(messageNonInitialise(etat)), d: String(d) })
              : tm('espace.enregistrerOutilsEspace_2', { p1: String(messageNonInitialise(etat)) });
        } else {
          const dossier = etat.config.dossierDonnees;
          const visee = args?.offre?.trim();
          const offre = visee ? `\n\n${tm('espace.offre', { visee: String(visee) })}` : '';
          texte =
            tm('espace.enregistrerOutilsEspace_3', { dossier: oblique(dossier), acces: tm('espace.ACCES_SANS_FICHIERS') }) +
            `===== AGENTS.md (${tm('espace.enregistrerOutilsEspace_4')}) =====\n\n${lireConsigne(dossier, 'AGENTS.md')}\n\n` +
            `===== ${p.fichier} =====\n\n${lireConsigne(dossier, p.fichier)}\n\n` +
            `=====\n\n${bi(p.consigne)}${offre}`;
        }
        return { description: bi(p.titre), messages: [{ role: 'user', content: { type: 'text', text: texte } }] };
      },
    );
  }

  serveur.registerResource(
    'consignes',
    'vigie-emploi://espace/AGENTS.md',
    {
      title: tm('espace.consignes.title'),
      description: tm('espace.consignes.description'),
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
      title: tm('espace.etat_espace.title'),
      description: tm('espace.etat_espace.description'),
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
        gabarit_cv: initialise && existsSync(join(dossier, 'cv', 'gabarit', 'gabarit.css')) ? 'cv/gabarit' : tm('espace.etat_espace.gabarit_cv'),
        langue: etat.config.langue,
        prompts: Object.keys(PROMPTS),
      };
    }),
  );

  serveur.registerTool(
    'initialiser_espace',
    {
      title: tm('espace.initialiser_espace.title'),
      description: tm('espace.initialiser_espace.description', { p1: String(oblique(etat.config.dossierDonnees)) }),
      inputSchema: {
        dossier: z
          .string()
          .optional()
          .describe(
            tm('espace.initialiser_espace.inputSchema.dossier'),
          ),
        gabarit: z
          .string()
          .optional()
          .describe(tm('espace.initialiser_espace.inputSchema.gabarit')),
        langue: z
          .enum(LANGUES)
          .optional()
          .describe(
            tm('espace.initialiser_espace.inputSchema.langue', { langue: String(etat.config.langue) }),
          ),
      },
    },
    sur(({ dossier, gabarit, langue }: { dossier?: string; gabarit?: string; langue?: Langue }) => {
      const cible = dossier?.trim() ? dossierChoisi(dossier) : resolve(etat.config.dossierDonnees);
      const app = resolve(RACINE_APP);
      const versCible = relative(app, cible);
      if (!versCible || (!versCible.startsWith('..') && !isAbsolute(versCible))) {
        refuser(
          tm('espace.initialiser_espace', { p1: String(oblique(cible)), p2: String(oblique(dossierParDefaut())) }),
        );
      }
      if (espaceExiste(cible)) {
        const ouvert = etat.db && resolve(etat.config.dossierDonnees).toLowerCase() === cible.toLowerCase();
        refuser(
          ouvert
            ? tm('espace.initialiser_espace_2', { p1: String(oblique(cible)) })
            : tm('espace.initialiser_espace_3', { p1: String(oblique(cible)) }),
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
                tm('espace.initialiser_espace.avertissements', { p1: String(oblique(dossierDeDemarrage)), dossier: String(r.dossier) }),
              ]),
        ],
        suite: [
          tm('espace.initialiser_espace.suite', { dossier: String(r.dossier) }),
          tm('espace.initialiser_espace.suite_2'),
        ],
      };
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Fichiers de l'espace

  serveur.registerTool(
    'lister_fichiers',
    {
      title: tm('espace.lister_fichiers.title'),
      description: tm('espace.lister_fichiers.description'),
      inputSchema: {
        dossier: z.string().optional().describe(tm('espace.lister_fichiers.inputSchema.dossier')),
        profondeur: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe(tm('espace.lister_fichiers.inputSchema.profondeur')),
      },
      annotations: lecture,
    },
    sur(({ dossier, profondeur }) => listerEspace(donnees(), dossier ?? '.', profondeur ?? 1)),
  );

  serveur.registerTool(
    'lire_fichier',
    {
      title: tm('espace.lire_fichier.title'),
      description: tm('espace.lire_fichier.description'),
      inputSchema: {
        chemin: z.string().min(1).describe(tm('espace.lire_fichier.inputSchema.chemin')),
        debut: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            tm('espace.lire_fichier.inputSchema.debut', { MORCEAU_TEXTE: String(MORCEAU_TEXTE) }),
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
            ? tm('espace.lire_fichier', { fin: String(fin) })
            : tm('espace.lire_fichier_2');
        const entete = tm('espace.lire_fichier_3', { chemin: String(l.chemin), d: String(d), fin: String(fin), length: String(texte.length), suite: String(suite) });
        return { content: [{ type: 'text', text: `${entete}\n\n${texte.slice(d, fin)}` }] };
      };
      if (l.genre === 'texte') return morceau(l.texte);
      if (l.extension === '.pdf') {
        const { pages, texte, liens } = await textePdf(l.donnees);
        if (texte.join('').trim().length > 20) {
          const titreLiens = tm('espace.lire_fichier_4');
          const corps = texte
            .map((t, i) => `----- page ${i + 1} / ${pages} -----\n${t}${liens[i]?.length ? `\n\n${titreLiens} : ${liens[i].join(' · ')}` : ''}`)
            .join('\n\n');
          return morceau(tm('espace.lire_fichier_5', { chemin: String(l.chemin), pages: String(pages), corps: String(corps) }));
        }
        return {
          content: [
            {
              type: 'text',
              text: tm('espace.lire_fichier.content.text', { chemin: String(l.chemin), pages: String(pages) }),
            },
            { type: 'resource', resource: { uri: `file:///${oblique(cheminDansEspace(donnees(), l.chemin).absolu).replace(/^\/+/, '')}`, mimeType: 'application/pdf', blob: l.donnees.toString('base64') } },
          ],
        };
      }
      const typeImage = TYPES_IMAGE[l.extension];
      if (typeImage) {
        if (l.taille > IMAGE_MAX) refuser(
            tm('espace.lire_fichier_6', { p1: String(Math.round(l.taille / 1024)) }),
          );
        return {
          content: [
            { type: 'text', text: tm('espace.lire_fichier.content.text_2', { chemin: String(l.chemin), p2: String(Math.round(l.taille / 1024)) }) },
            { type: 'image', data: l.donnees.toString('base64'), mimeType: typeImage },
          ],
        };
      }
      if (l.extension === '.docx') {
        const texte = texteDocx(l.donnees);
        if (texte) return morceau(tm('espace.lire_fichier_7', { chemin: String(l.chemin), texte: String(texte) }));
      }
      refuser(
        tm('espace.lire_fichier_8', { chemin: String(l.chemin), p2: String(l.extension || 'sans extension'), p3: String(l.extension || 'no extension') }),
      );
    }),
  );

  serveur.registerTool(
    'ecrire_fichier',
    {
      title: tm('espace.ecrire_fichier.title'),
      description: tm('espace.ecrire_fichier.description', { p1: String(EXTENSIONS_ECRITURE.join(', ')) }),
      inputSchema: {
        chemin: z
          .string()
          .min(1)
          .describe(tm('espace.ecrire_fichier.inputSchema.chemin')),
        contenu: z.string().describe(tm('espace.ecrire_fichier.inputSchema.contenu')),
        creer_seulement: z.boolean().optional().describe(tm('espace.ecrire_fichier.inputSchema.creer_seulement')),
      },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    sur(({ chemin, contenu, creer_seulement }) => ({ ok: true, ...ecrireEspace(donnees(), chemin, contenu, { creerSeulement: creer_seulement }) })),
  );

  serveur.registerTool(
    'deplacer_fichier',
    {
      title: tm('espace.deplacer_fichier.title'),
      description: tm('espace.deplacer_fichier.description'),
      inputSchema: {
        source: z.string().min(1).describe(tm('espace.deplacer_fichier.inputSchema.source')),
        destination: z.string().min(1).describe(tm('espace.deplacer_fichier.inputSchema.destination')),
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
      title: tm('espace.generer_cv.title'),
      description: tm('espace.generer_cv.description'),
      inputSchema: {
        chemin: z.string().min(1).describe(tm('espace.generer_cv.inputSchema.chemin')),
        capture: z.boolean().optional().describe(tm('espace.generer_cv.inputSchema.capture')),
      },
    },
    surContenu(async ({ chemin, capture }): Promise<CallToolResult> => {
      const espace = donnees();
      const c = cheminDansEspace(espace, chemin);
      if (extname(c.absolu).toLowerCase() !== '.md') refuser(tm('espace.generer_cv', { relatif: String(c.relatif) }));
      if (!c.existe) refuser(tm('espace.generer_cv_2', { relatif: String(c.relatif) }));
      const navigateur = trouverNavigateur();
      if (!navigateur) {
        refuser(
          tm('espace.generer_cv_3'),
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
        avertissements: [tm('espace.generer_cv.avertissements', { message: String(e.message) })],
      }));
      const infos = {
        ok: true,
        pdf: rel(r.pdf),
        pages: r.pages,
        depasse_2_pages: r.pages > 2,
        remplissage: mise.pages.map((p) => tm('espace.generer_cv.remplissage', { page: String(p.page), remplissage: String(p.remplissage) })),
        avertissements: [
          ...(r.pages > 2
            ? [
                tm('espace.generer_cv.avertissements_2', { pages: String(r.pages) }),
              ]
            : []),
          ...mise.avertissements,
        ],
        pdf_existait: pdfExistait,
        gabarit: gabarit === local ? 'cv/gabarit' : tm('espace.generer_cv.gabarit'),
        capture: r.capture ? rel(r.capture) : null,
        liens: { pdf: lienFichier(r.pdf), markdown: lienFichier(c.absolu) },
        a_dire: tm('espace.generer_cv.a_dire', { p1: String(lienFichier(r.pdf)), p2: String(lienFichier(c.absolu)) }),
      };
      const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(infos, null, 2) }];
      if (r.capture) content.push({ type: 'image', data: readFileSync(r.capture).toString('base64'), mimeType: 'image/png' });
      return { content };
    }),
  );

  serveur.registerTool(
    'compter',
    {
      title: tm('espace.compter.title'),
      description: tm('espace.compter.description'),
      inputSchema: {
        texte: z.string().optional().describe(tm('espace.compter.inputSchema.texte')),
        chemin: z.string().optional().describe(tm('espace.compter.inputSchema.chemin')),
      },
      annotations: lecture,
    },
    sur(({ texte, chemin }) => {
      if (texte === undefined && !chemin) refuser(tm('espace.compter'));
      if (texte !== undefined) return { ok: true, blocs: compterTexte(texte) };
      const l = lireEspace(donnees(), chemin!);
      if (l.genre !== 'texte') refuser(tm('espace.compter_2', { chemin: String(l.chemin) }));
      return { ok: true, fichier: l.chemin, blocs: compterTexte(l.texte) };
    }),
  );

  serveur.registerTool(
    'lister_gabarits',
    {
      title: tm('espace.lister_gabarits.title'),
      description: tm('espace.lister_gabarits.description'),
      inputSchema: {},
      annotations: lecture,
    },
    sur(() => ({ gabarits: listerGabarits() })),
  );

  serveur.registerTool(
    'choisir_gabarit',
    {
      title: tm('espace.choisir_gabarit.title'),
      description: tm('espace.choisir_gabarit.description'),
      inputSchema: { nom: z.string().min(1).describe(tm('espace.choisir_gabarit.inputSchema.nom')) },
    },
    sur(({ nom }) => {
      const espace = donnees();
      const r = choisirGabarit(espace, nom);
      return { ok: true, dossier: oblique(relative(espace, r.dossier)), ancien: r.ancien ? oblique(relative(espace, r.ancien)) : null };
    }),
  );

}
