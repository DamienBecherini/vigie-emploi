import { ExternalLink, FolderOpen, Send, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STATUSES, type Status } from '../../../src/core/statuses.ts';
import { compensationShown, statusShown, t } from '../i18n/index.ts';
import { api, urlFile, type DetailOffer } from '../api.ts';
import { queryKeys } from '../queryKeys.ts';
import { BadgeScore, BadgeStatus, formatDate, formatScore } from './Badges.tsx';
import { FolderFiles, Journal } from './Journal.tsx';
import { BadgeOldRubric, BreakdownScore, EditorSubScores } from './Breakdown.tsx';

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-0.5 text-sm">
      <dt className="font-semibold text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/**
 * CV of the application: link that opens it in a new tab (served by /api/file, only inside the data
 * folder). An absolute path or one outside the workspace is not served: it stays displayed as text.
 */
function LinkCv({ path }: { path: string }) {
  const relative = path.replace(/\\/g, '/');
  if (/^([a-z]:|\/)/i.test(relative) || relative.split('/').includes('..')) return <>{path}</>;
  const name = relative.split('/').pop() ?? relative;
  return (
    <a className="break-all text-blue-700 underline dark:text-blue-300" href={urlFile(relative)} target="_blank" rel="noreferrer noopener" title={relative}>
      {name}
    </a>
  );
}

/**
 * Folder of the application.
 * - On the server's machine (local_machine, also checked by the server): icon + folder name, which opens it in
 *   the file explorer.
 * - Elsewhere (phone, other computer): link to its sheet (dossier-candidature.md, otherwise the first .md of the folder),
 *   displayed formatted by /api/file; without a sheet, the path as text (the files are listed below).
 */
function LinkFolder({ offerId, folder }: { offerId: number; folder: string }) {
  const q = useQuery({ queryKey: queryKeys.files(offerId), queryFn: () => api.files(offerId) });
  const health = useQuery({ queryKey: queryKeys.health(), queryFn: api.health, staleTime: Infinity });
  const open = useMutation({ mutationFn: () => api.openFolder(offerId) });
  const md = q.data?.files ?? [];
  const sheet = md.find((f) => f.name === 'dossier-candidature.md') ?? md.find((f) => f.name.toLowerCase().endsWith('.md'));
  const name = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? folder;
  const link = 'break-all text-blue-700 underline dark:text-blue-300';
  if (health.data?.local_machine && q.data?.exists) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-left ${link}`}
          onClick={() => open.mutate()}
          disabled={open.isPending}
          title={`${t('detail.openFolder')} : ${folder}`}
        >
          <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
          {name}
        </button>
        {open.isError && <span className="text-xs text-rose-700 dark:text-rose-300">{(open.error as Error).message}</span>}
      </span>
    );
  }
  if (!sheet) return <span className="break-all">{folder}</span>;
  return (
    <a className={link} href={urlFile(sheet.path)} target="_blank" rel="noreferrer noopener" title={sheet.path}>
      {name}
    </a>
  );
}

function EditorTags({ offer }: { offer: DetailOffer }) {
  const client = useQueryClient();
  const id = useId();
  const [input, setInput] = useState('');
  const updated = useMutation({
    mutationFn: (tags: string[]) => api.tags(offer.id, tags),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.offer(offer.id) });
      client.invalidateQueries({ queryKey: queryKeys.offers() });
      client.invalidateQueries({ queryKey: queryKeys.meta() });
    },
  });
  const add = () => {
    const newItems = input
      .split(/[,\s]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (!newItems.length) return;
    updated.mutate([...new Set([...offer.tags, ...newItems])]);
    setInput('');
  };
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-1" aria-label={t('tags.list')}>
        {offer.tags.length === 0 && <li className="text-sm text-slate-500 dark:text-slate-400">{t('tags.none')}</li>}
        {offer.tags.map((x) => (
          <li key={x} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
            {x}
            <button
              type="button"
              className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
              aria-label={t('tags.remove', { tag: x })}
              onClick={() => updated.mutate(offer.tags.filter((y) => y !== x))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor={id} className="sr-only">
          {t('tags.addLabel')}
        </label>
        <input id={id} className="field" placeholder={t('tags.new')} value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="button">
          {t('tags.add')}
        </button>
      </form>
    </div>
  );
}

function EditorLink({ offer }: { offer: DetailOffer }) {
  const client = useQueryClient();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(offer.canonical_url ?? '');
  const updated = useMutation({
    mutationFn: (url: string | null) => api.link(offer.id, url),
    onSuccess: () => {
      setEditing(false);
      client.invalidateQueries({ queryKey: queryKeys.offer(offer.id) });
      client.invalidateQueries({ queryKey: queryKeys.offers() });
    },
  });
  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {offer.canonical_url ? (
          <a className="break-all text-blue-700 underline dark:text-blue-300" href={offer.canonical_url} target="_blank" rel="noreferrer noopener">
            {offer.canonical_url}
          </a>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">{t('link.none')}</span>
        )}
        <button
          type="button"
          className="button"
          onClick={() => {
            setInput(offer.canonical_url ?? '');
            setEditing(true);
          }}
        >
          {offer.canonical_url ? t('link.update') : t('link.add')}
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        updated.mutate(input.trim() || null);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t('link.label')}
      </label>
      <input
        id={id}
        className="field min-w-0 flex-1"
        type="url"
        placeholder="https://…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: the field has just been opened by the "edit" button
        autoFocus
      />
      <button type="submit" className="button">
        {t('common.save')}
      </button>
      <button type="button" className="button" onClick={() => setEditing(false)}>
        {t('common.cancel')}
      </button>
      {updated.isError && <p className="w-full text-sm text-rose-700 dark:text-rose-300">{(updated.error as Error).message}</p>}
    </form>
  );
}

/** "6,5" or "6.5" → 6.5; empty → null; invalid text → NaN (refused before sending). */
function readNumber(s: string): number | null {
  const t = s.trim().replace(',', '.');
  return t === '' ? null : Number(t);
}

function useRefresh(id: number) {
  const client = useQueryClient();
  return (d: DetailOffer) => {
    client.setQueryData(queryKeys.offer(id), d);
    client.invalidateQueries({ queryKey: queryKeys.offers() });
    client.invalidateQueries({ queryKey: queryKeys.meta() });
  };
}

/** Entry or correction of the score: adds an entry to the history (origin "interface"). */
function EditorScore({ offer }: { offer: DetailOffer }) {
  const n = offer.scores[0];
  const database = useId();
  const refresh = useRefresh(offer.id);
  const [editing, setEditing] = useState(false);
  const initial = () => ({
    score: n?.score === null || n?.score === undefined ? '' : formatScore(n.score),
    raw_score: n?.raw_score === null || n?.raw_score === undefined ? '' : formatScore(n.raw_score),
    penalties: n?.penalties ?? '',
    fit: n?.fit ?? '',
    gaps: n?.gaps ?? '',
  });
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const updated = useMutation({
    mutationFn: () => {
      const score = readNumber(s.score);
      const raw = readNumber(s.raw_score);
      for (const [name, v] of [
        [t('score.outOf10'), score],
        [t('score.raw'), raw],
      ] as const) {
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10)) throw new Error(t('score.number', { name }));
      }
      if (score === null) throw new Error(t('score.finaleExpected'));
      return api.score(offer.id, { score, raw_score: raw, penalties: s.penalties, fit: s.fit, gaps: s.gaps });
    },
    onSuccess: (d) => {
      refresh(d);
      setEditing(false);
      setError(null);
    },
    onError: (e) => setError((e as Error).message),
  });
  if (!editing) {
    return (
      <button
        type="button"
        className="button mt-2"
        onClick={() => {
          setS(initial());
          setError(null);
          setEditing(true);
        }}
      >
        {n ? t('score.overallOld') : t('score.overall')}
      </button>
    );
  }
  const field = (key: keyof ReturnType<typeof initial>, label: string, opts: { short?: boolean; long?: boolean } = {}) => (
    <div className={opts.short ? 'w-28 shrink-0' : 'w-full'}>
      <label htmlFor={`${database}-${key}`} className="label">
        {label}
      </label>
      {opts.long ? (
        <textarea id={`${database}-${key}`} className="field min-h-16" value={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
      ) : (
        <input
          id={`${database}-${key}`}
          className="field"
          inputMode={opts.short ? 'decimal' : undefined}
          value={s[key]}
          onChange={(e) => setS({ ...s, [key]: e.target.value })}
        />
      )}
    </div>
  );
  return (
    <form
      className="mt-2 flex flex-col gap-2 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label={t('score.input')}
      onSubmit={(e) => {
        e.preventDefault();
        updated.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        {field('score', t('score.outOf10'), { short: true })}
        {field('raw_score', t('score.raw'), { short: true })}
        <div className="min-w-40 flex-1">{field('penalties', t('score.penalties'))}</div>
      </div>
      {field('fit', t('score.fit'), { long: true })}
      {field('gaps', t('score.gaps'), { long: true })}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="button-primary" disabled={updated.isPending}>
          {t('score.save')}
        </button>
        <button type="button" className="button" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
        {error && (
          <span role="alert" className="text-sm text-rose-700 dark:text-rose-300">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

type InputTracker = { next_action: string; sent_at: string; channel: string };

function trackerInitial(offer: DetailOffer): InputTracker {
  const c = offer.application;
  return {
    next_action: c?.next_action ?? '',
    sent_at: c?.sent_at ? formatDate(c.sent_at) : '',
    channel: c?.channel ?? '',
  };
}

/** Tracking of the application: next action, sending date, channel. */
function EditorApplication({ offer }: { offer: DetailOffer }) {
  const database = useId();
  const refresh = useRefresh(offer.id);
  const initial = trackerInitial(offer);
  const [s, setS] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const key = JSON.stringify(initial);
  useEffect(() => setS(JSON.parse(key) as InputTracker), [key]);
  const updated = useMutation({
    mutationFn: () => {
      // Only what changed: an unchanged sending date does not move the offer to "sent" again.
      const fields: Record<string, string | null> = {};
      for (const k of ['next_action', 'sent_at', 'channel'] as const) {
        if (s[k].trim() !== initial[k].trim()) fields[k] = s[k].trim() || null;
      }
      return api.application(offer.id, fields);
    },
    onSuccess: (d) => {
      refresh(d);
      setMessage(t('application.saved'));
    },
    onError: (e) => setMessage((e as Error).message),
  });
  const modified = JSON.stringify(s) !== key;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        updated.mutate();
      }}
    >
      <div>
        <label htmlFor={`${database}-action`} className="label">
          {t('application.nextAction')}
        </label>
        <textarea
          id={`${database}-action`}
          className="field min-h-16"
          placeholder={t('application.nextExample')}
          value={s.next_action}
          onChange={(e) => setS({ ...s, next_action: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={`${database}-send`} className="label">
            {t('application.sentAt')}
          </label>
          <input
            id={`${database}-send`}
            className="field"
            placeholder={t('application.formatDate')}
            value={s.sent_at}
            onChange={(e) => setS({ ...s, sent_at: e.target.value })}
            aria-describedby={`${database}-help-send`}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor={`${database}-channel`} className="label">
            {t('application.channel')}
          </label>
          <input id={`${database}-channel`} className="field" value={s.channel} onChange={(e) => setS({ ...s, channel: e.target.value })} />
        </div>
      </div>
      <p id={`${database}-help-send`} className="text-xs text-slate-600 dark:text-slate-400">
        {t('application.help')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="button" disabled={updated.isPending || !modified}>
          {t('application.save')}
        </button>
        {message && (
          <span role="status" className="text-sm text-slate-700 dark:text-slate-300">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

function ChangeStatus({ offer }: { offer: DetailOffer }) {
  const client = useQueryClient();
  const idStatus = useId();
  const idCom = useId();
  const [status, setStatus] = useState<Status>(offer.status);
  const [comment, setComment] = useState('');
  useEffect(() => setStatus(offer.status), [offer.status]);
  const updated = useMutation({
    mutationFn: () => api.status(offer.id, status, comment),
    onSuccess: (d) => {
      client.setQueryData(queryKeys.offer(offer.id), d);
      client.invalidateQueries({ queryKey: queryKeys.offers() });
      client.invalidateQueries({ queryKey: queryKeys.meta() });
      setComment('');
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        updated.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40 shrink-0">
          <label htmlFor={idStatus} className="label">
            {t('detail.newStatus')}
          </label>
          <select id={idStatus} className="field" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusShown(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={idCom} className="label">
            {t('detail.comment')}
          </label>
          <input id={idCom} className="field" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <button type="submit" className="button" disabled={updated.isPending}>
          {t('detail.saveStatus')}
        </button>
      </div>
      {updated.isError && <span className="text-sm text-rose-700 dark:text-rose-300">{(updated.error as Error).message}</span>}
    </form>
  );
}

function ButtonApply({ offer, announce }: { offer: DetailOffer; announce: (m: string) => void }) {
  const client = useQueryClient();
  const updated = useMutation({
    mutationFn: () => api.apply(offer.id),
    onSuccess: async (r) => {
      client.setQueryData(queryKeys.offer(offer.id), r.offer);
      client.invalidateQueries({ queryKey: queryKeys.offers() });
      client.invalidateQueries({ queryKey: queryKeys.meta() });
      try {
        await navigator.clipboard.writeText(r.command);
        announce(t('detail.copy', { command: r.command }));
      } catch {
        announce(t('detail.copyImpossible', { command: r.command }));
      }
    },
    onError: (e) => announce((e as Error).message),
  });
  return (
    <button type="button" className="button-primary" onClick={() => updated.mutate()} disabled={updated.isPending}>
      <Send className="size-4" aria-hidden="true" /> {t('detail.apply')}
    </button>
  );
}

export function Detail({ id, close, announce }: { id: number; close: () => void; announce: (m: string) => void }) {
  const title = useId();
  const header = useRef<HTMLHeadingElement>(null);
  const q = useQuery({ queryKey: queryKeys.offer(id), queryFn: () => api.offer(id) });
  // biome-ignore lint/correctness/useExhaustiveDependencies: id is the trigger: another offer is shown, focus goes back to its title
  useEffect(() => {
    header.current?.focus({ preventScroll: true });
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  // A click outside the panel closes it, except on a line of the table (which opens another offer),
  // in a drop-down menu or in a modal window opened on top of it (settings).
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (e.button !== 0 || !target?.isConnected || panel.current?.contains(target)) return;
      if (target.closest('tbody tr, details[data-menu], [aria-modal="true"]')) return;
      close();
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [close]);
  const o = q.data;
  const n = o?.scores[0];
  return (
    <aside
      ref={panel}
      aria-labelledby={title}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-2xl flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <h2 id={title} ref={header} tabIndex={-1} className="text-lg leading-snug font-bold">
            {o ? o.title || t('list.withoutTitle') : t('detail.loading')}
          </h2>
          {o && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              {o.company && <span className="font-semibold">{o.company}</span>}
              <BadgeStatus status={o.status} />
              <BadgeScore score={o.score} />
              <span className="text-slate-500 dark:text-slate-400">#{o.id}</span>
            </p>
          )}
        </div>
        <button type="button" className="button" onClick={close} aria-label={t('detail.closeEscape')}>
          <X className="size-4" aria-hidden="true" /> {t('detail.close')}
        </button>
      </div>
      {q.isError && <p className="p-4 text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>}
      {o && (
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex flex-wrap gap-2">
            <ButtonApply offer={o} announce={announce} />
            {o.canonical_url && (
              <a className="button" href={o.canonical_url} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-4" aria-hidden="true" /> {t('detail.openOffer')}
              </a>
            )}
          </div>
          <section aria-labelledby={`${title}-status`}>
            <h3 id={`${title}-status`} className="mb-2 font-bold">
              {t('detail.status')}
            </h3>
            <ChangeStatus offer={o} />
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-slate-600 dark:text-slate-400">{t('detail.history', { n: o.statuses.length })}</summary>
              <ol className="mt-2 space-y-1 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
                {o.statuses.map((s) => (
                  <li key={s.id}>
                    <span className="text-slate-600 tabular-nums dark:text-slate-400">{formatDate(s.at.slice(0, 10))}</span> <BadgeStatus status={s.status} />{' '}
                    {s.comment && <span className="break-words">{s.comment}</span>}
                  </li>
                ))}
                {!o.statuses.length && <li className="text-slate-500 dark:text-slate-400">{t('detail.noneHistory')}</li>}
              </ol>
            </details>
          </section>
          <dl>
            <Line label={t('detail.link')}>
              <EditorLink key={o.id} offer={o} />
            </Line>
            <Line label={t('detail.location')}>{o.location}</Line>
            <Line label={t('detail.contract')}>{o.contract}</Line>
            <Line label={t('detail.compensation')}>{compensationShown(o.compensation)}</Line>
            <Line label={t('detail.remote')}>{o.remote}</Line>
            <Line label={t('detail.stack')}>{o.stack}</Line>
            <Line label={t('detail.source')}>{`${o.source} · ${o.site_id}`}</Line>
            <Line label={t('detail.receivedAt')}>{formatDate(o.received_at)}</Line>
            <Line label={t('detail.publishedAt')}>{o.published_at ? formatDate(o.published_at) : null}</Line>
          </dl>

          <section aria-labelledby={`${title}-score`}>
            <h3 id={`${title}-score`} className="mb-2 font-bold">
              {t('detail.score')}
            </h3>
            {n ? (
              <div className="space-y-1 rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <p className="flex flex-wrap items-center gap-x-2">
                  <strong>{formatScore(n.score)}/10</strong>
                  {n.breakdown ? null : (
                    <>
                      <BadgeOldRubric />
                      {n.raw_score !== null && <span>{t('detail.raw', { score: formatScore(n.raw_score) })}</span>}
                      {n.penalties && <span>{t('detail.penalties', { text: n.penalties })}</span>}
                    </>
                  )}
                  <span className="text-slate-600 dark:text-slate-400">
                    {formatDate(n.scored_at)} ({n.origin})
                  </span>
                </p>
                {n.breakdown && <BreakdownScore score={n} />}
                {n.fit && (
                  <p>
                    <span className="font-semibold">{t('detail.fit')}</span>
                    {n.fit}
                  </p>
                )}
                {n.gaps && (
                  <p>
                    <span className="font-semibold">{t('detail.gaps')}</span>
                    {n.gaps}
                  </p>
                )}
                {o.scores.length > 1 && <p className="text-slate-600 dark:text-slate-400">{t('detail.previous', { n: o.scores.length - 1 })}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">{t('detail.notScored')}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <EditorSubScores key={`sn-${o.id}`} offer={o} />
              <EditorScore key={o.id} offer={o} />
            </div>
          </section>

          <section aria-labelledby={`${title}-application`}>
            <h3 id={`${title}-application`} className="mb-2 font-bold">
              {t('detail.application')}
            </h3>
            {o.application && (
              <dl className="mb-2">
                {/* Folder and its files together: link (or opening in the explorer), then the list of the files. */}
                <Line label={t('detail.folder')}>
                  {o.application.folder && (
                    <div className="space-y-1.5">
                      <LinkFolder offerId={o.id} folder={o.application.folder} />
                      <FolderFiles offer={o} withoutPath />
                    </div>
                  )}
                </Line>
                <Line label={t('detail.cv')}>{o.application.cv && <LinkCv path={o.application.cv} />}</Line>
                <Line label={t('detail.conditions')}>{o.application.conditions}</Line>
              </dl>
            )}
            <EditorApplication key={o.id} offer={o} />
          </section>

          <section aria-labelledby={`${title}-journal`}>
            <h3 id={`${title}-journal`} className="mb-2 font-bold">
              {t('detail.journal')}{' '}
              {o.events.some((e) => e.overdue) && (
                <span className="ml-1 rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">
                  {t('detail.overdue', { n: o.events.filter((e) => e.overdue).length })}
                </span>
              )}
            </h3>
            <Journal key={o.id} offer={o} />
          </section>

          <section aria-labelledby={`${title}-tags`}>
            <h3 id={`${title}-tags`} className="mb-2 font-bold">
              {t('detail.tags')}
            </h3>
            <EditorTags offer={o} />
          </section>

          <section aria-labelledby={`${title}-desc`}>
            <h3 id={`${title}-desc`} className="mb-2 font-bold">
              {t('detail.description')}
            </h3>
            {o.description ? (
              <div className="text-sm leading-relaxed whitespace-pre-line">{o.description}</div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {o.canonical_url ? t('detail.withoutDescriptionLink') : t('detail.withoutDescription')}
              </p>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
