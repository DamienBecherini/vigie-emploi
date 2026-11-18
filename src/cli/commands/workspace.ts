// Commands of the workspace and its tools: init, the résumé templates and generation (templates, template, cv),
// count (characters of a message), and the two servers (serve: dashboard, mcp: MCP server).
import { existsSync, readFileSync } from 'node:fs';
import { loadConfig, normalizeLanguage } from '../../core/config.ts';
import { startServer } from '../../api/server.ts';
import { defaultWorkspace, initializeWorkspace } from '../../init/init.ts';
import { countText } from '../../core/count.ts';
import { chooseTemplate, TEMPLATE_DEFAULT, generateCv, listTemplates, findBrowser } from '../../cv/cv.ts';
import { analyzePages } from '../../cv/pages.ts';
import { isLanguage, LANGUAGES, t } from '../../i18n/index.ts';
import { analyze, error, number, whole } from '../options.ts';
import { context, withoutError, type Command } from '../context.ts';
import { json } from '../format.ts';

export const workspaceCommands: Record<string, Command> = {
  async mcp(args) {
    const { v } = analyze(args, {});
    // The server starts even without a workspace (default folder, initialize_workspace tool): no context() here.
    const { startMcp } = await import('../../mcp/server.ts');
    await startMcp({ dataDir: v.data, fileConfig: v.config });
  },

  async serve(args) {
    const { v } = analyze(args, { port: { type: 'string' }, idle: { type: 'string' } });
    const { config, db } = context(v);
    const port = v.port ? whole(v.port, 'port') : config.port;
    await startServer({ db, config, port, idleMin: number(v.idle, 'idle') ?? 0 });
  },

  init(args) {
    const { v, pos } = analyze(args, { port: { type: 'string' }, 'mcp-name': { type: 'string' }, template: { type: 'string' }, language: { type: 'string' } });
    if (pos.length > 1) error(t('cli.init.usage'));
    const language = typeof v.language === 'string' ? normalizeLanguage(v.language) : undefined;
    if (language !== undefined && !isLanguage(language)) {
      error(t('cli.invalid', { name: '--language', value: `${String(v.language)} (${LANGUAGES.join(', ')})` }));
    }
    const r = initializeWorkspace({
      folder: pos[0] ?? defaultWorkspace(),
      port: v.port ? whole(v.port, 'port') : undefined,
      mcpName: v['mcp-name'],
      template: v.template,
      language,
    });
    if (v.json) return json(r);
    console.log(t('cli.init.created', { folder: r.folder }));
    console.log(t('cli.init.config', { config: r.config, port: r.port, language: r.language }));
    console.log(t('cli.init.mcp', { name: r.mcp_name, mcp: r.mcp }));
    console.log(t('cli.init.browser', { browser: r.browser ?? t('cli.none') }));
    for (const a of r.warnings) console.log(`  ⚠ ${a}`);
    console.log(`\n${t('cli.init.command', { command: r.command })}`);
    console.log(`\n${t('cli.init.steps')}`);
    console.log(t('cli.init.step1', { folder: r.folder }));
    console.log(t('cli.init.step2', { folder: r.folder }));
    console.log(`${t('cli.init.step3')}\n`);
    console.log(r.prompt);
  },

  count(args) {
    const { v, pos } = analyze(args, {});
    if (pos.length !== 1) error(t('cli.count.usage'));
    const result = countText(withoutError(() => readFileSync(pos[0], 'utf8')));
    if (v.json) return json({ ok: true, file: pos[0], blocks: result });
    for (const b of result) {
      console.log(t('cli.count.line', { characters: String(b.characters).padStart(6), words: String(b.words).padStart(4), start: b.start }));
    }
  },

  templates(args) {
    const { v } = analyze(args, {});
    const templates = listTemplates();
    if (v.json) return json({ ok: true, templates });
    for (const g of templates) console.log(`${g.name.padEnd(10)} ${g.description}`);
    console.log(`\n${t('cli.templates.choose')}`);
  },

  template(args) {
    const { v, pos } = analyze(args, {});
    if (pos.length !== 1) error(t('cli.template.usage'));
    const workspace = loadConfig({ dataDir: v.data, fileConfig: v.config }).dataDir;
    const r = withoutError(() => chooseTemplate(workspace, pos[0]));
    if (v.json) return json({ ok: true, ...r });
    console.log(t('cli.template.installed', { name: pos[0], folder: r.folder, old: r.old ? t('cli.template.old', { folder: r.old }) : '' }));
    console.log(t('cli.template.regenerate'));
  },

  async cv(args) {
    const { v, pos } = analyze(args, { template: { type: 'string' }, capture: { type: 'boolean' } });
    if (!pos.length) error(t('cli.cv.usage'));
    let chosen = v.template;
    if (!chosen) {
      let workspace: string | null = null;
      try {
        workspace = loadConfig({ dataDir: v.data, fileConfig: v.config }).dataDir;
      } catch {
        workspace = null;
      }
      const local = workspace ? `${workspace}/cv/gabarit` : null;
      chosen = local && existsSync(`${local}/gabarit.css`) ? local : TEMPLATE_DEFAULT;
    }
    const template = chosen;
    const browser = findBrowser();
    if (!browser) error(t('cli.cv.withoutBrowser'));
    const generated = pos.map((md) => withoutError(() => generateCv(md, template, browser, { capture: Boolean(v.capture) })));
    const results = [];
    for (const r of generated) {
      const layout = await analyzePages(readFileSync(r.pdf)).catch(() => null);
      results.push({ ...r, fill: layout?.pages.map((p) => p.fill) ?? null, warnings: layout?.warnings ?? [] });
    }
    if (v.json) return json({ ok: true, template, cv: results });
    for (const r of results) {
      const rate = r.fill ? ` (${t('cli.cv.fill', { rate: r.fill.map((x) => t('core.pages.percent', { pc: x })).join(', ') })})` : '';
      console.log(`${String(r.pages).padStart(2)} ${t('cli.cv.pages')}  ${r.pdf}${r.pages > 2 ? t('cli.cv.exceeded') : ''}`);
      // Lines read by the tools and the AI (HTML, PDF, IMAGE, PAGES): same labels in both languages.
      if (results.length === 1) console.log(`HTML : ${r.html}\nPDF  : ${r.pdf}${r.capture ? `\nIMAGE : ${r.capture}` : ''}\nPAGES : ${r.pages}${rate}`);
      else if (rate) console.log(`    ${rate.trim()}`);
      for (const a of r.warnings) console.log(`    ! ${a}`);
    }
  },
};
