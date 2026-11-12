// Travail en attente pour l'agent (e-mails à trier, offres en « go » à préparer) et lancement de l'agent
// dans un terminal. L'application n'appelle toujours aucun modèle : elle ouvre un terminal où l'utilisateur
// dialogue avec son agent (Claude Code par défaut), exactement comme s'il avait tapé la commande lui-même.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Base } from '../db/base.ts';
import { LANGUE_DEFAUT, tl, type Langue } from '../i18n/index.ts';

/** Actions lançables depuis l'interface, et l'invite passée à l'agent (commande du dossier de données). */
export const ACTIONS_AGENT = {
  'traiter-emails': '/traiter-emails',
  'preparer-go': '/preparer-go',
} as const;

export type ActionAgent = keyof typeof ACTIONS_AGENT;

export function estActionAgent(v: string): v is ActionAgent {
  return Object.hasOwn(ACTIONS_AGENT, v);
}

/** Nombre de .eml en attente dans la boîte de réception (0 si le dossier n'existe pas). */
export function compterEmails(dossier: string): number {
  try {
    return readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.eml')).length;
  } catch {
    return 0;
  }
}

export interface OffreAPreparer {
  id: number;
  titre: string;
  entreprise: string | null;
}

/** Offres en « go » dont le dossier de candidature n'existe pas encore. */
export function goAPreparer(db: Base, dossierDonnees: string): OffreAPreparer[] {
  const lignes = db
    .prepare(
      `SELECT o.id, o.titre, o.entreprise, c.dossier
         FROM offres o LEFT JOIN candidatures c ON c.offre_id = o.id
        WHERE o.statut = 'go'
        ORDER BY o.id`,
    )
    .all() as { id: number; titre: string; entreprise: string | null; dossier: string | null }[];
  return lignes
    .filter((l) => !l.dossier || !existsSync(join(dossierDonnees, l.dossier)))
    .map(({ id, titre, entreprise }) => ({ id, titre, entreprise }));
}

export interface EtatTravail {
  emails: number;
  go_a_preparer: OffreAPreparer[];
}

export function etatTravail(db: Base, o: { dossierDonnees: string; emails: string }): EtatTravail {
  return { emails: compterEmails(o.emails), go_a_preparer: goAPreparer(db, o.dossierDonnees) };
}

/** Lance l'agent pour une action ; se résout quand le terminal est ouvert. */
export type Lanceur = (action: ActionAgent, dossierDonnees: string) => Promise<void>;

/**
 * Commande du terminal : `{dossier}` et `{invite}` y sont remplacés. Par défaut sous Windows :
 * Windows Terminal ouvert dans le dossier de données, avec Claude Code et l'invite de l'action.
 */
export const TERMINAL_WINDOWS = ['wt.exe', '-d', '{dossier}', 'claude', '{invite}'];

export function commandeTerminal(modele: string[], dossierDonnees: string, action: ActionAgent): string[] {
  return modele.map((p) => p.replaceAll('{dossier}', dossierDonnees).replaceAll('{invite}', ACTIONS_AGENT[action]));
}

/**
 * Environnement du terminal lancé : celui du serveur, sans les marqueurs de session de Claude Code
 * (CLAUDECODE, CLAUDE_CODE_*). Si le serveur a été démarré, directement ou non, depuis une session Claude,
 * ces variables feraient croire au nouvel agent qu'il en est une sous-session (conversation non enregistrée).
 */
export function environnementPropre(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^CLAUDECODE$|^CLAUDE_CODE_/i.test(k)));
}

export function lanceurTerminal(
  modele: string[] | null | undefined,
  plateforme: NodeJS.Platform = process.platform,
  langue: Langue = LANGUE_DEFAUT,
): Lanceur {
  const choisi = modele ?? (plateforme === 'win32' ? TERMINAL_WINDOWS : null);
  return (action, dossierDonnees) => {
    if (!choisi || !choisi.length) {
      return Promise.reject(
        new Error(
          tl(langue, 'api.sansTerminal', { invite: ACTIONS_AGENT[action], dossier: dossierDonnees }),
        ),
      );
    }
    const [programme, ...args] = commandeTerminal(choisi, dossierDonnees, action);
    return new Promise((resolve, reject) => {
      const p = spawn(programme, args, {
        cwd: dossierDonnees,
        env: environnementPropre(),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      p.once('error', (e) => reject(new Error(tl(langue, 'api.terminalImpossible', { programme, message: e.message }))));
      p.once('spawn', () => {
        p.unref();
        resolve();
      });
    });
  };
}
