// Tools, prompts and resource of the MCP server for a client without access to files nor to a terminal (Claude Desktop…):
// creation of the workspace, workspace instructions as prompts, files confined to the data folder, CV as PDF, counting.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { APP_ROOT } from '../core/config.ts';
import { pathInWorkspace, moveWorkspace, writeWorkspace, readWorkspace, listWorkspace, refuse, EXTENSIONS_WRITE } from '../core/access-files.ts';
import { textPdf, textDocx, TYPES_IMAGE } from '../core/extraction.ts';
import { countText } from '../core/count.ts';
import { chooseTemplate, TEMPLATE_DEFAULT, generateCv, listTemplates, findBrowser } from '../cv/cv.ts';
import { analyzePages } from '../cv/pages.ts';
import { initializeWorkspace } from '../init/init.ts';
import { toggle, folderByDefault, workspaceExists, messageNotInitialized, type StateMcp } from './state.ts';
import { on, onContent } from './results.ts';
import { bi, bt, languageNameEn, tm, tu, type Bilingual, type KeyMcp } from './texts.ts';
import { LANGUAGES, type Language } from '../i18n/index.ts';

const slash = (p: string) => p.replace(/\\/g, '/');

/** Image passed to the AI: beyond this, most clients refuse it. */
const IMAGE_MAX = 5 * 1024 * 1024;

/** Text file read in chunks beyond this size (response the AI can read in full). */
const CHUNK_TEXT = 24_000;

/** Workspace instructions exposed as prompts: name → files read from the disk at each call. */
const PROMPTS: Record<string, { title: Bilingual; description: Bilingual; file: string; instruction: KeyMcp }> = {
  onboarding: {
    title: bt('workspace.PROMPTS.onboarding.title'),
    description: bt('workspace.PROMPTS.onboarding.description'),
    file: 'DEMARRAGE.md',
    instruction: 'workspace.PROMPTS.onboarding.instruction',
  },
  'process-emails': {
    title: bt('workspace.PROMPTS.process_emails.title'),
    description: bt('workspace.PROMPTS.process_emails.description'),
    file: 'procedures/traiter-emails.md',
    instruction: 'workspace.PROMPTS.process_emails.instruction',
  },
  'prepare-go': {
    title: bt('workspace.PROMPTS.prepare_go.title'),
    description: bt('workspace.PROMPTS.prepare_go.description'),
    file: 'procedures/preparer-go.md',
    instruction: 'workspace.PROMPTS.prepare_go.instruction',
  },
  'targeted-cv': {
    title: bt('workspace.PROMPTS.cv_target.title'),
    description: bt('workspace.PROMPTS.cv_target.description'),
    file: 'procedures/cv-cible.md',
    instruction: 'workspace.PROMPTS.cv_target.instruction',
  },
};

/** Expands "~" and resolves a relative folder from the home folder (the current folder of an MCP client is unpredictable). */
function folderChosen(d: string | undefined): string {
  if (!d?.trim()) return folderByDefault();
  const t = d.trim().replace(/^~(?=$|[\\/])/, homedir());
  return resolve(homedir(), t);
}

function readInstruction(folder: string, file: string): string {
  const path = join(folder, file);
  if (!existsSync(path)) return tm('workspace.readInstruction', { file: String(file), p2: String(slash(folder)) });
  return readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
}

export function saveToolsWorkspace(server: McpServer, state: StateMcp, data: () => string): void {
  const reading = { readOnlyHint: true, openWorldHint: false };
  /** Folder that a next session will find again without changing anything in the client's configuration. */
  const folderOfOnboarding = resolve(state.config.dataDir);

  // ---------------------------------------------------------------------------------------------
  // Prompts and resource: workspace instructions, read again from the disk at each call.

  for (const [name, p] of Object.entries(PROMPTS)) {
    const argsSchema =
      name === 'targeted-cv'
        ? { offer: z.string().optional().describe(tm('workspace.argsSchema.offer')) }
        : undefined;
    server.registerPrompt(
      name,
      { title: bi(p.title), description: bi(p.description), ...(argsSchema ? { argsSchema } : {}) },
      (args: { offer?: string }): GetPromptResult => {
        let text: string;
        if (!state.db) {
          const d = slash(state.config.dataDir);
          text =
            name === 'onboarding'
              ? tm('workspace.saveToolsWorkspace', { language: languageNameEn(state.config.language), p1: String(messageNotInitialized(state)), d: String(d) })
              : tm('workspace.saveToolsWorkspace2', { p1: String(messageNotInitialized(state)) });
        } else {
          const folder = state.config.dataDir;
          const target = args?.offer?.trim();
          const offer = target ? `\n\n${tm('workspace.offer', { target: String(target) })}` : '';
          text =
            tm('workspace.saveToolsWorkspace3', { folder: slash(folder), access: tm('workspace.ACCESS_WITHOUT_FILES') }) +
            `===== AGENTS.md (${tm('workspace.saveToolsWorkspace4')}) =====\n\n${readInstruction(folder, 'AGENTS.md')}\n\n` +
            `===== ${p.file} =====\n\n${readInstruction(folder, p.file)}\n\n` +
            `=====\n\n${tm(p.instruction, { language: languageNameEn(state.config.language) })}${offer}`;
        }
        return { description: bi(p.title), messages: [{ role: 'user', content: { type: 'text', text: text } }] };
      },
    );
  }

  server.registerResource(
    'instructions',
    'vigie-emploi://workspace/AGENTS.md',
    {
      title: tu('workspace.instructions.title'),
      description: tm('workspace.instructions.description'),
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: state.db ? readInstruction(state.config.dataDir, 'AGENTS.md') : messageNotInitialized(state),
        },
      ],
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Espace

  server.registerTool(
    'workspace_state',
    {
      title: tu('workspace.workspace_state.title'),
      description: tm('workspace.workspace_state.description'),
      inputSchema: {},
      annotations: reading,
    },
    on(() => {
      const folder = state.config.dataDir;
      const initialized = Boolean(state.db);
      return {
        folder: slash(folder),
        initialized,
        default_folder: state.byDefault,
        message: initialized ? null : messageNotInitialized(state),
        onboarding_done: initialized ? !/À COMPLÉTER|TO BE COMPLETED/.test(readInstruction(folder, '_CONTEXTE.md').split('\n')[0] ?? '') : false,
        browser_pdf: findBrowser(),
        cv_template: initialized && existsSync(join(folder, 'cv', 'gabarit', 'gabarit.css')) ? 'cv/gabarit' : tm('workspace.workspace_state.cv_template'),
        language: state.config.language,
        prompts: Object.keys(PROMPTS),
      };
    }),
  );

  server.registerTool(
    'initialize_workspace',
    {
      title: tu('workspace.initialize_workspace.title'),
      description: tm('workspace.initialize_workspace.description', { p1: String(slash(state.config.dataDir)) }),
      inputSchema: {
        folder: z
          .string()
          .optional()
          .describe(
            tm('workspace.initialize_workspace.inputSchema.folder'),
          ),
        template: z
          .string()
          .optional()
          .describe(tm('workspace.initialize_workspace.inputSchema.template')),
        language: z
          .enum(LANGUAGES)
          .optional()
          .describe(
            tm('workspace.initialize_workspace.inputSchema.language', { language: String(state.config.language) }),
          ),
      },
    },
    on(({ folder, template, language }: { folder?: string; template?: string; language?: Language }) => {
      const target = folder?.trim() ? folderChosen(folder) : resolve(state.config.dataDir);
      const app = resolve(APP_ROOT);
      const toTarget = relative(app, target);
      if (!toTarget || (!toTarget.startsWith('..') && !isAbsolute(toTarget))) {
        refuse(
          tm('workspace.initialize_workspace', { p1: String(slash(target)), p2: String(slash(folderByDefault())) }),
        );
      }
      if (workspaceExists(target)) {
        const open = state.db && resolve(state.config.dataDir).toLowerCase() === target.toLowerCase();
        refuse(
          open
            ? tm('workspace.initialize_workspace_2', { p1: String(slash(target)) })
            : tm('workspace.initialize_workspace_3', { p1: String(slash(target)) }),
        );
      }
      const r = initializeWorkspace({ folder: target, template, language: language ?? state.config.language });
      toggle(state, target);
      const persistent = target.toLowerCase() === folderOfOnboarding.toLowerCase();
      return {
        ok: true,
        folder: r.folder,
        browser_pdf: r.browser,
        warnings: [
          ...r.warnings,
          ...(persistent
            ? []
            : [
                tm('workspace.initialize_workspace.warnings', { p1: String(slash(folderOfOnboarding)), folder: String(r.folder) }),
              ]),
        ],
        more: [
          tm('workspace.initialize_workspace.suite', { folder: String(r.folder) }),
          tm('workspace.initialize_workspace.suite_2'),
        ],
      };
    }),
  );

  // ---------------------------------------------------------------------------------------------
  // Fichiers de l'espace

  server.registerTool(
    'list_files',
    {
      title: tu('workspace.list_files.title'),
      description: tm('workspace.list_files.description'),
      inputSchema: {
        folder: z.string().optional().describe(tm('workspace.list_files.inputSchema.folder')),
        depth: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe(tm('workspace.list_files.inputSchema.depth')),
      },
      annotations: reading,
    },
    on(({ folder, depth }) => listWorkspace(data(), folder ?? '.', depth ?? 1)),
  );

  server.registerTool(
    'read_file',
    {
      title: tu('workspace.read_file.title'),
      description: tm('workspace.read_file.description'),
      inputSchema: {
        path: z.string().min(1).describe(tm('workspace.read_file.inputSchema.path')),
        start: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            tm('workspace.read_file.inputSchema.start', { CHUNK_TEXT: String(CHUNK_TEXT) }),
          ),
      },
      annotations: reading,
    },
    onContent(async ({ path, start }): Promise<CallToolResult> => {
      const l = readWorkspace(data(), path);
      /** Whole text, or the requested chunk if it is long. */
      const chunk = (text: string): CallToolResult => {
        const d = start ?? 0;
        if (d === 0 && text.length <= CHUNK_TEXT) return { content: [{ type: 'text', text: text }] };
        const end = Math.min(text.length, d + CHUNK_TEXT);
        const more =
          end < text.length
            ? tm('workspace.read_file', { end: String(end) })
            : tm('workspace.read_file_2');
        const header = tm('workspace.read_file_3', { path: String(l.path), d: String(d), end: String(end), length: String(text.length), more: String(more) });
        return { content: [{ type: 'text', text: `${header}\n\n${text.slice(d, end)}` }] };
      };
      if (l.kind === 'text') return chunk(l.text);
      if (l.extension === '.pdf') {
        const { pages, text, links } = await textPdf(l.data);
        if (text.join('').trim().length > 20) {
          const titleLinks = tm('workspace.read_file_4');
          const body = text
            .map((t, i) => `----- page ${i + 1} / ${pages} -----\n${t}${links[i]?.length ? `\n\n${titleLinks} : ${links[i].join(' · ')}` : ''}`)
            .join('\n\n');
          return chunk(tm('workspace.read_file_5', { path: String(l.path), pages: String(pages), body: String(body) }));
        }
        return {
          content: [
            {
              type: 'text',
              text: tm('workspace.read_file.content.text', { path: String(l.path), pages: String(pages) }),
            },
            { type: 'resource', resource: { uri: `file:///${slash(pathInWorkspace(data(), l.path).absolute).replace(/^\/+/, '')}`, mimeType: 'application/pdf', blob: l.data.toString('base64') } },
          ],
        };
      }
      const typeImage = TYPES_IMAGE[l.extension];
      if (typeImage) {
        if (l.size > IMAGE_MAX) refuse(
            tm('workspace.read_file_6', { p1: String(Math.round(l.size / 1024)) }),
          );
        return {
          content: [
            { type: 'text', text: tm('workspace.read_file.content.text_2', { path: String(l.path), p2: String(Math.round(l.size / 1024)) }) },
            { type: 'image', data: l.data.toString('base64'), mimeType: typeImage },
          ],
        };
      }
      if (l.extension === '.docx') {
        const text = textDocx(l.data);
        if (text) return chunk(tm('workspace.read_file_7', { path: String(l.path), text: String(text) }));
      }
      refuse(
        tm('workspace.read_file_8', { path: String(l.path), p2: String(l.extension || 'sans extension'), p3: String(l.extension || 'no extension') }),
      );
    }),
  );

  server.registerTool(
    'write_file',
    {
      title: tu('workspace.write_file.title'),
      description: tm('workspace.write_file.description', { p1: String(EXTENSIONS_WRITE.join(', ')) }),
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe(tm('workspace.write_file.inputSchema.path')),
        content: z.string().describe(tm('workspace.write_file.inputSchema.content')),
        create_only: z.boolean().optional().describe(tm('workspace.write_file.inputSchema.create_only')),
      },
      annotations: { destructiveHint: true, openWorldHint: false },
    },
    on(({ path, content, create_only }) => ({ ok: true, ...writeWorkspace(data(), path, content, { createOnly: create_only }) })),
  );

  server.registerTool(
    'move_file',
    {
      title: tu('workspace.move_file.title'),
      description: tm('workspace.move_file.description'),
      inputSchema: {
        source: z.string().min(1).describe(tm('workspace.move_file.inputSchema.source')),
        destination: z.string().min(1).describe(tm('workspace.move_file.inputSchema.destination')),
      },
    },
    on(({ source, destination }) => ({ ok: true, ...moveWorkspace(data(), source, destination) })),
  );

  // ---------------------------------------------------------------------------------------------
  // CV and text

  /** Clickable link to a local file (file:///D:/… on Windows, file:///home/… elsewhere), spaces and accents encoded. */
  const linkFile = (absolute: string) => pathToFileURL(absolute).href;

  server.registerTool(
    'generate_cv',
    {
      title: tu('workspace.generate_cv.title'),
      description: tm('workspace.generate_cv.description'),
      inputSchema: {
        path: z.string().min(1).describe(tm('workspace.generate_cv.inputSchema.path')),
        capture: z.boolean().optional().describe(tm('workspace.generate_cv.inputSchema.capture')),
      },
    },
    onContent(async ({ path, capture }): Promise<CallToolResult> => {
      const workspace = data();
      const c = pathInWorkspace(workspace, path);
      if (extname(c.absolute).toLowerCase() !== '.md') refuse(tm('workspace.generate_cv', { relative: String(c.relative) }));
      if (!c.exists) refuse(tm('workspace.generate_cv_2', { relative: String(c.relative) }));
      const browser = findBrowser();
      if (!browser) {
        refuse(
          tm('workspace.generate_cv_3'),
        );
      }
      const local = join(workspace, 'cv', 'gabarit');
      const template = existsSync(join(local, 'gabarit.css')) ? local : TEMPLATE_DEFAULT;
      const pdfBefore = c.absolute.replace(/\.md$/i, '.pdf');
      const pdfExisted = existsSync(pdfBefore);
      const r = generateCv(c.absolute, template, browser, { capture: Boolean(capture) });
      const rel = (p: string) => slash(relative(workspace, p));
      const layout = await analyzePages(readFileSync(r.pdf)).catch((e: Error) => ({
        pages: [],
        warnings: [tm('workspace.generate_cv.warnings', { message: String(e.message) })],
      }));
      const info = {
        ok: true,
        pdf: rel(r.pdf),
        pages: r.pages,
        exceeded_2_pages: r.pages > 2,
        fill: layout.pages.map((p) => tm('workspace.generate_cv.fill', { page: String(p.page), fill: String(p.fill) })),
        warnings: [
          ...(r.pages > 2
            ? [
                tm('workspace.generate_cv.warnings_2', { pages: String(r.pages) }),
              ]
            : []),
          ...layout.warnings,
        ],
        pdf_existed: pdfExisted,
        template: template === local ? 'cv/gabarit' : tm('workspace.generate_cv.template'),
        capture: r.capture ? rel(r.capture) : null,
        links: { pdf: linkFile(r.pdf), markdown: linkFile(c.absolute) },
        to_tell: tm('workspace.generate_cv.to_tell', { p1: String(linkFile(r.pdf)), p2: String(linkFile(c.absolute)) }),
      };
      const content: CallToolResult['content'] = [{ type: 'text', text: JSON.stringify(info, null, 2) }];
      if (r.capture) content.push({ type: 'image', data: readFileSync(r.capture).toString('base64'), mimeType: 'image/png' });
      return { content };
    }),
  );

  server.registerTool(
    'count',
    {
      title: tu('workspace.count.title'),
      description: tm('workspace.count.description'),
      inputSchema: {
        text: z.string().optional().describe(tm('workspace.count.inputSchema.text')),
        path: z.string().optional().describe(tm('workspace.count.inputSchema.path')),
      },
      annotations: reading,
    },
    on(({ text, path }) => {
      if (text === undefined && !path) refuse(tm('workspace.count'));
      if (text !== undefined) return { ok: true, blocks: countText(text) };
      const l = readWorkspace(data(), path!);
      if (l.kind !== 'text') refuse(tm('workspace.count_2', { path: String(l.path) }));
      return { ok: true, file: l.path, blocks: countText(l.text) };
    }),
  );

  server.registerTool(
    'list_templates',
    {
      title: tu('workspace.list_templates.title'),
      description: tm('workspace.list_templates.description'),
      inputSchema: {},
      annotations: reading,
    },
    on(() => ({ templates: listTemplates() })),
  );

  server.registerTool(
    'choose_template',
    {
      title: tu('workspace.choose_template.title'),
      description: tm('workspace.choose_template.description'),
      inputSchema: { name: z.string().min(1).describe(tm('workspace.choose_template.inputSchema.name')) },
    },
    on(({ name }) => {
      const workspace = data();
      const r = chooseTemplate(workspace, name);
      return { ok: true, folder: slash(relative(workspace, r.folder)), old: r.old ? slash(relative(workspace, r.old)) : null };
    }),
  );

}
