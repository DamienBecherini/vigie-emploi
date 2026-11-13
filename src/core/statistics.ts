// Minimal statistics of the applications: number per step and delay before the first reply.
import type { Database } from '../db/database.ts';

export interface Statistics {
  /** Sent applications (sending date, or status sent and following ones in the history). */
  sent: number;
  /** … with a known reply (message received, interview, test, proposal, rejection). */
  replies: number;
  /** … that had an interview ("interview" event or "interview" status). */
  interviews: number;
  /** … that had a proposal ("proposal" event, sent or received). */
  proposals: number;
  /** Average delay (days) between the sending and the first reply received after the sending day. */
  average_reply_days: number | null;
  /** Number of applications in this computation. */
  reply_sample_size: number;
}

/** Computes the statistics from the applications, the statuses and the journal. */
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
    // First reply dated after the sending day (an incoming contact followed by a reply on the same day
    // says nothing about the reply delay).
    const send = l.sent_at && /^\d{4}-\d{2}-\d{2}$/.test(l.sent_at) ? l.sent_at : null;
    const after = (l.replies ?? '').split(',').filter((d) => send && d > send).sort()[0];
    if (send && after) delays.push((Date.parse(after) - Date.parse(send)) / 86_400_000);
  }
  return {
    sent: lines.length,
    replies: lines.filter((l) => l.replies !== null).length,
    interviews: lines.filter((l) => Boolean(l.interview)).length,
    proposals: lines.filter((l) => Boolean(l.proposal)).length,
    average_reply_days: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
    reply_sample_size: delays.length,
  };
}
