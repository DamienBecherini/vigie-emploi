// Command-line interface of vigie-emploi (designed to be driven by an AI: stable JSON outputs).
// Messages follow the configured language ("language" key, French by default); command, option and
// status names are English identifiers, and the --json outputs do not change with the language.
// This file holds the entry point (language, dispatch, errors) and the registry; the commands are in commands/.
import { languageConfigured, normalizeLanguage, systemLanguage } from '../core/config.ts';
import { STATUSES } from '../core/statuses.ts';
import { TYPES_EVENT } from '../core/events.ts';
import { defineLanguage, isLanguage, t } from '../i18n/index.ts';
import { AppError, isExpected } from '../core/errors.ts';
import type { Command } from './context.ts';
import { ingestionCommands } from './commands/ingestion.ts';
import { offerCommands } from './commands/offers.ts';
import { scoringCommands } from './commands/scoring.ts';
import { applicationCommands } from './commands/applications.ts';
import { workspaceCommands } from './commands/workspace.ts';

function help(): string {
  return t('cli.help', { statuses: STATUSES.join(', '), types: TYPES_EVENT.join('|') });
}

const commands: Record<string, Command> = {
  ...ingestionCommands,
  ...offerCommands,
  ...scoringCommands,
  ...applicationCommands,
  ...workspaceCommands,
};

/** Value of an option (--name value or --name=value) read before the full parsing. */
function optionRaw(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) return argv[i + 1];
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

/**
 * Language of the messages: for init, --language or the system's (the workspace being created); otherwise the configuration (--data, --config,
 * VIGIE_EMPLOI_LANGUAGE, file), otherwise French.
 */
function messageLanguage(cmd: string | undefined, args: string[]) {
  const raw = cmd === 'init' ? optionRaw(args, 'language') : undefined;
  const requested = raw === undefined ? undefined : normalizeLanguage(raw);
  if (isLanguage(requested)) return requested;
  // A new workspace takes the system's language (the configuration of the current folder is another workspace's).
  if (cmd === 'init') return systemLanguage();
  return languageConfigured({ dataDir: optionRaw(args, 'data'), fileConfig: optionRaw(args, 'config') });
}

/** An option the command does not have, said in the user's language (node:util words it in English); null for any other error. */
function optionUnknown(err: Error): string | null {
  if ((err as { code?: string }).code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return null;
  const option = err.message.match(/'([^']+)'/)?.[1];
  return option ? t('cli.optionUnknown', { option }) : null;
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  defineLanguage(messageLanguage(cmd, args));
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(help());
    return 0;
  }
  // Own properties only: a name inherited from Object.prototype (toString, constructor…) is not a command.
  const fn = Object.hasOwn(commands, cmd) ? commands[cmd] : undefined;
  if (!fn) {
    process.stderr.write(`${t('cli.commandUnknown', { command: cmd })}\n\n${help()}`);
    return 2;
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(help());
    return 0;
  }
  try {
    await fn(args);
    return 0;
  } catch (e) {
    const err = e as Error;
    // An expected error (wrong input, missing file, unknown option) shows its message; anything else is a defect: its stack.
    const text = optionUnknown(err) ?? err.message;
    const message = isExpected(err) ? text : (err.stack ?? text);
    const code = err instanceof AppError ? err.code : undefined;
    if (args.includes('--json')) process.stderr.write(`${JSON.stringify({ ok: false, error: text, code })}\n`);
    else process.stderr.write(`${t('cli.error', { message })}\n`);
    return 1;
  }
}
