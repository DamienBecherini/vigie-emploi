// Opérations de haut niveau partagées par la CLI, l'API du tableau de bord et le serveur MCP.
// Chaque fonction valide ses entrées et lève une Error au message lisible par l'utilisateur.
import type { Database } from '../db/database.ts';
import { transaction } from '../db/database.ts';
import { listOffers } from './queries.ts';
import {
  addStatus,
  detailOffer,
  saveApplication,
  updateTags,
  offerById,
  type FieldsApplication,
  type DetailOffer,
  type Offer,
} from './offers.ts';
import { isCriteriaScore, scoreInput, type InputBatch, type ResultScoring } from './scoring.ts';
import { scoresOffer } from './offers.ts';
import type { VersionRubric } from './rubric-storage.ts';
import type { Inputs } from './rubric.ts';
import { STATUSES_TO_PROCESS, type Status } from './statuses.ts';
import { dateFr } from './text.ts';
import { t } from '../i18n/index.ts';

/** Statuts d'avant l'envoi : une candidature envoyée ou « candidater » les font avancer. */
export const STATUSES_BEFORE_GO: Status[] = ['new', 'to-read', 'scored', 'dismissed'];

export function offerOrError(db: Database, id: number): Offer {
  const o = Number.isInteger(id) ? offerById(db, id) : undefined;
  if (!o) throw new Error(t('core.offerNotFound', { id }));
  return o;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface OfferToRead {
  id: number;
  source: string;
  url: string | null;
  title: string;
  company: string | null;
  location: string | null;
  contract: string | null;
  compensation: string | null;
  remote: string | null;
  received_at: string | null;
  /** description : texte déjà en base ; navigateur : ouvrir l'URL ; humain : page protégée, demander le texte. */
  reading: 'description' | 'browser' | 'human';
  /** Longueur de la description en base (0 si aucune). */
  length_description: number;
  /** Absente en mode résumé (descriptions: false). */
  description?: string | null;
}

export interface OptionsToRead {
  /** Offres par page (500 par défaut). */
  limit?: number;
  /** Page (1 par défaut). */
  page?: number;
  /** false : résumé sans description (lire ensuite chaque offre avec son id). true par défaut. */
  descriptions?: boolean;
  /** Descriptions entières (sinon tronquées à `longueur`). */
  full?: boolean;
  /** Longueur maximale d'une description tronquée (2 500 par défaut). */
  length?: number;
}

export interface ResultToRead {
  total: number;
  page: number;
  pages: number;
  /** Offres à lire après cette page. */
  remaining: number;
  offers: OfferToRead[];
}

/** Offres à traiter (nouvelle, à lire) sans note, des plus anciennes aux plus récentes, par pages. */
export function offersToRead(db: Database, o: OptionsToRead = {}): ResultToRead {
  const r = listOffers(db, { statuses: STATUSES_TO_PROCESS, unscored: true, size: o.limit ?? 500, page: o.page, sort: 'id', order: 'asc' });
  const withDescriptions = o.descriptions !== false;
  const offers = r.offers.map((l): OfferToRead => {
    const d = offerById(db, l.id)!;
    const reading = d.description ? 'description' : l.source === 'glassdoor' ? 'human' : 'browser';
    const base: OfferToRead = {
      id: l.id,
      source: l.source,
      url: l.canonical_url,
      title: l.title,
      company: l.company,
      location: l.location,
      contract: l.contract,
      compensation: l.compensation,
      remote: l.remote,
      received_at: l.received_at,
      reading,
      length_description: d.description?.length ?? 0,
    };
    if (!withDescriptions) return base;
    const text = d.description ? (o.full ? d.description : truncate(d.description.replace(/\s+/g, ' '), o.length ?? 2500)) : null;
    return { ...base, description: text };
  });
  return { total: r.total, page: r.page, pages: r.pages, remaining: Math.max(0, r.total - (r.page - 1) * r.size - offers.length), offers };
}

export interface OptionsScore {
  /** Charge la grille courante (appelé seulement si une entrée a des critères). */
  rubric?: () => VersionRubric | null;
  /** Essai : calcule et renvoie les notes sans rien enregistrer. */
  dry_run?: boolean;
}

/** Enregistre des notes au format des lots (dans une transaction : tout ou rien). */
export function scoreOffers(db: Database, inputs: InputBatch[], origin: string, o: OptionsScore = {}): ResultScoring[] {
  if (!inputs.length) throw new Error(t('core.noneScore'));
  const rubric = inputs.some(isCriteriaScore) ? (o.rubric?.() ?? null) : null;
  const score = () =>
    inputs.map((e) => {
      const r = scoreInput(db, e, { origin, originOffer: 'manual', rubric });
      if (Array.isArray(e.tags) && e.tags.length) updateTags(db, r.id, e.tags, []);
      return r;
    });
  if (!o.dry_run) return transaction(db, score);
  db.exec('BEGIN IMMEDIATE');
  try {
    return score();
  } finally {
    db.exec('ROLLBACK');
  }
}

export interface InputSubScores {
  /** Sous-notes modifiées (critères notés par l'IA) ; null retire la sous-note (valeur neutre). */
  criteria?: Record<string, { score: number | string; justification?: string | null } | null>;
  /** Données d'entrée des critères calculés ; null efface une valeur (retour à la déduction depuis l'offre). */
  inputs?: { [K in keyof Inputs]?: Inputs[K] | null };
  blockers?: string[];
}

/**
 * Correction des sous-notes depuis l'interface : part de la dernière note (sous-notes, entrées, règles,
 * « colle », « ecarts »), applique les changements et ajoute une note à l'historique (origine interface).
 * Sur une note globale de l'ancienne grille, les critères non saisis valent la valeur neutre.
 */
export function updateSubScores(db: Database, id: number, s: InputSubScores, origin: string, rubric: VersionRubric): ResultScoring {
  offerOrError(db, id);
  const last = scoresOffer(db, id)[0];
  const base = last?.input ?? { criteria: {}, inputs: undefined, blockers: [] };
  const criteria: NonNullable<InputBatch['criteria']> = {};
  for (const [k, v] of Object.entries(base.criteria)) criteria[k] = { score: v.score, justification: v.justification, origin: v.origin ?? 'ai' };
  for (const [k, v] of Object.entries(s.criteria ?? {})) {
    if (v === null) delete criteria[k];
    else criteria[k] = { score: v.score, justification: v.justification ?? undefined, origin: 'interface' };
  }
  const inputs: Record<string, unknown> = { ...(base.inputs ?? {}) };
  for (const [k, v] of Object.entries(s.inputs ?? {})) {
    if (v === null || v === undefined) delete inputs[k];
    else inputs[k] = v;
  }
  return transaction(db, () =>
    scoreInput(
      db,
      {
        id,
        criteria,
        inputs: inputs as Inputs,
        blockers: s.blockers ?? base.blockers,
        fit: last?.fit ?? undefined,
        gaps: last?.gaps ?? undefined,
        read: last?.read ?? true,
      },
      { origin, rubric },
    ),
  );
}

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(h\/f|f\/h|h-f|f-h)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');
}

export interface PreparationApplication {
  offer: DetailOffer;
  data_dir: string;
  suggested_folder: string;
  steps: string[];
}

/** Statuts de fin : « candidater » les rouvre (l'utilisateur reprend l'offre). */
const REOPENABLE_STATUSES: Status[] = ['withdrawn', 'rejected', 'closed'];

/**
 * Passe l'offre en « go » et rassemble ce qu'il faut pour candidater. Une candidature en cours
 * (go, envoyee, relancee, entretien) garde son statut ; une offre abandonnée, refusée ou close est rouverte.
 */
export function prepareApplication(db: Database, dataDir: string, id: number, origin: string): PreparationApplication {
  const before = offerOrError(db, id);
  if (STATUSES_BEFORE_GO.includes(before.status)) addStatus(db, id, 'go', { comment: 'apply', origin });
  else if (REOPENABLE_STATUSES.includes(before.status)) addStatus(db, id, 'go', { comment: t('core.import', { status: before.status }), origin });
  const d = detailOffer(db, id)!;
  const folder = d.application?.folder ?? `candidatures/${slug(`${d.company ?? d.source} ${d.title}`)}`;
  return {
    offer: d,
    data_dir: dataDir,
    suggested_folder: folder,
    steps: [
      t('core.step.reread', { url: d.canonical_url ?? t('core.withoutUrl') }),
      t('core.step.instructions'),
      t('core.step.folder', { folder }),
      t('core.step.save', { id, folder }),
      t('core.step.send'),
    ],
  };
}

/**
 * Met à jour la candidature d'une offre. Avec une date d'envoi, une offre pas encore envoyée passe
 * en « envoyee » (commentaire : canal et date).
 */
export function trackApplication(
  db: Database,
  id: number,
  fields: FieldsApplication,
  origin: string,
): { offer: DetailOffer; status_added: Status | null } {
  const o = offerOrError(db, id);
  const send = fields.sent_at?.trim();
  // « 02/11/2026 » est rangé en 2026-11-02 ; un texte libre (« ≈ 25/08/2026 ») est gardé tel quel.
  const fieldsNorm: FieldsApplication = {
    ...fields,
    sent_at: send && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(send) ? dateFr(send) : fields.sent_at,
  };
  return transaction(db, () => {
    const c = saveApplication(db, id, fieldsNorm, { origin });
    let statusAdded: Status | null = null;
    if (send && [...STATUSES_BEFORE_GO, 'go'].includes(o.status)) {
      const comment = [c.channel, t('core.sentAt', { date: send })].filter(Boolean).join(', ');
      addStatus(db, id, 'sent', { comment, origin });
      statusAdded = 'sent';
    }
    return { offer: detailOffer(db, id)!, status_added: statusAdded };
  });
}
