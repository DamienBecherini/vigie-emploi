// Errors the application expects: a wrong input, something that does not exist, an access it refuses.
// They carry a code, so that each front end says it its own way without reading the message (which depends on the
// language): an HTTP status for the API, the message alone for the CLI and the MCP server. Any other error is a defect
// of the program: the API answers 500, the CLI prints the stack.

import type { ZodError } from 'zod';

export const ERROR_CODES = [
  /** The offer, event, file, version… does not exist. */
  'not-found',
  /** The input is wrong: unknown value, bad format, missing field. */
  'invalid',
  /** The application refuses the access (a path outside the workspace, the database, the mailbox files). */
  'forbidden',
  /** No workspace yet (no data folder, or a server started without one). */
  'not-configured',
  /** The requested configuration file is missing. */
  'file-not-found',
  /** The configured language is not one the application has. */
  'language-unknown',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

/** HTTP status of each code. */
export const HTTP_STATUS: Record<ErrorCode, 400 | 403 | 404> = {
  'not-found': 404,
  invalid: 400,
  forbidden: 403,
  'not-configured': 400,
  'file-not-found': 404,
  'language-unknown': 400,
};

/**
 * Is this an error to show as it is (its message is written for the user)? An AppError, or an error of the system
 * with its own code (file missing, access denied, option unknown to the command-line parser…).
 */
export function isExpected(e: unknown): boolean {
  if (e instanceof AppError) return true;
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^E[A-Z_]+$/.test(code);
}

/** Readable message of a Zod error: "criteria.2.weight: …; threshold: …". */
export function messageZod(e: ZodError, prefix = ''): string {
  return e.issues
    .map((i) => {
      const path = [prefix, ...i.path.map(String)].filter(Boolean).join('.');
      return path ? `${path} : ${i.message}` : i.message;
    })
    .join(' ; ');
}
