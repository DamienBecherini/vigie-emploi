// Commands on the offers themselves: list, show, to-read, and the changes of an offer's status, tags and link.
import { listOffers, type OptionsList } from '../../core/queries.ts';
import { addStatus, detailOffer, offerById, updateLink, updateTags } from '../../core/offers.ts';
import { offersToRead } from '../../core/actions.ts';
import { isStatus, STATUSES } from '../../core/statuses.ts';
import { languageCurrent, t } from '../../i18n/index.ts';
import { labelStatus } from '../../i18n/labels.ts';
import { analyze, error, list, number, whole } from '../options.ts';
import { context, notFound, type Command } from '../context.ts';
import { json, showDetail, table, truncate } from '../format.ts';

export const offerCommands: Record<string, Command> = {
  list(args) {
    const { v } = analyze(args, {
      status: { type: 'string' },
      'score-min': { type: 'string' },
      'score-max': { type: 'string' },
      unscored: { type: 'boolean' },
      source: { type: 'string' },
      tag: { type: 'string' },
      from: { type: 'string' },
      until: { type: 'string' },
      'published-from': { type: 'string' },
      text: { type: 'string', short: 'q' },
      contract: { type: 'string' },
      remote: { type: 'string' },
      applications: { type: 'boolean' },
      page: { type: 'string' },
      size: { type: 'string' },
      sort: { type: 'string' },
      order: { type: 'string' },
    });
    const { db } = context(v);
    const statuses = list(v.status);
    for (const s of statuses ?? []) if (!isStatus(s)) error(t('cli.statusUnknown', { status: s }));
    const o: OptionsList = {
      statuses,
      sources: list(v.source),
      tags: list(v.tag),
      scoreMin: number(v['score-min'], 'score-min'),
      scoreMax: number(v['score-max'], 'score-max'),
      unscored: v.unscored === true ? true : v.unscored === false ? false : undefined,
      receivedFrom: v.from,
      receivedUntil: v.until,
      publishedFrom: v['published-from'],
      q: v.text,
      contract: v.contract,
      remote: v.remote,
      myApplications: Boolean(v.applications),
      page: v.page ? whole(v.page, 'page') : 1,
      size: v.size ? whole(v.size, 'size') : 50,
      sort: v.sort ?? 'received_at',
      order: v.order === 'asc' ? 'asc' : 'desc',
    };
    const r = listOffers(db, o);
    if (v.json) return json(r);
    console.log(
      table(
        t('cli.list.headers').split('|'),
        r.offers.map((x) => [
          String(x.id),
          x.score === null ? '—' : String(x.score),
          x.status,
          x.source,
          x.received_at ?? '',
          truncate(x.company, 24),
          truncate(x.title, 60),
        ]),
      ),
    );
    console.log(t('cli.list.footer', { page: r.page, pages: r.pages, total: r.total }));
  },

  show(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const d = detailOffer(db, whole(pos[0], 'id'));
    if (!d) notFound(t('cli.offerNotFound', { id: pos[0] }));
    if (v.json) return json(d);
    console.log(showDetail(d));
  },

  'to-read'(args) {
    const { v } = analyze(args, { limit: { type: 'string' }, full: { type: 'boolean' } });
    const { db } = context(v);
    const r = offersToRead(db, { limit: v.limit ? whole(v.limit, 'limit') : 500, full: Boolean(v.full) });
    const offers = r.offers;
    if (v.json) return json(r);
    if (!offers.length) return console.log(t('cli.toRead.none'));
    for (const o of offers) {
      const mode = { description: t('cli.toRead.description'), browser: t('cli.toRead.browser'), human: t('cli.toRead.human') }[o.reading];
      console.log(`#${o.id} [${o.source}] ${truncate(o.title, 80)}${o.company ? ` — ${o.company}` : ''}`);
      console.log(`    ${o.url ?? t('cli.toRead.withoutUrl')} · ${mode}`);
    }
    console.log(t('cli.toRead.total', { n: r.total }));
  },

  status(args) {
    const { v, pos } = analyze(args, { comment: { type: 'string', short: 'm' } });
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    const status = pos[1];
    if (!status || !isStatus(status)) error(t('cli.statusExpected', { statuses: STATUSES.join(', ') }));
    if (!offerById(db, id)) notFound(t('cli.offerNotFound', { id }));
    addStatus(db, id, status, { comment: v.comment ?? null, origin: 'cli' });
    const o = offerById(db, id)!;
    if (v.json) return json({ ok: true, id, status: o.status });
    console.log(`#${id} → ${labelStatus(o.status, languageCurrent())}`);
  },

  tag(args) {
    // Manual parsing: "-removal" must not be taken for an option.
    const opts: { json?: boolean; data?: string; config?: string } = {};
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--json') opts.json = true;
      else if (a === '--data' || a === '--config') opts[a === '--data' ? 'data' : 'config'] = args[++i];
      else rest.push(a);
    }
    const { db } = context(opts);
    const id = whole(rest[0], 'id');
    if (!offerById(db, id)) notFound(t('cli.offerNotFound', { id }));
    const additions = rest
      .slice(1)
      .filter((x) => x.startsWith('+'))
      .map((x) => x.slice(1));
    const removals = rest
      .slice(1)
      .filter((x) => x.startsWith('-'))
      .map((x) => x.slice(1));
    const others = rest.slice(1).filter((x) => !/^[+-]/.test(x));
    if (others.length) error(t('cli.tag.prefix', { tags: others.join(' ') }));
    const tags = updateTags(db, id, additions, removals);
    if (opts.json) return json({ ok: true, id, tags });
    console.log(`#${id} : ${tags.join(', ') || t('cli.tag.none')}`);
  },

  link(args) {
    const { v, pos } = analyze(args, {});
    const { db } = context(v);
    const id = whole(pos[0], 'id');
    if (!offerById(db, id)) notFound(t('cli.offerNotFound', { id }));
    if (pos[1] === undefined) error(t('cli.link.expected'));
    try {
      updateLink(db, id, pos[1] === '-' ? null : pos[1]);
    } catch (e) {
      error((e as Error).message);
    }
    const o = offerById(db, id)!;
    if (v.json) return json({ ok: true, id, url: o.canonical_url });
    console.log(`#${id} : ${o.canonical_url ?? t('cli.link.none')}`);
  },
};
