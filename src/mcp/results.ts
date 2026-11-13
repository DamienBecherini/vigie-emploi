// Mise en forme des résultats d'outils MCP : JSON lisible, erreurs rendues à l'IA sans arrêter le serveur.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tm } from './texts.ts';

/** Au-delà, le JSON est rendu sans indentation (l'indentation coûte jusqu'à un tiers de la taille). */
const INDENTATION_MAX = 8_000;

export function result(x: unknown): CallToolResult {
  const readable = JSON.stringify(x, null, 2);
  return { content: [{ type: 'text', text: readable.length > INDENTATION_MAX ? JSON.stringify(x) : readable }] };
}

export function failure(e: unknown): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: tm('results.failure.content.text', { message: String((e as Error).message) }) }] };
}

/** Exécute l'outil et transforme toute exception en résultat d'erreur lisible par l'IA. */
export function on<A>(fn: (a: A) => unknown | Promise<unknown>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return result(await fn(a));
    } catch (e) {
      return failure(e);
    }
  };
}

/** Comme sur, pour un outil qui compose lui-même son contenu (texte, images, ressources). */
export function onContent<A>(fn: (a: A) => CallToolResult | Promise<CallToolResult>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return await fn(a);
    } catch (e) {
      return failure(e);
    }
  };
}
