// Client of the local API. The types of the JSON come from the server (type-only imports: nothing of src/ reaches
// the bundle), so a field changed on the server is reported here by the typecheck. Where a route adds or drops fields,
// its type is built from the server's ones below. Only the inline answers of the `api` object (ok, tags, command…)
// are still written by hand.
import type { Status } from '../../src/core/statuses.ts';
import type { Breakdown, Rubric, Input } from '../../src/core/rubric.ts';
import type { LineList, ResultList, Meta as MetaQueries } from '../../src/core/queries.ts';
import type { Score, LineStatus, DetailOffer, Application, FieldsApplication } from '../../src/core/offers.ts';
import type { EventJournal, DeadlineOffer, Deadlines, EventInput } from '../../src/core/events.ts';
import type { FileFolder, FilesFolder } from '../../src/core/files.ts';
import type { Statistics } from '../../src/core/statistics.ts';
import type { InfoVersion, ChangeScore, Impact } from '../../src/core/rubric-storage.ts';
import type { InputSubScores } from '../../src/core/actions.ts';
import type { InputBatch } from '../../src/core/scoring.ts';
import type { OfferToPrepare, StateWork, ActionAgent } from '../../src/api/work.ts';
import type { ReplyRubric as ReplyRubricFound, ReplyNoRubric } from '../../src/api/server.ts';
import type { Body as InputMail } from '../../src/api/mail.ts';
import type { SecretBackend } from '../../src/mail/secret.ts';
import type { MailState as StateMail } from '../../src/mail/settings.ts';
import type { Provider } from '../../src/mail/providers.ts';
import type { MailErrorKind } from '../../src/mail/fetch.ts';
import { t } from './i18n/index.ts';

export type { Breakdown, Rubric, Input };
export type { Score, LineStatus, DetailOffer, Application, ResultList };
export type { DeadlineOffer, Deadlines, EventInput, FileFolder, FilesFolder, Statistics };
export type { InfoVersion, ChangeScore, Impact, InputSubScores };
export type { OfferToPrepare, StateWork, ActionAgent, SecretBackend, StateMail, InputMail };

/** Line of the offer list. */
export type LineOffer = LineList;

/** Journal event, with its deadline state (detail of an offer). */
export type JournalEvent = EventJournal;

/** GET /api/meta: values present in the database, plus the possible statuses. */
export type Meta = MetaQueries & { possibleStatuses: Status[] };

/** POST /api/offers/:id/score: the fields the route reads from the body. */
export type InputScore = Pick<InputBatch, 'score' | 'raw_score' | 'penalties' | 'fit' | 'gaps'>;

/** PUT /api/offers/:id/application: the application fields the interface may change (not state nor label). */
export type InputApplication = Omit<FieldsApplication, 'state' | 'label'>;

/** GET /api/rubric. */
export type ReplyRubric = ReplyRubricFound | ReplyNoRubric;

/** Answer of PUT /api/rubric and POST /api/rubric/restore (a version always exists after them). */
export type ReplySavedRubric = ReplyRubricFound & { ok: true; impact: Impact };

/** Mail provider as GET /api/mail sends it. */
export type ProviderMail = Pick<Provider, 'id' | 'name' | 'host' | 'port' | 'secure' | 'auth' | 'help' | 'domains'>;

/** Mailbox operations answer ok: false (with a message for the user) instead of an HTTP error. */
export type ReplyMail<T> = ({ ok: true } & T) | { ok: false; kind: MailErrorKind; error: string };

/** URL to read a file of the data folder (each segment encoded). */
export function urlFile(path: string): string {
  return `/api/file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error ?? t('api.error', { status: r.status }));
  return body;
}

export const api = {
  offers: (params: URLSearchParams) => call<ResultList>(`/api/offers?${params.toString()}`),
  offer: (id: number) => call<DetailOffer>(`/api/offers/${id}`),
  meta: () => call<Meta>('/api/meta'),
  status: (id: number, status: Status, comment: string) =>
    call<DetailOffer>(`/api/offers/${id}/status`, { method: 'POST', body: JSON.stringify({ status, comment }) }),
  tags: (id: number, tags: string[]) => call<{ tags: string[] }>(`/api/offers/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  link: (id: number, url: string | null) => call<DetailOffer>(`/api/offers/${id}/link`, { method: 'PUT', body: JSON.stringify({ url }) }),
  score: (id: number, n: InputScore) => call<DetailOffer>(`/api/offers/${id}/score`, { method: 'POST', body: JSON.stringify(n) }),
  application: (id: number, c: InputApplication) => call<DetailOffer>(`/api/offers/${id}/application`, { method: 'PUT', body: JSON.stringify(c) }),
  addEvent: (id: number, e: EventInput) => call<DetailOffer>(`/api/offers/${id}/events`, { method: 'POST', body: JSON.stringify(e) }),
  updateEvent: (id: number, e: EventInput) => call<DetailOffer>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  markDone: (id: number, done: boolean) => call<DetailOffer>(`/api/events/${id}/done`, { method: 'POST', body: JSON.stringify({ done }) }),
  deleteEvent: (id: number) => call<DetailOffer>(`/api/events/${id}`, { method: 'DELETE' }),
  deadlines: (days = 7) => call<Deadlines>(`/api/deadlines?days=${days}`),
  files: (id: number) => call<FilesFolder>(`/api/offers/${id}/files`),
  statistics: () => call<Statistics>('/api/statistics'),
  subScores: (id: number, s: InputSubScores) => call<DetailOffer>(`/api/offers/${id}/sub-scores`, { method: 'PUT', body: JSON.stringify(s) }),
  rubric: () => call<ReplyRubric>('/api/rubric'),
  previewRubric: (rubric: Rubric) => call<Impact>('/api/rubric/preview', { method: 'POST', body: JSON.stringify({ rubric }) }),
  saveRubric: (rubric: Rubric, summary: string) => call<ReplySavedRubric>('/api/rubric', { method: 'PUT', body: JSON.stringify({ rubric, summary }) }),
  historyRubric: () => call<InfoVersion[]>('/api/rubric/history'),
  restoreRubric: (version: number) => call<ReplySavedRubric>('/api/rubric/restore', { method: 'POST', body: JSON.stringify({ version }) }),
  apply: (id: number) => call<{ command: string; offer: DetailOffer }>(`/api/offers/${id}/apply`, { method: 'POST' }),
  work: () => call<StateWork>('/api/work'),
  mail: () => call<{ ok: true; state: StateMail; config_file: boolean; providers: ProviderMail[] }>('/api/mail'),
  mailFolders: (m: InputMail) => call<ReplyMail<{ folders: string[] }>>('/api/mail/folders', { method: 'POST', body: JSON.stringify(m) }),
  saveMail: (m: InputMail) => call<ReplyMail<{ state: StateMail }>>('/api/mail', { method: 'PUT', body: JSON.stringify(m) }),
  forgetMail: () => call<{ ok: true }>('/api/mail', { method: 'DELETE' }),
  fetchMail: () => call<ReplyMail<{ fetched: number; more: boolean; folder: string }>>('/api/mail/fetch', { method: 'POST', body: '{}' }),
  launchAgent: (action: ActionAgent) => call<{ ok: true }>(`/api/work/${action}`, { method: 'POST', body: '{}' }),
  /** local_machine: the page is open on the server's machine (opening a folder in the explorer is then possible). */
  health: () => call<{ local_machine?: boolean }>('/api/health'),
  openFolder: (id: number) => call<{ ok: true }>(`/api/offers/${id}/open-folder`, { method: 'POST', body: '{}' }),
};
