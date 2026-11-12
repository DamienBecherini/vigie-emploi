// Mise en forme des résultats d'outils MCP : JSON lisible, erreurs rendues à l'IA sans arrêter le serveur.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { bi } from './textes.ts';

/** Au-delà, le JSON est rendu sans indentation (l'indentation coûte jusqu'à un tiers de la taille). */
const INDENTATION_MAX = 8_000;

export function resultat(x: unknown): CallToolResult {
  const lisible = JSON.stringify(x, null, 2);
  return { content: [{ type: 'text', text: lisible.length > INDENTATION_MAX ? JSON.stringify(x) : lisible }] };
}

export function echec(e: unknown): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: bi({ fr: `Erreur : ${(e as Error).message}`, en: `Error: ${(e as Error).message}` }) }] };
}

/** Exécute l'outil et transforme toute exception en résultat d'erreur lisible par l'IA. */
export function sur<A>(fn: (a: A) => unknown | Promise<unknown>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return resultat(await fn(a));
    } catch (e) {
      return echec(e);
    }
  };
}

/** Comme sur, pour un outil qui compose lui-même son contenu (texte, images, ressources). */
export function surContenu<A>(fn: (a: A) => CallToolResult | Promise<CallToolResult>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return await fn(a);
    } catch (e) {
      return echec(e);
    }
  };
}
