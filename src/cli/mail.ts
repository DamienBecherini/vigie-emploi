// "vigie-emploi mail": mailbox read over IMAP (setup, status, fetch, forget).
import { createInterface } from 'node:readline/promises';
import type { Config, MailConfig } from '../core/config.ts';
import type { Database } from '../db/database.ts';
import { accountOf, fetchMailPerConfig, listFolders } from '../mail/fetch.ts';
import { providerOf } from '../mail/providers.ts';
import { secretStore, type SecretStore } from '../mail/secret.ts';
import { mailState, messageMailError, saveMailSettings } from '../mail/settings.ts';
import { t } from '../i18n/index.ts';
import { AppError } from '../core/errors.ts';

type Values = Record<string, string | boolean | string[] | undefined>;

function userError(message: string): Error {
  return new AppError('invalid', message);
}

async function ask(question: string, fallback = ''): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(fallback ? `${question} [${fallback}] ` : `${question} `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

/** Typed without echo (raw mode): the password never shows on the screen. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) return reject(userError(t('cli.mail.notTty')));
    process.stdout.write(`${question} `);
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const done = (err?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(userError(t('cli.mail.cancelled')));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    input.on('data', onData);
  });
}

async function readStdin(): Promise<string> {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s.replace(/\r?\n$/, '');
}

async function setup(v: Values, config: Config, store: SecretStore): Promise<void> {
  if (!config.file) throw userError(t('cli.mail.noConfigFile'));
  const interactive = Boolean(process.stdin.isTTY) && !v['password-stdin'];
  const address = (v.address as string | undefined) ?? (interactive ? await ask(t('cli.mail.askAddress'), config.mail?.user) : '');
  if (!address) throw userError(t('cli.mail.addressRequired'));
  const provider = providerOf(address);
  let host = v.host as string | undefined;
  const secure = !v.insecure;
  if (!host && provider?.auth === 'oauth') throw userError(t('cli.mail.oauth', { name: provider.name }));
  if (!host) host = provider?.host ?? (interactive ? await ask(t('cli.mail.askHost'), config.mail?.host) : undefined);
  if (!host) throw userError(t('cli.mail.hostRequired'));
  const port = v.port ? Number(v.port) : provider?.host === host ? provider.port : secure ? 993 : 143;
  if (provider) console.log(t('cli.mail.provider', { name: provider.name, host, port }));
  if (provider?.auth === 'app-password') console.log(t('cli.mail.appPassword', { name: provider.name, help: provider.help ?? '' }));

  const password = v['password-stdin'] ? await readStdin() : await askHidden(t('cli.mail.askPassword'));
  if (!password) throw userError(t('cli.mail.passwordRequired'));
  const base = { user: address, host, port, secure, sinceDays: Number(v['since-days'] ?? config.mail?.sinceDays ?? 14), markSeen: v['mark-seen'] !== false };
  let folders: string[];
  try {
    folders = await listFolders(base, { password });
  } catch (e) {
    throw userError(messageMailError(e, { host, folder: '' }));
  }
  let folder = v.folder as string | undefined;
  if (!folder && interactive) {
    console.log(t('cli.mail.folders'));
    folders.forEach((f, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${f}`);
    });
    const answer = await ask(t('cli.mail.askFolder'), config.mail?.folder);
    folder = /^\d+$/.test(answer) ? folders[Number(answer) - 1] : answer;
  }
  if (!folder) throw userError(t('cli.mail.folderRequired'));
  if (!folders.includes(folder)) throw userError(t('cli.mail.folderUnknown', { folder, folders: folders.join(', ') }));
  const mail: MailConfig = { ...base, folder };
  store.set(accountOf(mail), password);
  if (config.mail && accountOf(config.mail) !== accountOf(mail)) store.remove(accountOf(config.mail));
  saveMailSettings(config.file, mail);
  console.log(t('cli.mail.saved', { folder, file: config.file, backend: t(`core.mail.backend.${store.backend()}` as const) }));
}

function status(v: Values, config: Config, db: Database, store: SecretStore, json: (x: unknown) => void): void {
  const s = mailState(db, config.mail, store);
  if (v.json) {
    json(s);
    return;
  }
  if (!s.configured) {
    console.log(t('cli.mail.notConfigured'));
    return;
  }
  console.log(
    t('cli.mail.status', {
      user: s.user!,
      host: s.host!,
      port: s.port!,
      folder: s.folder!,
      password: s.password ? t('cli.mail.passwordYes', { backend: t(`core.mail.backend.${s.backend}` as const) }) : t('cli.mail.passwordNo'),
      fetched: s.fetched_at ?? t('cli.mail.never'),
    }),
  );
}

export async function commandMail(sub: string | undefined, v: Values, ctx: { config: Config; db: Database }, json: (x: unknown) => void): Promise<void> {
  const store = secretStore();
  const { config, db } = ctx;
  switch (sub ?? 'status') {
    case 'setup':
      return setup(v, config, store);
    case 'status':
      return status(v, config, db, store, json);
    case 'fetch': {
      if (!config.mail) throw userError(t('cli.mail.notConfigured'));
      try {
        const r = await fetchMailPerConfig(db, config, store);
        if (v.json) return json(r);
        console.log(t('cli.mail.fetched', { n: r!.fetched, folder: r!.folder, inbox: config.emails }));
        if (r!.more) console.log(t('cli.mail.more'));
      } catch (e) {
        throw userError(messageMailError(e, config.mail));
      }
      return;
    }
    case 'forget': {
      if (config.mail) store.remove(accountOf(config.mail));
      if (config.file) saveMailSettings(config.file, null);
      console.log(t('cli.mail.forgotten'));
      return;
    }
    default:
      throw userError(t('cli.mail.subUnknown', { sub: sub ?? '' }));
  }
}
