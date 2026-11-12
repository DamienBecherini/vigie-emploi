// Notifications poussées à l'interface (Server-Sent Events) : la base ou la boîte de réception a changé.
// La base est modifiée par d'autres processus (CLI, serveur MCP de l'agent, git) : le serveur surveille
// le fichier et ne prévient que si les données ont vraiment changé (PRAGMA data_version), sans interroger
// la base à intervalle régulier. Ses propres écritures (API) sont signalées directement par le serveur.
import { watch, type FSWatcher } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { Base } from '../db/base.ts';
import { compterEmails } from './travail.ts';

export type Notification = { type: 'base' } | { type: 'emails'; nombre: number };

export class Diffusion {
  private readonly abonnes = new Set<(n: Notification) => void>();

  abonner(f: (n: Notification) => void): () => void {
    this.abonnes.add(f);
    return () => this.abonnes.delete(f);
  }

  emettre(n: Notification): void {
    for (const f of this.abonnes) {
      try {
        f(n);
      } catch {
        /* un abonné défaillant (connexion fermée) ne bloque pas les autres */
      }
    }
  }

  get nombreAbonnes(): number {
    return this.abonnes.size;
  }
}

/** Version des données vue par cette connexion : change quand une AUTRE connexion valide une écriture. */
export function versionDonnees(db: Base): number {
  return (db.prepare('PRAGMA data_version').get() as { data_version: number }).data_version;
}

/** Appelle f au plus une fois par rafale d'appels espacés de moins de delaiMs. */
export function regrouper(f: () => void, delaiMs: number): { declencher: () => void; arreter: () => void } {
  let minuterie: NodeJS.Timeout | null = null;
  return {
    declencher: () => {
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        minuterie = null;
        f();
      }, delaiMs);
    },
    arreter: () => {
      if (minuterie) clearTimeout(minuterie);
      minuterie = null;
    },
  };
}

export interface OptionsSurveillance {
  db: Base;
  diffusion: Diffusion;
  /** Fichier SQLite (son dossier est surveillé : la base et son journal). */
  base: string;
  /** Boîte de réception des .eml. */
  emails: string;
  delaiMs?: number;
}

/** Surveille la base et la boîte de réception ; renvoie la fonction d'arrêt. */
export function surveiller(o: OptionsSurveillance): () => void {
  const delai = o.delaiMs ?? 300;
  const observateurs: FSWatcher[] = [];
  const arrets: (() => void)[] = [];

  let version = versionDonnees(o.db);
  const verifierBase = regrouper(() => {
    const v = versionDonnees(o.db);
    if (v === version) return;
    version = v;
    o.diffusion.emettre({ type: 'base' });
  }, delai);
  arrets.push(verifierBase.arreter);
  const nomBase = basename(o.base);
  const surBase = watch(dirname(o.base), (_e, nom) => {
    if (!nom || String(nom).startsWith(nomBase)) verifierBase.declencher();
  });
  surBase.on('error', () => {});
  observateurs.push(surBase);

  let nombre = compterEmails(o.emails);
  const verifierEmails = regrouper(() => {
    const n = compterEmails(o.emails);
    if (n === nombre) return;
    nombre = n;
    o.diffusion.emettre({ type: 'emails', nombre: n });
  }, delai);
  arrets.push(verifierEmails.arreter);
  try {
    const surEmails = watch(o.emails, () => verifierEmails.declencher());
    surEmails.on('error', () => {});
    observateurs.push(surEmails);
  } catch {
    /* boîte de réception absente : rien à surveiller */
  }

  return () => {
    for (const a of arrets) a();
    for (const w of observateurs) w.close();
  };
}
