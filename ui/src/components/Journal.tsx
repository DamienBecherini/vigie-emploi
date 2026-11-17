// Journal of the application (dated events, deadlines) and files of the folder, in the detail panel.
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TYPES_EVENT, type Direction, type TypeEvent } from '../../../src/core/statuses.ts';
import { api, urlFile, type DetailOffer, type JournalEvent, type FilesFolder, type EventInput } from '../api.ts';
import { dateShort, number as numberLocal, t, typeShown } from '../i18n/index.ts';

const two = (n: number) => String(n).padStart(2, '0');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** "05/11/2026" or "05/11/2026 à 14 h 30" (English: "05/11/2026 at 14:30"). */
export function dateEvent(at: string): string {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return at;
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  return m[4] ? t('journal.date', { date, hour: t('journal.hour', { h: m[4], m: m[5] }) }) : date;
}

function isFuture(date: string, hour: string): boolean {
  const j = today();
  if (date !== j) return date > j;
  if (!hour) return false;
  const d = new Date();
  return hour > `${two(d.getHours())}:${two(d.getMinutes())}`;
}

function size(o: number): string {
  return o < 1024 ? t('files.bytes', { n: o }) : o < 1024 * 1024 ? t('files.ko', { n: Math.ceil(o / 1024) }) : t('files.mo', { n: numberLocal(o / 1024 / 1024, 1) });
}

/** Short name of a linked file: relative to the application folder when it is inside it. */
function nameFile(path: string, folder: string | null): string {
  const d = folder?.replace(/\/+$/, '');
  return d && path.startsWith(`${d}/`) ? path.slice(d.length + 1) : path;
}

function useFiles(id: number) {
  return useQuery({ queryKey: ['files', id], queryFn: () => api.files(id) });
}

function useRefreshJournal(id: number) {
  const client = useQueryClient();
  return (d: DetailOffer) => {
    client.setQueryData(['offer', id], d);
    client.invalidateQueries({ queryKey: ['offers'] });
    client.invalidateQueries({ queryKey: ['deadlines'] });
    client.invalidateQueries({ queryKey: ['statistics'] });
  };
}

interface Input {
  type: TypeEvent;
  direction: '' | Direction;
  date: string;
  hour: string;
  /** null: automatic (done if the date has passed). */
  done: boolean | null;
  summary: string;
  details: string;
  channel: string;
  contacts: string;
  amount: string;
  unit: string;
  days: string;
  files: string[];
}

function inputOf(e: JournalEvent | null): Input {
  if (!e) {
    return {
      type: 'message',
      direction: 'sent',
      date: today(),
      hour: '',
      done: null,
      summary: '',
      details: '',
      channel: '',
      contacts: '',
      amount: '',
      unit: '',
      days: '',
      files: [],
    };
  }
  return {
    type: e.type,
    direction: e.direction ?? '',
    date: e.at.slice(0, 10),
    hour: e.at.length > 10 ? e.at.slice(11, 16) : '',
    done: e.done,
    summary: e.summary,
    details: e.details ?? '',
    channel: e.channel ?? '',
    contacts: e.contacts ?? '',
    amount: e.amount === null ? '' : String(e.amount).replace('.', ','),
    unit: e.unit ?? '',
    days: e.days === null ? '' : String(e.days).replace('.', ','),
    files: e.files,
  };
}

function number(s: string, name: string): number | null {
  const raw = s.trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(t('journal.numberExpected', { name }));
  return n;
}

function toApi(s: Input): EventInput {
  if (!s.summary.trim()) throw new Error(t('journal.summaryExpected'));
  if (!s.date) throw new Error(t('journal.dateExpected'));
  const empty = (t: string) => t.trim() || null;
  return {
    type: s.type,
    direction: s.direction || null,
    at: s.hour ? `${s.date}T${s.hour}` : s.date,
    done: s.done ?? !isFuture(s.date, s.hour),
    summary: s.summary.trim(),
    details: empty(s.details),
    channel: empty(s.channel),
    contacts: empty(s.contacts),
    amount: number(s.amount, t('journal.amount')),
    unit: empty(s.unit),
    days: number(s.days, t('journal.days')),
    files: s.files,
  };
}

function FormEvent(props: {
  offer: DetailOffer;
  event: JournalEvent | null;
  files: FilesFolder | undefined;
  close: () => void;
}) {
  const database = useId();
  const refresh = useRefreshJournal(props.offer.id);
  const [s, setS] = useState<Input>(() => inputOf(props.event));
  const [error, setError] = useState<string | null>(null);
  const updated = useMutation({
    mutationFn: () => {
      const e = toApi(s);
      return props.event ? api.updateEvent(props.event.id, e) : api.addEvent(props.offer.id, e);
    },
    onSuccess: (d) => {
      refresh(d);
      props.close();
    },
    onError: (e) => setError((e as Error).message),
  });
  const doneAuto = !isFuture(s.date, s.hour);
  const done = s.done ?? doneAuto;
  const available = (props.files?.files ?? []).filter((f) => !s.files.includes(f.path));
  const field = (key: 'channel' | 'contacts' | 'amount' | 'unit' | 'days', label: string, opts: { short?: boolean; placeholder?: string } = {}) => (
    <div className={opts.short ? 'w-28 shrink-0' : 'min-w-40 flex-1'}>
      <label htmlFor={`${database}-${key}`} className="label">
        {label}
      </label>
      <input
        id={`${database}-${key}`}
        className="field"
        inputMode={key === 'amount' || key === 'days' ? 'decimal' : undefined}
        placeholder={opts.placeholder}
        value={s[key]}
        onChange={(e) => setS({ ...s, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-slate-300 p-3 dark:border-slate-600"
      aria-label={props.event ? t('journal.updateEvent') : t('journal.addEvent')}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        updated.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <div className="w-44 shrink-0">
          <label htmlFor={`${database}-type`} className="label">
            {t('journal.type')}
          </label>
          <select
            id={`${database}-type`}
            className="field"
            value={s.type}
            onChange={(e) => {
              const type = e.target.value as TypeEvent;
              setS({ ...s, type, direction: type === 'message' && !s.direction ? 'sent' : type === 'message' || type === 'proposal' ? s.direction : '' });
            }}
          >
            {TYPES_EVENT.map((x) => (
              <option key={x} value={x}>
                {typeShown(x)}
              </option>
            ))}
          </select>
        </div>
        {(s.type === 'message' || s.type === 'proposal') && (
          <div className="w-32 shrink-0">
            <label htmlFor={`${database}-direction`} className="label">
              {t('journal.direction')}
            </label>
            <select id={`${database}-direction`} className="field" value={s.direction} onChange={(e) => setS({ ...s, direction: e.target.value as Input['direction'] })}>
              <option value="">—</option>
              <option value="sent">{t('journal.sent')}</option>
              <option value="received">{t('journal.received')}</option>
            </select>
          </div>
        )}
        <div className="w-40 shrink-0">
          <label htmlFor={`${database}-date`} className="label">
            {t('journal.dateField')}
          </label>
          <input id={`${database}-date`} type="date" className="field" required value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />
        </div>
        <div className="w-28 shrink-0">
          <label htmlFor={`${database}-hour`} className="label">
            {t('journal.hourField')}
          </label>
          <input id={`${database}-hour`} type="time" className="field" value={s.hour} onChange={(e) => setS({ ...s, hour: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor={`${database}-summary`} className="label">
          {t('journal.summary')}
        </label>
        <input
          id={`${database}-summary`}
          className="field"
          required
          placeholder={s.type === 'message' ? t('journal.exampleMessage') : t('journal.exampleOther')}
          value={s.summary}
          onChange={(e) => setS({ ...s, summary: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {field('channel', t('journal.channel'), { placeholder: t('journal.exampleChannel') })}
        {field('contacts', t('journal.contacts'))}
      </div>
      {s.type === 'proposal' && (
        <div className="flex flex-wrap gap-2">
          {field('amount', t('journal.amount'), { short: true, placeholder: t('journal.exampleAmount') })}
          {field('unit', t('journal.unit'), { short: true, placeholder: t('journal.exampleUnit') })}
          {field('days', t('journal.days'), { short: true, placeholder: '6' })}
        </div>
      )}
      <div>
        <label htmlFor={`${database}-details`} className="label">
          {t('journal.details')}
        </label>
        <textarea id={`${database}-details`} className="field min-h-16" value={s.details} onChange={(e) => setS({ ...s, details: e.target.value })} />
      </div>
      <div>
        <label htmlFor={`${database}-file`} className="label">
          {t('journal.filesLinked')}
        </label>
        {s.files.length > 0 && (
          <ul className="mb-1 flex flex-wrap gap-1" aria-label={t('journal.listFiles')}>
            {s.files.map((f) => (
              <li key={f} className="flex items-center gap-1 rounded-full bg-slate-200 py-0.5 pr-1 pl-2 text-xs dark:bg-slate-700">
                {nameFile(f, props.offer.application?.folder ?? null)}
                <button
                  type="button"
                  className="rounded-full px-1 hover:bg-slate-300 dark:hover:bg-slate-600"
                  aria-label={t('journal.remove', { file: f })}
                  onClick={() => setS({ ...s, files: s.files.filter((x) => x !== f) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {props.files?.folder ? (
          <select
            id={`${database}-file`}
            className="field"
            value=""
            disabled={!available.length}
            onChange={(e) => e.target.value && setS({ ...s, files: [...s.files, e.target.value] })}
          >
            <option value="">{available.length ? t('journal.linkFile') : t('journal.noneOther')}</option>
            {available.map((f) => (
              <option key={f.path} value={f.path}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <p id={`${database}-file`} className="text-xs text-slate-600 dark:text-slate-400">
            {t('journal.withoutFolder')}
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-blue-700 dark:accent-blue-400"
          checked={done}
          onChange={(e) => setS({ ...s, done: e.target.checked === doneAuto && !props.event ? null : e.target.checked })}
        />
        {t('journal.done')} {done ? '' : t('journal.deadline')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="button-primary" disabled={updated.isPending}>
          {props.event ? t('common.save') : t('journal.add')}
        </button>
        <button type="button" className="button" onClick={props.close}>
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

const COLORS_TYPES: Record<TypeEvent, string> = {
  message: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  interview: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  test: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  proposal: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  decision: 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-slate-100',
  note: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function BadgeType({ type }: { type: TypeEvent }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${COLORS_TYPES[type]}`}>
      {typeShown(type)}
    </span>
  );
}

function LineEvent({ offer, e, update }: { offer: DetailOffer; e: JournalEvent; update: () => void }) {
  const refresh = useRefreshJournal(offer.id);
  const done = useMutation({ mutationFn: (v: boolean) => api.markDone(e.id, v), onSuccess: refresh });
  const removal = useMutation({ mutationFn: () => api.deleteEvent(e.id), onSuccess: refresh });
  const info = [
    e.channel,
    e.contacts,
    e.amount !== null ? `${numberLocal(e.amount)} ${e.unit ?? ''}`.trim() : null,
    e.days !== null ? t('journal.dayShort', { n: numberLocal(e.days) }) : null,
  ].filter(Boolean);
  const frame = e.overdue
    ? 'border-rose-400 bg-rose-50 dark:border-rose-700 dark:bg-rose-950'
    : e.deadline
      ? 'border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950'
      : 'border-slate-200 dark:border-slate-700';
  return (
    <li className={`rounded-md border p-2 text-sm ${frame}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{dateEvent(e.at)}</span>
        <BadgeType type={e.type} />
        {e.direction && <span className="text-xs text-slate-600 dark:text-slate-300">{e.direction === 'sent' ? t('journal.toSent') : t('journal.toReceived')}</span>}
        {e.overdue && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-xs font-bold text-white dark:bg-rose-400 dark:text-slate-950">{t('journal.overdue')}</span>}
        {e.deadline && !e.overdue && (
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-300 dark:text-slate-950">{t('journal.toDo')}</span>
        )}
      </div>
      <p className="mt-1 break-words">{e.summary}</p>
      {info.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-400">{info.join(' · ')}</p>}
      {e.details && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-400">{t('journal.details')}</summary>
          <p className="mt-1 text-sm whitespace-pre-line">{e.details}</p>
        </details>
      )}
      {e.files.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label={t('journal.listFiles')}>
          {e.files.map((f) => (
            <li key={f}>
              <a className="text-blue-700 underline dark:text-blue-300" href={urlFile(f)} target="_blank" rel="noreferrer noopener">
                {nameFile(f, offer.application?.folder ?? null)}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {e.deadline ? (
          <button type="button" className="button" disabled={done.isPending} onClick={() => done.mutate(true)}>
            {t('journal.markDone')}
          </button>
        ) : (
          <button type="button" className="button" disabled={done.isPending} onClick={() => done.mutate(false)} aria-label={t('journal.reopenLabel', { summary: e.summary })}>
            {t('journal.reopen')}
          </button>
        )}
        <button type="button" className="button" onClick={update} aria-label={t('journal.updateLabel', { summary: e.summary })}>
          {t('journal.update')}
        </button>
        <button
          type="button"
          className="button"
          disabled={removal.isPending}
          aria-label={t('journal.deleteLabel', { summary: e.summary })}
          onClick={() => {
            if (window.confirm(t('journal.confirm', { summary: e.summary }))) removal.mutate();
          }}
        >
          {t('journal.delete')}
        </button>
        <span className="ml-auto self-center text-xs text-slate-500 dark:text-slate-400">{e.origin}</span>
      </div>
    </li>
  );
}

export function Journal({ offer }: { offer: DetailOffer }) {
  const files = useFiles(offer.id);
  const [editing, setEditing] = useState<'new' | number | null>(null);
  const inProgress = typeof editing === 'number' ? (offer.events.find((e) => e.id === editing) ?? null) : null;
  return (
    <div className="space-y-2">
      {editing === 'new' ? (
        <FormEvent offer={offer} event={null} files={files.data} close={() => setEditing(null)} />
      ) : (
        <button type="button" className="button" onClick={() => setEditing('new')}>
          {t('journal.new')}
        </button>
      )}
      {offer.events.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('journal.empty')}</p>
      ) : (
        <ol className="space-y-2" aria-label={t('journal.list')}>
          {offer.events.map((e) =>
            inProgress?.id === e.id ? (
              <li key={e.id}>
                <FormEvent offer={offer} event={e} files={files.data} close={() => setEditing(null)} />
              </li>
            ) : (
              <LineEvent key={e.id} offer={offer} e={e} update={() => setEditing(e.id)} />
            ),
          )}
        </ol>
      )}
    </div>
  );
}

/**
 * Files of the application folder. `withoutPath`: displayed under the "Folder" line of the application, which already
 * shows the folder (neither a repeated path, nor a message when the offer has no folder).
 */
export function FilesOfFolder({ offer, withoutPath = false }: { offer: DetailOffer; withoutPath?: boolean }) {
  const q = useFiles(offer.id);
  if (q.isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('files.loading')}</p>;
  if (q.isError) return <p className="text-sm text-rose-700 dark:text-rose-300">{(q.error as Error).message}</p>;
  const f = q.data!;
  if (!f.folder) return withoutPath ? null : <p className="text-sm text-slate-600 dark:text-slate-400">{t('files.withoutFolder')}</p>;
  if (!f.exists) return <p className="text-sm text-slate-600 dark:text-slate-400">{t('files.notFound', { folder: f.folder })}</p>;
  return (
    <div>
      {!withoutPath && <p className="mb-1 text-xs text-slate-600 dark:text-slate-400">{f.folder}</p>}
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
        {f.files.map((x) => (
          <li key={x.path} className="flex flex-wrap items-baseline gap-x-3 px-2 py-1">
            <a className="min-w-0 flex-1 break-all text-blue-700 underline dark:text-blue-300" href={urlFile(x.path)} target="_blank" rel="noreferrer noopener">
              {x.name}
            </a>
            <span className="text-xs text-slate-600 tabular-nums dark:text-slate-400">
              {size(x.size)} · {dateShort(new Date(x.modified_at))}
            </span>
          </li>
        ))}
        {!f.files.length && <li className="px-2 py-1 text-slate-600 dark:text-slate-400">{t('files.empty')}</li>}
      </ul>
      {f.truncated && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t('files.truncated')}</p>}
    </div>
  );
}
