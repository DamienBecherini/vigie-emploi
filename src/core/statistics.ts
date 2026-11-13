// Statistiques minimales des candidatures : nombre par étape et délai avant la première réponse.
import type { Database } from '../db/database.ts';

export interface Statistics {
  /** Candidatures envoyées (date d'envoi, ou statut envoyée et suivants dans l'historique). */
  sent: number;
  /** … dont une réponse est connue (message reçu, entretien, test, proposition, refus). */
  replies: number;
  /** … qui ont eu un entretien (événement « entretien » ou statut « entretien »). */
  interviews: number;
  /** … qui ont eu une proposition (événement « proposition », envoyée ou reçue). */
  proposals: number;
  /** Délai moyen (jours) entre l'envoi et la première réponse arrivée après le jour de l'envoi. */
  timeout_medium_reply_days: number | null;
  /** Nombre de candidatures dans ce calcul. */
  timeout_database: number;
}

/** Calcule les statistiques à partir des candidatures, des statuts et du journal. */
export function statistics(db: Database): Statistics {
  const lines = db
    .prepare(
      `WITH sent AS (
         SELECT o.id,
                (SELECT c.sent_at FROM applications c WHERE c.offer_id = o.id) AS sent_at
         FROM offers o
         WHERE EXISTS (SELECT 1 FROM applications c WHERE c.offer_id = o.id AND c.sent_at IS NOT NULL)
            OR EXISTS (SELECT 1 FROM statuses s WHERE s.offer_id = o.id AND s.status IN ('sent', 'followed-up', 'interview', 'rejected'))
       )
       SELECT e.id, e.sent_at,
         (SELECT group_concat(d) FROM (
            SELECT substr(ev.at, 1, 10) AS d FROM events ev WHERE ev.offer_id = e.id AND ev.done = 1
              AND ((ev.type = 'message' AND ev.direction = 'received') OR ev.type IN ('interview', 'test')
                   OR (ev.type = 'proposal' AND ev.direction = 'received'))
            UNION ALL
            SELECT substr(s.at, 1, 10) FROM statuses s WHERE s.offer_id = e.id AND s.status IN ('interview', 'rejected')
         )) AS replies,
         EXISTS (SELECT 1 FROM events ev WHERE ev.offer_id = e.id AND ev.type = 'interview' AND ev.done = 1)
           OR EXISTS (SELECT 1 FROM statuses s WHERE s.offer_id = e.id AND s.status = 'interview') AS interview,
         EXISTS (SELECT 1 FROM events ev WHERE ev.offer_id = e.id AND ev.type = 'proposal') AS proposal
       FROM sent e`,
    )
    .all() as unknown as {
    id: number;
    sent_at: string | null;
    replies: string | null;
    interview: number;
    proposal: number;
  }[];
  const delays: number[] = [];
  for (const l of lines) {
    // Première réponse datée après le jour de l'envoi (un contact entrant suivi d'une réponse le même jour
    // ne dit rien du délai de réponse).
    const send = l.sent_at && /^\d{4}-\d{2}-\d{2}$/.test(l.sent_at) ? l.sent_at : null;
    const after = (l.replies ?? '').split(',').filter((d) => send && d > send).sort()[0];
    if (send && after) delays.push((Date.parse(after) - Date.parse(send)) / 86_400_000);
  }
  return {
    sent: lines.length,
    replies: lines.filter((l) => l.replies !== null).length,
    interviews: lines.filter((l) => Boolean(l.interview)).length,
    proposals: lines.filter((l) => Boolean(l.proposal)).length,
    timeout_medium_reply_days: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
    timeout_database: delays.length,
  };
}
