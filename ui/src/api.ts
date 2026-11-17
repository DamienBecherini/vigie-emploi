// Client of the local API (same types as the server, copied here to keep the interface standalone).
import type { Direction, Status, TypeEvent } from '../../src/core/statuses.ts';
import type { Breakdown, Inputs, Rubric, Input } from '../../src/core/rubric.ts';
import { t } from './i18n/index.ts';

export type { Breakdown, Rubric, Input };

export interface LineOffer {
  id: number;
  source: string;
  site_id: string;
  canonical_url: string | null;
  title: string;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_unit: string | null;
  remote: string | null;
  published_at: string | null;
  received_at: string | null;
  stack: string | null;
  origin: string;
  status: Status;
  score: number | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  has_description: boolean;
}

export interface ResultList {
  total: number;
  page: number;
  size: number;
  pages: number;
  offers: LineOffer[];
}

export interface Score {
  id: number;
  raw_score: number | null;
  penalties: string | null;
  score: number | null;
  fit: string | null;
  gaps: string | null;
  read: boolean;
  rubric_version: string | null;
  origin: string;
  scored_at: string;
  exact_score: number | null;
  input: Input | null;
  breakdown: Breakdown | null;
  recalculated_at: string | null;
}

export interface LineStatus {
  id: number;
  status: Status;
  comment: string | null;
  origin: string;
  at: string;
}

export interface DetailOffer extends Omit<LineOffer, 'has_description'> {
  description: string | null;
  scores: Score[];
  statuses: LineStatus[];
  application: Application | null;
  events: JournalEvent[];
}

export interface JournalEvent {
  id: number;
  offer_id: number;
  type: TypeEvent;
  direction: Direction | null;
  /** YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time). */
  at: string;
  done: boolean;
  summary: string;
  details: string | null;
  channel: string | null;
  contacts: string | null;
  amount: number | null;
  unit: string | null;
  days: number | null;
  files: string[];
  origin: string;
  created_at: string;
  updated_at: string | null;
  deadline: boolean;
  overdue: boolean;
}

export interface DeadlineOffer extends JournalEvent {
  title: string;
  company: string | null;
  status: Status;
}

export interface Deadlines {
  today: string;
  until: string;
  overdue: DeadlineOffer[];
  upcoming: DeadlineOffer[];
}

export interface FileFolder {
  path: string;
  name: string;
  size: number;
  modified_at: string;
}

export interface FilesFolder {
  offer_id: number;
  folder: string | null;
  exists: boolean;
  files: FileFolder[];
  truncated: boolean;
}

export interface Statistics {
  sent: number;
  replies: number;
  interviews: number;
  proposals: number;
  average_reply_days: number | null;
  reply_sample_size: number;
}

/** Input of an event: null clears an optional field (update). */
export interface EventInput {
  type: TypeEvent;
  direction: Direction | null;
  at: string;
  done: boolean;
  summary: string;
  details: string | null;
  channel: string | null;
  contacts: string | null;
  amount: number | null;
  unit: string | null;
  days: number | null;
  files: string[];
}

/** URL to read a file of the data folder (each segment encoded). */
export function urlFile(path: string): string {
  return `/api/file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export interface Application {
  folder: string | null;
  cv: string | null;
  sent_at: string | null;
  channel: string | null;
  message: string | null;
  next_action: string | null;
  next_action_origin: string | null;
  label: string | null;
  conditions: string | null;
  state: string | null;
  updated_at: string | null;
}

export interface InputScore {
  score: number | null;
  raw_score: number | null;
  penalties: string;
  fit: string;
  gaps: string;
}

export type InputApplication = Partial<Record<'next_action' | 'sent_at' | 'channel' | 'folder' | 'cv' | 'conditions', string | null>>;

export interface InfoVersion {
  version: number;
  at: string;
  author: 'interface' | 'cli' | 'mcp' | 'file';
  summary: string;
}

export interface ReplyRubric {
  version: number | null;
  at?: string;
  author?: InfoVersion['author'];
  summary?: string;
  rubric: Rubric | null;
  examples: Breakdown[];
}

export interface ChangeScore {
  id: number;
  title: string;
  company: string | null;
  before: number | null;
  after: number;
}

export interface Impact {
  offers_recalculated: number;
  changed: number;
  threshold_before: number | null;
  threshold_after: number;
  rising: ChangeScore[];
  falling: ChangeScore[];
  changes: ChangeScore[];
}

export interface InputSubScores {
  criteria?: Record<string, { score: number; justification?: string | null } | null>;
  inputs?: { [K in keyof Inputs]?: Inputs[K] | null };
  blockers?: string[];
}

export interface Meta {
  total: number;
  statuses: { value: string; n: number }[];
  sources: { value: string; n: number }[];
  tags: { value: string; n: number }[];
  contracts: { value: string; n: number }[];
}

export interface OfferToPrepare {
  id: number;
  title: string;
  company: string | null;
}

/** Pending work for the agent: e-mails to sort, offers in "go" without a folder. */
export interface StateWork {
  emails: number;
  go_to_prepare: OfferToPrepare[];
}

export type ActionAgent = 'process-emails' | 'prepare-go';

export type SecretBackend = 'environment' | 'dpapi' | 'keychain' | 'secret-service' | 'file';

export interface StateMail {
  configured: boolean;
  user: string | null;
  host: string | null;
  port: number | null;
  folder: string | null;
  sinceDays: number | null;
  markSeen: boolean | null;
  password: boolean;
  backend: SecretBackend;
  fetched_at: string | null;
}

export interface ProviderMail {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  auth: 'password' | 'app-password' | 'oauth';
  help?: string;
  domains: string[];
}

export interface InputMail {
  address: string;
  host: string;
  port: number;
  secure: boolean;
  password?: string;
  folder?: string;
  sinceDays?: number;
  markSeen?: boolean;
}

/** Mailbox operations answer ok: false (with a message for the user) instead of an HTTP error. */
export type ReplyMail<T> = ({ ok: true } & T) | { ok: false; kind: string; error: string };

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
  tags: (id: number, tags: string[]) =>
    call<{ tags: string[] }>(`/api/offers/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  link: (id: number, url: string | null) =>
    call<DetailOffer>(`/api/offers/${id}/link`, { method: 'PUT', body: JSON.stringify({ url }) }),
  score: (id: number, n: InputScore) =>
    call<DetailOffer>(`/api/offers/${id}/score`, { method: 'POST', body: JSON.stringify(n) }),
  application: (id: number, c: InputApplication) =>
    call<DetailOffer>(`/api/offers/${id}/application`, { method: 'PUT', body: JSON.stringify(c) }),
  addEvent: (id: number, e: EventInput) =>
    call<DetailOffer>(`/api/offers/${id}/events`, { method: 'POST', body: JSON.stringify(e) }),
  updateEvent: (id: number, e: Partial<EventInput>) =>
    call<DetailOffer>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(e) }),
  markDone: (id: number, done: boolean) =>
    call<DetailOffer>(`/api/events/${id}/done`, { method: 'POST', body: JSON.stringify({ done }) }),
  deleteEvent: (id: number) => call<DetailOffer>(`/api/events/${id}`, { method: 'DELETE' }),
  deadlines: (days = 7) => call<Deadlines>(`/api/deadlines?days=${days}`),
  files: (id: number) => call<FilesFolder>(`/api/offers/${id}/files`),
  statistics: () => call<Statistics>('/api/statistics'),
  subScores: (id: number, s: InputSubScores) =>
    call<DetailOffer>(`/api/offers/${id}/sub-scores`, { method: 'PUT', body: JSON.stringify(s) }),
  rubric: () => call<ReplyRubric>('/api/rubric'),
  previewRubric: (rubric: Rubric) => call<Impact>('/api/rubric/preview', { method: 'POST', body: JSON.stringify({ rubric }) }),
  saveRubric: (rubric: Rubric, summary: string) =>
    call<ReplyRubric & { impact: Impact }>('/api/rubric', { method: 'PUT', body: JSON.stringify({ rubric, summary }) }),
  historyRubric: () => call<InfoVersion[]>('/api/rubric/history'),
  restoreRubric: (version: number) =>
    call<ReplyRubric & { impact: Impact }>('/api/rubric/restore', { method: 'POST', body: JSON.stringify({ version }) }),
  apply: (id: number) =>
    call<{ command: string; offer: DetailOffer }>(`/api/offers/${id}/apply`, { method: 'POST' }),
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
