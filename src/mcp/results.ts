// Formatting of the MCP tool results: readable JSON, errors returned to the AI without stopping the server.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tm } from './texts.ts';

/** Beyond this, the JSON is returned without indentation (indentation costs up to a third of the size). */
const INDENTATION_MAX = 8_000;

export function result(x: unknown): CallToolResult {
  const readable = JSON.stringify(x, null, 2);
  return { content: [{ type: 'text', text: readable.length > INDENTATION_MAX ? JSON.stringify(x) : readable }] };
}

export function failure(e: unknown): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: tm('results.failure.content.text', { message: String((e as Error).message) }) }] };
}

/** Runs the tool and turns any exception into an error result the AI can read. */
export function on<A>(fn: (a: A) => unknown | Promise<unknown>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return result(await fn(a));
    } catch (e) {
      return failure(e);
    }
  };
}

/** Like safe, for a tool that builds its content itself (text, images, resources). */
export function onContent<A>(fn: (a: A) => CallToolResult | Promise<CallToolResult>) {
  return async (a: A): Promise<CallToolResult> => {
    try {
      return await fn(a);
    } catch (e) {
      return failure(e);
    }
  };
}
