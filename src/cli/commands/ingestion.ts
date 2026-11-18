// Commands that bring offers in: mail (the mailbox read over IMAP), ingest (alert e-mails) and import-history
// (the Markdown files of the former workflow).
import { ingestPerConfig } from '../../ingest/ingest.ts';
import { importHistory } from '../../import/history.ts';
import { messageMailError } from '../../mail/settings.ts';
import { MailError } from '../../mail/fetch.ts';
import { t } from '../../i18n/index.ts';
import { commandMail, MAIL_OPTIONS } from '../mail.ts';
import { analyze } from '../options.ts';
import { context, type Command } from '../context.ts';
import { json, truncate } from '../format.ts';

export const ingestionCommands: Record<string, Command> = {
  async mail(args) {
    const { v, pos } = analyze(args, MAIL_OPTIONS);
    await commandMail(pos[0], v, context(v), json);
  },

  async ingest(args) {
    const { v } = analyze(args, { keep: { type: 'boolean' }, fetch: { type: 'boolean' }, mail: { type: 'boolean' }, emails: { type: 'string' } });
    const { config, db } = context(v);
    const r = await ingestPerConfig(db, config, {
      folderEmails: v.emails,
      keep: Boolean(v.keep),
      download: v.fetch === false ? false : undefined,
      mail: v.mail !== false,
    });
    if (v.json) return json(r);
    if (r.mail?.error)
      console.log(
        t('cli.ingest.mailError', {
          message: messageMailError(new MailError(r.mail.error, r.mail.message), { host: config.mail?.host ?? '', folder: r.mail.folder }),
        }),
      );
    else if (r.mail) {
      console.log(t('cli.ingest.mail', { n: r.mail.fetched, folder: r.mail.folder }));
      if (r.mail.more) console.log(t('cli.ingest.mailMore'));
    }
    console.log(
      t('cli.ingest.summary', {
        files: r.files,
        offers: r.offers_found,
        added: r.added,
        withDescription: r.with_description,
        toRead: r.to_read,
        duplicates: r.duplicates,
        dismissed: r.dismissed,
      }),
    );
    console.log(v.keep ? t('cli.ingest.kept') : t('cli.ingest.deleted', { n: r.files_deleted }));
    for (const e of r.detail.dismissed) console.log(t('cli.ingest.dismissed', { id: e.id, title: truncate(e.title, 70), pattern: e.pattern }));
    for (const e of r.errors) console.log(t('cli.ingest.error', { file: e.file ?? e.url, message: e.message }));
    for (const f of r.without_offer) console.log(t('cli.ingest.withoutOffer', { file: f }));
    for (const c of r.confirmations) {
      const known = c.known_offers.map((x) => `#${x.id} (${x.status})`).join(', ');
      console.log(t('cli.ingest.acknowledgment', { subject: c.subject, more: known ? ` → ${known}` : t('cli.ingest.offerMissing') }));
    }
    if (r.added) console.log(t('cli.ingest.suite'));
  },

  'import-history'(args) {
    const { v } = analyze(args, { source: { type: 'string' } });
    const { config, db } = context(v);
    const r = importHistory(db, v.source ?? config.dataDir);
    if (v.json) return json(r);
    console.log(
      t('cli.import.batches', { files: r.batches.files, inputs: r.batches.inputs, offers: r.batches.offers_created, scores: r.batches.scores_added }),
    );
    console.log(
      t('cli.import.register', {
        lines: r.register.lines,
        offers: r.register.offers,
        created: r.register.offers_created,
        withoutLink: r.register.offers_without_link,
        statuses: r.register.statuses_added,
        scores: r.register.scores_added,
        corrected: r.register.companies_corrected,
      }),
    );
    if (r.tracker.ignore) console.log(t('cli.import.trackerIgnore', { reason: r.tracker.ignore }));
    else
      console.log(
        t('cli.import.tracker', {
          lines: r.tracker.lines,
          offers: r.tracker.offers_created,
          applications: r.tracker.applications,
          statuses: r.tracker.statuses_added,
        }),
      );
    const J = r.journal;
    console.log(
      t('cli.import.journals', {
        folders: J.folders,
        lines: J.lines,
        created: J.events_created,
        existing: J.events_existing,
        duplicate: J.events_duplicate.length,
        removed: J.events_removed,
        deadlines: J.deadlines,
        types:
          Object.entries(J.by_type)
            .map(([x, n]) => `${x} ${n}`)
            .join(', ') || '—',
      }),
    );
    for (const d of J.folders_attached) console.log(t('cli.import.attached', { offer: d.offer_id, folder: d.folder }));
    for (const d of J.folders_without_offer) console.log(t('cli.import.withoutOffer', { folder: d }));
    for (const d of J.folders_without_tracker) console.log(t('cli.import.withoutTracker', { folder: d }));
    if (J.untyped.length) {
      console.log(t('cli.import.untyped', { n: J.untyped.length }));
      for (const n of J.untyped) console.log(`  ${n.folder}:${n.line} ${n.excerpt}`);
    }
    if (J.without_date.length) {
      console.log(t('cli.import.withoutDate', { n: J.without_date.length }));
      for (const n of J.without_date) console.log(`  ${n.folder}:${n.line} ${n.excerpt}`);
    }
    for (const f of r.tracker.merges) console.log(t('cli.import.merge', { duplicate: f.duplicate, offer: f.offer, company: f.company }));
    const not = [...r.batches.errors, ...r.register.unrecognized, ...r.tracker.unrecognized];
    if (not.length) {
      console.log(t('cli.import.unrecognized', { n: not.length }));
      for (const n of not) console.log(`  ${n.file}:${n.line} ${n.reason} — ${n.excerpt}`);
    }
    if (r.register.links_not_recognized.length) {
      console.log(t('cli.import.linksNotRecognized', { n: r.register.links_not_recognized.length }));
      for (const n of r.register.links_not_recognized) console.log(`  _ecartees.md:${n.line} ${n.url}`);
    }
  },
};
