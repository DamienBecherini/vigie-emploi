// Commands of the applications: apply, application, next-action, the journal of exchanges (event, journal,
// deadlines, done), the files of an application folder, the statistics and the generated tracker.
import { offerById, type FieldsApplication } from '../../core/offers.ts';
import { prepareApplication, trackApplication } from '../../core/actions.ts';
import { addEvent, deadlines, eventOrError, journal, markDone, TYPES_EVENT, type EventInput } from '../../core/events.ts';
import { filesFolder } from '../../core/files.ts';
import { statistics } from '../../core/statistics.ts';
import { writeTracker } from '../../export/tracker.ts';
import { languageCurrent, t } from '../../i18n/index.ts';
import { labelType } from '../../i18n/labels.ts';
import { analyze, error, whole } from '../options.ts';
import { context, notFound, withoutError, type Command } from '../context.ts';
import { comma, dateEvent, json, lineJournal, showDetail, truncate } from '../format.ts';

export const applicationCommands: Record<string, Command> = {
  apply(args) {
    const { v, pos } = analyze(args, {});
    const { config, db } = context(v);
    const id = whole(pos[0], 'id');
    const r = withoutError(() => prepareApplication(db, config.dataDir, id, 'cli'));
    if (v.json) return json(r);
    console.log(showDetail(r.offer));
    console.log(`\n${t('cli.apply.folder', { folder: r.suggested_folder })}`);
    console.log(r.steps.map((e, i) => `${i + 1}. ${e}`).join('\n'));
  },

  application(args) {
    const { v, pos } = analyze(args, {
      folder: { type: 'string' },
      cv: { type: 'string' },
      channel: { type: 'string' },
      'sent-at': { type: 'string' },
      message: { type: 'string' },
      'next-action': { type: 'string' },
    });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const fields: FieldsApplication = {
      folder: v.folder,
      cv: v.cv,
      channel: v.channel,
      sent_at: v['sent-at'],
      message: v.message,
      next_action: v['next-action'],
    };
    if (Object.values(fields).every((x) => x === undefined)) error(t('cli.application.option'));
    const r = withoutError(() => trackApplication(db, id, fields, 'cli'));
    if (v.json) return json({ ok: true, id, status: r.offer.status, status_added: r.status_added, application: r.offer.application });
    console.log(showDetail(r.offer).split(`\n\n${t('cli.detail.description')}`)[0]);
  },

  'next-action'(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (pos[1] === undefined) error(t('cli.nextAction.expected'));
    const text = pos.slice(1).join(' ');
    const r = withoutError(() => trackApplication(db, id, { next_action: text === '-' ? null : text }, 'cli'));
    const action = r.offer.application?.next_action ?? null;
    if (v.json) return json({ ok: true, id, next_action: action });
    console.log(`#${id} : ${action ?? t('cli.nextAction.none')}`);
  },

  event(args) {
    const { v, pos } = analyze(args, {
      type: { type: 'string', short: 't' },
      at: { type: 'string' },
      summary: { type: 'string', short: 'r' },
      direction: { type: 'string' },
      details: { type: 'string' },
      channel: { type: 'string' },
      contacts: { type: 'string' },
      amount: { type: 'string' },
      unit: { type: 'string' },
      days: { type: 'string' },
      file: { type: 'string', multiple: true },
      done: { type: 'boolean' },
    });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (!v.type) error(t('cli.event.typeExpected', { types: TYPES_EVENT.join(', ') }));
    if (!v.summary) error(t('cli.event.summaryExpected'));
    const input: EventInput = {
      type: v.type,
      at: v.at,
      summary: v.summary,
      direction: v.direction,
      details: v.details,
      channel: v.channel,
      contacts: v.contacts,
      amount: v.amount,
      unit: v.unit,
      days: v.days,
      files: v.file,
      done: v.done,
    };
    const e = withoutError(() => addEvent(db, id, input, 'cli'));
    if (v.json) return json({ ok: true, event: e });
    console.log(
      t('cli.event.added', { id: e.id, offer: id, at: dateEvent(e.at), type: e.type, deadline: e.done ? '' : t('cli.event.deadline'), summary: e.summary }),
    );
  },

  journal(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const o = offerById(db, id);
    if (!o) notFound(t('cli.offerNotFound', { id }));
    const j = journal(db, id);
    if (v.json) return json({ ok: true, id, events: j });
    console.log(`#${id} ${o.title}${o.company ? ` — ${o.company}` : ''}`);
    if (!j.length) return console.log(t('cli.journal.empty'));
    for (const e of j) console.log(lineJournal(e));
  },

  deadlines(args) {
    const { v } = analyze(args, { days: { type: 'string' } });
    const { db } = context(v);
    const r = withoutError(() => deadlines(db, { days: v.days !== undefined ? Number(v.days) : 7 }));
    if (v.json) return json({ ok: true, ...r });
    const language = languageCurrent();
    const line = (e: (typeof r.upcoming)[number]) =>
      `  #${String(e.id).padEnd(5)} ${dateEvent(e.at).padEnd(19)} ${t('cli.deadlines.offer', { id: e.offer_id })} ${truncate(e.company ?? e.title, 28).padEnd(28)} ${labelType(e.type, language)} : ${truncate(e.summary, 80)}`;
    console.log(t('cli.deadlines.overdue', { n: r.overdue.length }));
    for (const e of r.overdue) console.log(line(e));
    console.log(t('cli.deadlines.upcoming', { date: dateEvent(r.until), n: r.upcoming.length }));
    for (const e of r.upcoming) console.log(line(e));
  },

  done(args) {
    const { v, pos } = analyze(args, { done: { type: 'boolean' } });
    const { db } = context(v);
    const id = whole(pos[0], 'event_id');
    withoutError(() => eventOrError(db, id));
    const e = markDone(db, id, v.done !== false);
    if (v.json) return json({ ok: true, event: e });
    console.log(t(e.done ? 'cli.done.done' : 'cli.done.reopened', { id, summary: e.summary }));
  },

  files(args) {
    const { v, pos } = analyze(args, {});
    const { config, db } = context(v);
    const id = whole(pos[0], 'id');
    if (!offerById(db, id)) notFound(t('cli.offerNotFound', { id }));
    const r = filesFolder(db, config.dataDir, id);
    if (v.json) return json({ ok: true, ...r });
    if (!r.folder) return console.log(t('cli.files.withoutFolder', { id }));
    if (!r.exists) return console.log(t('cli.files.absent', { id, folder: r.folder }));
    console.log(t('cli.files.title', { folder: r.folder, n: r.files.length }));
    for (const f of r.files) {
      console.log(`  ${f.path.padEnd(70)} ${String(Math.ceil(f.size / 1024)).padStart(5)} ${t('cli.files.ko')}  ${f.modified_at.slice(0, 10)}`);
    }
  },

  stats(args) {
    const { v } = analyze(args, {});
    const { db } = context(v);
    const s = statistics(db);
    if (v.json) return json({ ok: true, ...s });
    console.log(t('cli.stats.steps', { sent: s.sent, replies: s.replies, interviews: s.interviews, proposals: s.proposals }));
    console.log(
      s.average_reply_days === null ? t('cli.stats.notEnough') : t('cli.stats.timeout', { days: comma(s.average_reply_days, 1), n: s.reply_sample_size }),
    );
  },

  'generate-tracker'(args) {
    const { v } = analyze(args, { output: { type: 'string', short: 'o' }, replace: { type: 'boolean' } });
    const { config, db } = context(v);
    const r = writeTracker(db, config.dataDir, { output: v.output, replace: Boolean(v.replace), language: config.language });
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.tracker.summary', { file: r.file, inProgress: r.in_progress, noFollowUp: r.no_follow_up, closes: r.closes }));
  },
};
