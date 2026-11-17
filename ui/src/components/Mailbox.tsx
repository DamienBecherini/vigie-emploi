// "Mailbox" panel: IMAP connection to the folder where a filter files the job alerts (for users without a terminal).
// The typed password goes to the local server, which hands it to the system keychain; it never comes back.
import { ExternalLink, KeyRound, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type InputMail, type ProviderMail, type StateMail } from '../api.ts';
import { t } from '../i18n/index.ts';
import { formatDate } from './Badges.tsx';

function providerOf(address: string, providers: ProviderMail[]): ProviderMail | null {
  const domain = address.trim().toLowerCase().split('@')[1];
  return domain ? (providers.find((p) => p.domains.includes(domain)) ?? null) : null;
}

/** Folder that looks like the alerts folder (first choice offered). */
function guessFolder(folders: string[]): string {
  return folders.find((f) => /alert|emploi|job|offre/i.test(f)) ?? '';
}

function Status({ state, edit }: { state: StateMail; edit: () => void }) {
  const client = useQueryClient();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const fetch = useMutation({
    mutationFn: api.fetchMail,
    onSuccess: (r) => {
      if (!r.ok) return setMessage({ text: r.error, error: true });
      const parts = [r.fetched ? t('mail.fetched', { n: r.fetched }) : t('mail.fetchedNone', { folder: r.folder })];
      if (r.more) parts.push(t('mail.more'));
      setMessage({ text: parts.join(' '), error: false });
      client.invalidateQueries({ queryKey: ['mail'] });
      client.invalidateQueries({ queryKey: ['work'] });
    },
    onError: (e) => setMessage({ text: (e as Error).message, error: true }),
  });
  const forget = useMutation({
    mutationFn: api.forgetMail,
    onSuccess: () => {
      setMessage(null);
      client.invalidateQueries({ queryKey: ['mail'] });
    },
  });
  return (
    <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="font-bold">{t('mail.state', { user: state.user, folder: state.folder, host: state.host })}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {state.fetched_at ? t('mail.lastFetch', { date: formatDate(state.fetched_at.slice(0, 10)) }) : t('mail.never')}
      </p>
      {!state.password && <p className="text-sm text-amber-800 dark:text-amber-300">{t('mail.passwordMissing')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button-primary" disabled={!state.password || fetch.isPending} onClick={() => fetch.mutate()}>
          {t('mail.fetch')}
        </button>
        <button type="button" className="button" onClick={edit}>
          {t('mail.edit')}
        </button>
        <button
          type="button"
          className="button"
          disabled={forget.isPending}
          onClick={() => window.confirm(t('mail.forgetConfirm')) && forget.mutate()}
        >
          {t('mail.forget')}
        </button>
      </div>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

function Form({ state, providers, done }: { state: StateMail; providers: ProviderMail[]; done: (folder: string) => void }) {
  const id = useId();
  const client = useQueryClient();
  const [address, setAddress] = useState(state.user ?? '');
  const provider = useMemo(() => providerOf(address, providers), [address, providers]);
  const [host, setHost] = useState(state.host ?? '');
  const [port, setPort] = useState(state.port ?? 993);
  const [secure, setSecure] = useState(state.port ? state.port === 993 : true);
  const [password, setPassword] = useState('');
  const [folders, setFolders] = useState<string[] | null>(null);
  const [folder, setFolder] = useState(state.folder ?? '');
  const [sinceDays, setSinceDays] = useState(state.sinceDays ?? 14);
  const [markSeen, setMarkSeen] = useState(state.markSeen ?? true);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  // Known provider: its server settings when the address changes to it (the user may change them afterwards).
  // Unknown provider: the settings filled for a previous address are cleared and the server settings open.
  const filled = useRef<string | null>(null);
  const unknown = address.includes('@') && !provider;
  useEffect(() => {
    if (provider) {
      setHost(provider.host);
      setPort(provider.port);
      setSecure(provider.secure);
      filled.current = provider.host;
    } else if (!provider && filled.current) {
      const previous = filled.current;
      setHost((h) => (h === previous ? '' : h));
      filled.current = null;
    }
  }, [provider]);
  useEffect(() => {
    if (unknown) setAdvanced(true);
  }, [unknown]);
  // Another mailbox: its folders must be listed again.
  useEffect(() => setFolders(null), [address, host, port]);

  const sameAccount = state.configured && state.password && address.trim() === state.user && host.trim() === state.host;
  const input = (): InputMail => ({ address: address.trim(), host: host.trim(), port, secure, password: password || undefined, folder, sinceDays, markSeen });
  const list = useMutation({
    mutationFn: () => api.mailFolders(input()),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setFolders(r.folders);
      if (!r.folders.includes(folder)) setFolder(guessFolder(r.folders));
    },
    onError: (e) => setError((e as Error).message),
  });
  const save = useMutation({
    mutationFn: () => api.saveMail(input()),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPassword('');
      client.invalidateQueries({ queryKey: ['mail'] });
      done(folder);
    },
    onError: (e) => setError((e as Error).message),
  });
  const oauth = provider?.auth === 'oauth';
  const canConnect = Boolean(address.trim() && host.trim() && (password || sameAccount) && !oauth);

  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault();
        if (folders && folder) save.mutate();
        else if (canConnect) list.mutate();
      }}
    >
      <h3 className="font-bold">{t('mail.step2Title')}</h3>
      <div>
        <label htmlFor={`${id}-address`} className="label">
          {t('mail.address')}
        </label>
        <input id={`${id}-address`} className="field" type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} />
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
          {address.includes('@') && (provider ? t('mail.provider', { name: provider.name }) : t('mail.providerUnknown'))}{' '}
          {provider?.auth === 'password' && t('mail.plainPassword')}
        </p>
        {provider?.auth === 'app-password' && (
          <div role="note" className="mt-2 flex gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
            <KeyRound className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-semibold">{t('mail.appPassword', { name: provider.name })}</p>
              {provider.help && (
                <a className="button-primary inline-flex items-center gap-1" href={provider.help} target="_blank" rel="noreferrer">
                  {t('mail.appPasswordLink')} <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
        {oauth && (
          <div role="note" className="mt-2 flex gap-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="font-semibold">{t('mail.oauth', { name: provider!.name })}</p>
          </div>
        )}
      </div>
      <details open={advanced} onToggle={(e) => setAdvanced((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm">{t('mail.advanced')}</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <label htmlFor={`${id}-host`} className="label">
              {t('mail.host')}
            </label>
            <input id={`${id}-host`} className="field" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="w-24">
            <label htmlFor={`${id}-port`} className="label">
              {t('mail.port')}
            </label>
            <input id={`${id}-port`} className="field tabular-nums" inputMode="numeric" value={port} onChange={(e) => setPort(Number(e.target.value) || 0)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} /> {t('mail.secure')}
          </label>
        </div>
      </details>
      <div>
        <label htmlFor={`${id}-password`} className="label">
          {t('mail.password')}
        </label>
        <input
          id={`${id}-password`}
          className="field"
          type="password"
          autoComplete="off"
          placeholder={sameAccount ? t('mail.passwordKept') : ''}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('mail.passwordWhere', { backend: t(`mail.backend.${state.backend}` as const) })}</p>
      </div>
      {!folders && (
        <button type="submit" className="button-primary" disabled={!canConnect || list.isPending}>
          {list.isPending ? t('mail.connecting') : t('mail.connect')}
        </button>
      )}
      {folders && (
        <>
          <div>
            <label htmlFor={`${id}-folder`} className="label">
              {t('mail.folder')}
            </label>
            <select id={`${id}-folder`} className="field" value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="" />
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40">
              <label htmlFor={`${id}-since`} className="label">
                {t('mail.sinceDays')}
              </label>
              <input
                id={`${id}-since`}
                className="field tabular-nums"
                inputMode="numeric"
                value={sinceDays}
                onChange={(e) => setSinceDays(Number(e.target.value) || 1)}
                aria-describedby={`${id}-since-help`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={markSeen} onChange={(e) => setMarkSeen(e.target.checked)} /> {t('mail.markSeen')}
            </label>
          </div>
          <p id={`${id}-since-help`} className="text-xs text-slate-600 dark:text-slate-400">
            {t('mail.sinceDaysHelp')}
          </p>
          <button type="submit" className="button-primary" disabled={!folder || save.isPending}>
            {t('mail.save')}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}

export function Mailbox({ close, announce }: { close: () => void; announce: (m: string) => void }) {
  const title = useId();
  const header = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: ['mail'], queryFn: api.mail });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    header.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close]);
  const state = q.data?.state;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/40" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 id={title} ref={header} tabIndex={-1} className="min-w-0 flex-1 text-lg font-bold">
            {t('mail.title')}
          </h2>
          <button type="button" className="button" onClick={close} aria-label={t('mail.close')}>
            <X className="size-4" aria-hidden="true" /> {t('theme.close')}
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {q.isError && <p className="text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
          <p className="text-sm text-slate-700 dark:text-slate-300">{t('mail.intro')}</p>
          {q.data && !q.data.config_file && <p className="text-sm text-amber-800 dark:text-amber-300">{t('mail.noConfigFile')}</p>}
          {state?.configured && !editing && <Status state={state} edit={() => setEditing(true)} />}
          {state && (!state.configured || editing) && (
            <>
              <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="font-bold">{t('mail.step1Title')}</h3>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{t('mail.step1')}</p>
              </section>
              <Form
                state={state}
                providers={q.data!.providers}
                done={(folder) => {
                  setEditing(false);
                  announce(t('mail.saved', { folder }));
                }}
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
