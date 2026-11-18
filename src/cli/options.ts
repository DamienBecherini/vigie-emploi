// Reading of the command-line options: node:util parseArgs with the general options, its result typed from the
// option definitions, and the checks of a value (whole number, decimal number, comma-separated list).
import { parseArgs } from 'node:util';
import { t } from '../i18n/index.ts';
import { AppError } from '../core/errors.ts';

/** Definition of one option, as parseArgs takes it. */
export interface OptionDefinition {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
}

export type OptionDefinitions = Record<string, OptionDefinition>;

/** Options every command accepts. */
export const GENERAL_OPTIONS = {
  data: { type: 'string' },
  config: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies OptionDefinitions;

/** Value of one option: a boolean option gives a boolean (false with --no-name), a string option its text, a repeated one a list. */
type ValueOf<D extends OptionDefinition> = D extends { type: 'boolean' } ? boolean : D extends { multiple: true } ? string[] : string;

/** Values read for a set of definitions: every option may be absent. */
export type Values<O extends OptionDefinitions> = { [K in keyof O]?: ValueOf<O[K]> };

/** Values of a command that declares the options O: the general ones, redefined by O when a name is the same (score --json). */
export type CommandValues<O extends OptionDefinitions> = Values<Omit<typeof GENERAL_OPTIONS, keyof O> & O>;

/** Error of the user's input: shown with its message alone. */
export function error(message: string): never {
  throw new AppError('invalid', message);
}

/** Parses the arguments of a command (strict, positionals and --no-name allowed); unknown or malformed options are parseArgs errors. */
export function analyze<const O extends OptionDefinitions>(args: string[], options: O): { v: CommandValues<O>; pos: string[] } {
  const { values, positionals } = parseArgs({
    args,
    options: { ...GENERAL_OPTIONS, ...options },
    allowPositionals: true,
    allowNegative: true,
    strict: true,
  });
  // parseArgs types its result from a literal definition only; the options merged here give that same shape, written above.
  return { v: values as CommandValues<O>, pos: positionals };
}

/** Whole number from `min` (1 by default), otherwise an error naming the option and showing what was typed. */
export function whole(v: unknown, name: string, min = 1): number {
  const n = String(v ?? '').trim() === '' ? Number.NaN : Number(v);
  if (!Number.isInteger(n) || n < min) error(t('cli.invalid', { name, value: String(v) }));
  return n;
}

/** Decimal number (comma or point), undefined when the option is absent. */
export function number(v: unknown, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) error(t('cli.invalid', { name, value: String(v) }));
  return n;
}

/** Comma-separated list, undefined when the option is absent or empty. */
export function list(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
