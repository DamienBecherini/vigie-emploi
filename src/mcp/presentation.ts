// Mise en forme des réponses volumineuses du serveur MCP : une IA sans outil de lecture de fichiers (Claude Desktop)
// doit pouvoir lire chaque réponse en entier. Cible : moins de 25 000 caractères par réponse.
import type { Impact } from '../core/rubric-storage.ts';
import type { DetailOffer } from '../core/offers.ts';
import type { LineList } from '../core/queries.ts';
import type { SummaryIngest } from '../ingest/ingest.ts';
import { tm } from './texts.ts';

/** Taille visée d'une réponse d'outil, en caractères. */
export const REPLY_MAX = 25_000;

/** offres_a_lire : offres par page en résumé, et avec descriptions. */
export const TO_READ_DEFAULT = 25;
export const TO_READ_MAX = 60;
export const TO_READ_MAX_DESCRIPTIONS = 10;
export const LENGTH_DESCRIPTION_PAGE = 1_500;

/** lister_offres : offres par page. */
export const LIST_DEFAULT = 25;
export const LIST_MAX = 60;

/** lire_offre : description et notes. */
export const DESCRIPTION_MAX = 15_000;
export const SCORES_MAX = 3;

/** ingerer_emails : lignes de détail par catégorie. */
export const DETAIL_INGESTION_MAX = 30;

/** Retire les champs null, indéfinis, chaînes vides et listes vides (réponses plus courtes, sans perte). */
export function withoutEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

/** Ligne de lister_offres sans les champs techniques (id du site, horodatages, montants décomposés). */
export function lineCompact(l: LineList): Partial<LineList> {
  const { site_id: _i, created_at: _c, updated_at: _m, origin: _o, compensation_min: _a, compensation_max: _b, compensation_unit: _u, ...rest } = l;
  return withoutEmpty(rest);
}

/** Détail d'une offre plafonné : description tronquée (sauf complet), seules les notes les plus récentes. */
export function detailCapped(d: DetailOffer, o: { full?: boolean } = {}): Record<string, unknown> {
  const description = d.description ?? null;
  const truncated = Boolean(description && !o.full && description.length > DESCRIPTION_MAX);
  return {
    ...d,
    description: truncated ? `${description!.slice(0, DESCRIPTION_MAX)}…` : description,
    ...(truncated
      ? {
          description_truncated: tm('presentation.detailCapped.description_truncated', { length: String(description!.length), DESCRIPTION_MAX: String(DESCRIPTION_MAX) }),
        }
      : {}),
    scores: d.scores.slice(0, SCORES_MAX),
    ...(d.scores.length > SCORES_MAX ? { scores_old_not_shown: d.scores.length - SCORES_MAX } : {}),
  };
}

/** Impact d'un changement de grille : les 30 plus forts changements (montées et descentes de seuil comprises, 30 chacune). */
export function impactCapped(i: Impact): Record<string, unknown> {
  const n = 30;
  return {
    ...i,
    rising: i.rising.slice(0, n),
    falling: i.falling.slice(0, n),
    changes: i.changes.slice(0, n),
    ...(i.changes.length > n ? { changes_not_shown: i.changes.length - n } : {}),
    ...(i.rising.length > n || i.falling.length > n ? { rising_falling_truncated: true } : {}),
  };
}

const first =<T>(l: T[], n: number) => ({ list: l.slice(0, n), rest: Math.max(0, l.length - n) });

/**
 * Réponse de ingerer_emails : compteurs, puis ce qu'il faut dire à l'utilisateur (e-mails supprimés, erreurs à
 * signaler), et un détail plafonné (la liste complète des offres à lire est dans offres_a_lire).
 */
export function presentIngestion(r: SummaryIngest, o: { keep?: boolean } = {}): Record<string, unknown> {
  const toTell: string[] = [];
  const read = r.files - r.without_offer.length;
  if (r.files_deleted > 0) {
    toTell.push(
      tm('presentation.presentIngestion', { files_deleted: String(r.files_deleted) }),
    );
  } else if (o.keep && read > 0) {
    toTell.push(
      tm('presentation.presentIngestion2', { read: String(read) }),
    );
  }
  if (r.without_offer.length) {
    toTell.push(
      tm('presentation.presentIngestion3', { length: String(r.without_offer.length), p2: String(r.without_offer.join(', ')) }),
    );
  }
  if (r.errors.length) {
    toTell.push(
      tm('presentation.presentIngestion4', { length: String(r.errors.length) }),
    );
  }
  if (r.confirmations.length) {
    toTell.push(
      tm('presentation.presentIngestion5', { length: String(r.confirmations.length) }),
    );
  }
  const added = first(r.detail.added, DETAIL_INGESTION_MAX);
  const dismissed = first(r.detail.dismissed, DETAIL_INGESTION_MAX);
  const duplicates = first(r.detail.duplicates, 10);
  return {
    ok: true,
    files: r.files,
    files_deleted: r.files_deleted,
    offers_found: r.offers_found,
    added: r.added,
    duplicates: r.duplicates,
    dismissed: r.dismissed,
    to_read: r.to_read,
    with_description: r.with_description,
    to_tell: toTell,
    errors: r.errors.map((e) => ({
      ...e,
      ...(e.url ? { offer: r.detail.added.concat(r.detail.dismissed).find((x) => x.url === e.url)?.id ?? null } : {}),
    })),
    without_offer: r.without_offer,
    confirmations: r.confirmations,
    detail: {
      added: added.list.map((x) => withoutEmpty({ id: x.id, source: x.source, title: x.title, company: x.company, has_description: x.has_description })),
      ...(added.rest ? { added_not_shown: added.rest } : {}),
      dismissed: dismissed.list.map((x) => withoutEmpty({ id: x.id, title: x.title, company: x.company, pattern: x.pattern })),
      ...(dismissed.rest ? { dismissed_not_shown: dismissed.rest } : {}),
      duplicates: duplicates.list.map((x) => withoutEmpty({ id: x.id, title: x.title, status: x.status })),
      ...(duplicates.rest ? { duplicates_not_shown: duplicates.rest } : {}),
    },
    more: tm('presentation.presentIngestion.suite'),
  };
}
