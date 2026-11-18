// Output of the commands: JSON, tables, dates, and the text of an offer's detail, a score's breakdown,
// a journal line and the impact of a rubric change.
import type { DetailOffer } from '../core/offers.ts';
import type { EventJournal } from '../core/events.ts';
import type { Breakdown } from '../core/rubric.ts';
import type { Impact } from '../core/rubric-storage.ts';
import { decimal, languageCurrent, t } from '../i18n/index.ts';
import { labelStatus, messageFlag } from '../i18n/labels.ts';

export function json(x: unknown): void {
  process.stdout.write(`${JSON.stringify(x, null, 2)}\n`);
}

export function truncate(s: string | null | undefined, n: number): string {
  const x = (s ?? '').replace(/\s+/g, ' ');
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

export function table(headers: string[], lines: string[][]): string {
  const widths = headers.map((e, i) => Math.max(e.length, ...lines.map((l) => (l[i] ?? '').length)));
  const line = (l: string[]) =>
    l
      .map((c, i) => (c ?? '').padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...lines.map(line)].join('\n');
}

/** Date of an event: "05/11/2026 14 h 30" (French) or "05/11/2026 14:30" (English). */
export function dateEvent(at: string): string {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return at;
  const hour = m[4] ? ` ${t('tracker.hour', { h: m[4], m: m[5] })}` : '';
  return `${m[3]}/${m[2]}/${m[1]}${hour}`;
}

/** Number in the language of the messages (decimal comma in French). */
export function comma(n: number, d = 2): string {
  return decimal(n, languageCurrent(), d);
}

export function showDetail(d: DetailOffer): string {
  const l: string[] = [];
  const language = languageCurrent();
  l.push(`#${d.id} ${d.title}${d.company ? ` — ${d.company}` : ''}`);
  l.push(t('cli.detail.status', { status: labelStatus(d.status, language), score: d.score ?? '—', source: d.source, site_id: d.site_id }));
  if (d.canonical_url) l.push(t('cli.detail.url', { url: d.canonical_url }));
  const info = [d.location, d.contract, d.compensation, d.remote && t('cli.detail.remote', { value: d.remote })].filter(Boolean);
  if (info.length) l.push(info.join(' · '));
  l.push(t('cli.detail.dates', { received: d.received_at ?? '—', published: d.published_at ?? '—' }));
  if (d.stack) l.push(t('cli.detail.stack', { stack: d.stack }));
  if (d.tags.length) l.push(t('cli.detail.tags', { tags: d.tags.join(', ') }));
  const n = d.scores[0];
  if (n?.breakdown) {
    l.push(
      '',
      t('cli.detail.scoreRubric', { score: n.score, version: n.rubric_version, exact: n.exact_score, at: n.scored_at }),
      ...linesBreakdown(n.breakdown),
    );
    if (n.fit) l.push(t('cli.detail.fit', { text: n.fit }));
    if (n.gaps) l.push(t('cli.detail.gaps', { text: n.gaps }));
  } else if (n) {
    l.push(
      '',
      t('cli.detail.scoreOld', {
        score: n.score ?? '—',
        raw: n.raw_score ?? '—',
        penalties: n.penalties ? t('cli.detail.penalties', { penalties: n.penalties }) : '',
        at: n.scored_at,
      }),
    );
    if (n.fit) l.push(t('cli.detail.fit', { text: n.fit }));
    if (n.gaps) l.push(t('cli.detail.gaps', { text: n.gaps }));
  }
  if (d.application) {
    const c = d.application;
    const infoApplication = [c.folder, c.channel, c.sent_at && t('cli.detail.sentAt', { date: c.sent_at })].filter(Boolean).join(' · ');
    l.push('', t('cli.detail.application', { info: infoApplication }));
    if (c.next_action) l.push(t('cli.detail.nextAction', { text: c.next_action }));
  }
  if (d.events.length) l.push('', t('cli.detail.journal'), ...d.events.map(lineJournal));
  if (d.statuses.length) {
    l.push('', t('cli.detail.history'));
    for (const s of d.statuses) l.push(`  ${s.at.slice(0, 10)}  ${s.status.padEnd(10)} ${truncate(s.comment, 100)}`);
  }
  if (d.description) l.push('', t('cli.detail.description'), d.description);
  return l.join('\n');
}

/** Breakdown of a score: one criterion per line, then rules and flags. */
export function linesBreakdown(d: Breakdown): string[] {
  const l = d.criteria.map(
    (c) =>
      `  ${c.label.padEnd(26)} ${comma(c.score, 1).padStart(4)} × ${String(Math.round(c.normalized_weight * 100)).padStart(3)} % = ${comma(c.contribution).padStart(5)}` +
      `  ${c.origin === 'neutral' ? t('cli.breakdown.neutral') : c.origin === 'interface' ? t('cli.breakdown.main') : ''}${truncate(c.justification, 90)}`,
  );
  l.push(`  ${t('cli.breakdown.average').padEnd(26)} ${comma(d.average)}`);
  for (const r of d.rules) {
    const effect = r.effect === 'zero' ? '0' : t('cli.breakdown.cap', { value: comma(r.value!) });
    l.push(`  ${t('cli.breakdown.rule', { label: r.label, effect, withoutEffect: r.effective ? '' : t('cli.breakdown.withoutEffect') })}`);
  }
  for (const b of d.ignored_blockers) l.push(`  ${t('cli.breakdown.ignored', { rule: b })}`);
  for (const f of d.flags) l.push(`  ⚑ ${messageFlag(f, languageCurrent())}`);
  l.push(`  ${t('cli.breakdown.score', { exact: comma(d.exact_score), score: comma(d.score, 1) })}`);
  return l;
}

/** Impact of a rubric change: how many offers changed, those crossing the threshold upwards then downwards. */
export function showImpact(i: Impact): void {
  console.log(t('cli.impact.summary', { recalculated: i.offers_recalculated, changed: i.changed }));
  const line = (c: Impact['changes'][number]) =>
    `  #${String(c.id).padEnd(5)} ${String(c.before ?? '—').padStart(4)} → ${String(c.after).padEnd(4)} ${truncate(`${c.company ?? ''} ${c.title}`, 80)}`;
  const threshold = i.threshold_after;
  if (i.rising.length) console.log(`${t('cli.impact.rising', { threshold, n: i.rising.length })}\n${i.rising.map(line).join('\n')}`);
  if (i.falling.length) console.log(`${t('cli.impact.falling', { threshold, n: i.falling.length })}\n${i.falling.map(line).join('\n')}`);
}

export function lineJournal(e: EventJournal): string {
  const state = (e.overdue ? t('cli.journal.overdue') : e.deadline ? t('cli.journal.toDo') : '').padEnd(10);
  const direction = e.direction ? ` ${e.direction === 'sent' ? '→' : '←'}` : '';
  const amount = e.amount !== null ? ` · ${e.amount} ${e.unit ?? ''}`.trimEnd() : '';
  const files = e.files.length ? ` · ${e.files.join(', ')}` : '';
  return `  #${String(e.id).padEnd(5)} ${dateEvent(e.at).padEnd(19)} ${state}${e.type.padEnd(11)}${direction} ${truncate(e.summary, 90)}${amount}${files}`;
}
