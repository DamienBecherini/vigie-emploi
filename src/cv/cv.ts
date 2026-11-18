// CV in Markdown -> HTML -> A4 PDF (headless Chrome or Edge).
// The template is a folder: gabarit.css, its fonts, and an optional photo (portrait.webp|jpg|jpeg|png).
// The intermediate HTML is written into <template>/apercu/ (it points to ../gabarit.css), the PDF next to the .md. The page count is the indicator to watch (target: 2).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { marked, type Token, type Tokens } from 'marked';
import { APP_ROOT, variable } from '../core/config.ts';
import { capturePages } from './pages.ts';
import { LANGUAGE_DEFAULT, languageCurrent, t, type Language } from '../i18n/index.ts';
import { AppError } from '../core/errors.ts';

/** Template shipped with the application. */
export const TEMPLATE_DEFAULT = join(APP_ROOT, 'templates', 'cv', 'plain');

/**
 * Sections rendered on two columns (short lists), recognized by their French or English title,
 * whatever the configured language: Compétences (techniques), Formations, Certifications, Langues;
 * Skills, Technical Skills, Key Competencies, Education (& Certifications), Certifications, Languages.
 * The other sections (Résumé / Summary, Expérience / Experience…) stay on one column.
 */
export const SECTIONS_TWO_COLUMNS = /compétences|competences|competencies|formations|certifications|langues|skills|education|languages/i;

/**
 * Usual section titles of a CV in the languages other than the default one: a CV that has at least two of them is declared
 * in that language (lang attribute). A language missing from the table is simply never detected.
 */
const SECTIONS_BY_LANGUAGE: Partial<Record<Language, RegExp>> = {
  en: /^(summary|profile|professional summary|about me|(work |professional )?experience|employment history|(technical |key |core )?skills|(key |core )?competencies|education|education (&|and) certifications|certifications|languages|projects|interests)$/i,
};

/** Manual page break markers: <!-- saut-de-page -->, its English alias <!-- page-break -->, or a break-after div. */
const PAGE_BREAK = /saut-de-page|page-break|break-after/i;

/** Language of a Markdown CV from its section titles: the first language of which it has at least two usual titles, otherwise the default language. */
export function cvLanguage(markdown: string): Language {
  const titles = [...markdown.matchAll(/^##[ \t]+(.+?)[ \t#]*$/gm)].map((m) => m[1].replace(/[*_]/g, '').trim());
  for (const [language, pattern] of Object.entries(SECTIONS_BY_LANGUAGE) as [Language, RegExp][]) {
    if (titles.filter((x) => pattern.test(x)).length >= 2) return language;
  }
  return LANGUAGE_DEFAULT;
}

const ICONS: Record<string, string> = {
  mail: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h15A2.5 2.5 0 0 1 22 5.5v13A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-13Zm2.2-.5 7.8 6.1L19.8 5H4.2ZM20 7.4l-7.4 5.8a1 1 0 0 1-1.2 0L4 7.4V19h16V7.4Z"/>',
  phone:
    '<path d="M6.6 2.5a1.8 1.8 0 0 1 2.5.6l1.7 2.8c.4.7.3 1.6-.3 2.1l-1.3 1.2a12 12 0 0 0 4.6 4.6l1.2-1.3c.5-.6 1.4-.7 2.1-.3l2.8 1.7a1.8 1.8 0 0 1 .6 2.5l-1.2 1.9a3 3 0 0 1-3.4 1.3C11.1 18.2 5.8 12.9 4.4 6.1A3 3 0 0 1 5.7 2.7l.9-.2Z"/>',
  pin: '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.2A2.8 2.8 0 1 0 12 11.8 2.8 2.8 0 0 0 12 6.2Z"/>',
  globe:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15 15 0 0 0-1.2-5.5A8 8 0 0 1 18.9 11ZM12 4.2c.9 1.3 1.7 3.6 1.9 6.8h-3.8c.2-3.2 1-5.5 1.9-6.8ZM5.1 11a8 8 0 0 1 4.2-5.5A15 15 0 0 0 8.1 11h-3Zm0 2h3a15 15 0 0 0 1.2 5.5A8 8 0 0 1 5.1 13Zm6.9 6.8c-.9-1.3-1.7-3.6-1.9-6.8h3.8c-.2 3.2-1 5.5-1.9 6.8Zm2.7-1.3a15 15 0 0 0 1.2-5.5h3a8 8 0 0 1-4.2 5.5Z"/>',
  clock: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6Zm-1.1 3v5.4l4.3 2.6 1.1-1.8-3.3-2V7.2h-2.1Z"/>',
  linkedin:
    '<path d="M6.5 8A1.5 1.5 0 1 0 6.5 5a1.5 1.5 0 0 0 0 3ZM5 10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8Zm6 9h1a1 1 0 0 0 1-1v-4.5c0-1.5 3-2.5 3-.5V18a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-6c0-2-1.5-3-3.5-3S13 10.5 13 10.5V10a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1Zm9-18a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3h16Zm1 3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4Z"/>',
  github:
    '<path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.1 4 18.1 4.3 18.1 4.3c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"/>',
  // Chain (two links) for the other profiles (Malt, GitLab, platform portfolio…).
  link: '<path d="M3.7 12a5.1 5.1 0 0 1 5.1-5.1h3.4v2.2H8.8a2.9 2.9 0 0 0 0 5.8h3.4v2.2H8.8A5.1 5.1 0 0 1 3.7 12Zm6.2 1.1h4.2v-2.2H9.9v2.2Zm6.2-6.2h-3.4v2.2h3.4a2.9 2.9 0 1 1 0 5.8h-3.4v2.2h3.4a5.1 5.1 0 0 0 0-10.2Z"/>',
};

const PROFILES = /linkedin|github|gitlab|malt|behance|dribbble|stackoverflow|codeur|free-?work/;
const PHONE = /^\D*(\+?\d[\d\s().-]{7,})\D*$/;
const AVAILABILITY = /disponib|immédiat|immediat|availab/;

function isProfile(text: string): boolean {
  return PROFILES.test(text.toLowerCase());
}

/** Address / location: everything that is neither a contact means nor a profile. */
function isAddress(text: string): boolean {
  if (isProfile(text)) return false;
  const t = text.toLowerCase();
  if (/@/.test(t) && !/https?:/.test(t)) return false;
  if (AVAILABILITY.test(t)) return false;
  if (PHONE.test(text)) return false;
  if (/portfolio|https?:|\.[a-z]{2,6}\b\/?$/.test(t)) return false;
  return true;
}

function icon(text: string): string {
  const t = text.toLowerCase();
  let name = 'pin';
  if (/linkedin/.test(t)) name = 'linkedin';
  else if (/github/.test(t)) name = 'github';
  else if (PROFILES.test(t)) name = 'link';
  else if (/@/.test(t) && !/https?:/.test(t)) name = 'mail';
  else if (AVAILABILITY.test(t)) name = 'clock';
  else if (PHONE.test(text)) name = 'phone';
  else if (/https?:|portfolio|\.[a-z]{2,6}\b/.test(t)) name = 'globe';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

const inline = (text: string): string => marked.parseInline(text) as string;

/** Heading of an experience: "01/2019 – aujourd'hui · Lyon" or "… | Lyon". */
function metaJob(title: string): string {
  const parts = title
    .split(/\s+[·|]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<div class="job-meta">${parts.map((p) => `<span>${inline(p)}</span>`).join('')}</div>`;
}

function renderToken(t: Token): string {
  if (t.type === 'paragraph') return `<p>${inline((t as Tokens.Paragraph).text)}</p>`;
  if (t.type === 'list') return `<ul>${(t as Tokens.List).items.map((it) => `<li>${inline(it.text)}</li>`).join('')}</ul>`;
  if (t.type === 'blockquote') {
    const lines = ((t as Tokens.Blockquote).tokens ?? [])
      .filter((x) => x.type === 'paragraph')
      .map((x) => `<p>${inline((x as Tokens.Paragraph).text)}</p>`)
      .join('');
    return `<blockquote>${lines}</blockquote>`;
  }
  if (t.type === 'space' || t.type === 'hr') return '';
  if (t.type === 'html') return t.raw;
  if (t.raw) return `<p>${inline(t.raw.trim())}</p>`;
  return '';
}

export interface OptionsHtml {
  /** Stylesheet, relative to the produced HTML. */
  css: string;
  /** Photo, relative to the produced HTML (absent: no photo). */
  portrait?: string | null;
  language?: string;
}

/**
 * Expected structure:
 * `# First name LAST NAME`, title in **bold**, subtitle in *italics*, contact lines (separated by "·"),
 * then `##` sections; in the experience, a job = `### dates · location` followed by a bold line (the job title).
 */
export function cvToHtml(markdown: string, o: OptionsHtml): string {
  const tokens = marked.lexer(markdown);
  const output: string[] = [];
  let i = 0;

  let name = '';
  const h1 = tokens.find((t) => t.type === 'heading' && (t as Tokens.Heading).depth === 1) as Tokens.Heading | undefined;
  if (h1) {
    name = inline(h1.text);
    i = tokens.indexOf(h1) + 1;
  }

  const header: Token[] = [];
  while (i < tokens.length && !(tokens[i].type === 'heading' && (tokens[i] as Tokens.Heading).depth === 2)) {
    header.push(tokens[i]);
    i += 1;
  }

  let title = '';
  let subTitle = '';
  const contacts: string[] = [];
  for (const t of header) {
    if (t.type === 'paragraph') {
      const lines = (t as Tokens.Paragraph).text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        const isSub = /^\*\(.+\)\*$/.test(line) || /^[*_][^*_].*[*_]$/.test(line);
        if (!title && /^\*\*/.test(line) && !/·/.test(line)) title = inline(line.replace(/^\*\*|\*\*$/g, ''));
        else if (!subTitle && isSub) subTitle = inline(line.replace(/^\*|\*$/g, ''));
        else
          contacts.push(
            ...line
              .split(/\s+·\s+/)
              .map((s) => s.trim())
              .filter(Boolean),
          );
      }
    } else if (t.type === 'list') {
      contacts.push(...(t as Tokens.List).items.map((it) => it.text.trim()));
    }
  }

  const elements = contacts.map((raw) => {
    // "**E-mail:** value": the value stays, the label chooses the icon.
    const label = raw.match(/^\*\*([^*]+?)\s*:\*\*\s*(.+)$/);
    const value = label ? label[2].trim() : raw;
    const index = label ? `${label[1]} ${value}` : value;
    const kind = isProfile(index) ? 'profil' : isAddress(index) ? 'address' : 'principal';
    return { kind, html: `<li>${icon(index)}<span>${inline(value)}</span></li>` };
  });
  const group = (kind: string, cls: string) => {
    const items = elements.filter((c) => c.kind === kind).map((c) => c.html);
    return items.length ? `<ul class="contacts${cls ? ` ${cls}` : ''}">\n${items.join('\n')}\n</ul>` : '';
  };
  const blockContacts = [group('principal', ''), group('address', 'contacts-address'), group('profil', 'contacts-profiles')].filter(Boolean).join('\n');

  output.push(`<header class="cv-header">
<div class="cv-id">
${name ? `<h1>${name}</h1>` : ''}
${title ? `<div class="headline">${title}</div>` : ''}
${subTitle ? `<div class="subline">${subTitle}</div>` : ''}
${blockContacts}
</div>
${o.portrait ? `<img class="portrait" src="${o.portrait}" alt="">` : ''}
</header>`);

  let section: { title: string; twoColumns: boolean; body: string[] } | null = null;
  let machine: { meta: string; body: string[] } | null = null;
  const closeJob = () => {
    if (machine && section) section.body.push(`<div class="job">${machine.meta}<div class="job-body">${machine.body.join('\n')}</div></div>`);
    machine = null;
  };
  const closeSection = () => {
    if (section) output.push(`<section class="${section.twoColumns ? 'two-col' : ''}"><h2>${section.title}</h2>\n${section.body.join('\n')}</section>`);
    section = null;
  };

  for (; i < tokens.length; i += 1) {
    const t = tokens[i];
    // Manual page break (<!-- saut-de-page -->, <!-- page-break --> or a break-after div): it closes the current job and section,
    // otherwise it would stay locked in the last job, with no effect.
    if (t.type === 'html' && PAGE_BREAK.test(t.raw)) {
      closeJob();
      closeSection();
      output.push('<div class="saut-de-page" style="break-after: page"></div>');
      continue;
    }
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 2) {
      closeJob();
      closeSection();
      const text = (t as Tokens.Heading).text;
      section = { title: inline(text), twoColumns: SECTIONS_TWO_COLUMNS.test(text), body: [] };
      continue;
    }
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      closeJob();
      machine = { meta: metaJob((t as Tokens.Heading).text), body: [] };
      continue;
    }
    const html = renderToken(t);
    if (!html) continue;
    const p = machine as { meta: string; body: string[] } | null;
    const s = section as { body: string[] } | null;
    if (p) p.body.push(p.body.length === 0 && /^<p><strong>/.test(html) ? html.replace(/^<p>/, '<p class="job-role">') : html);
    else if (s) s.body.push(html);
    else output.push(html);
  }
  closeJob();
  closeSection();

  return `<!DOCTYPE html>
<html lang="${o.language ?? cvLanguage(markdown)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
<title>CV</title>
<link rel="stylesheet" href="${o.css}">
</head>
<body>
${output.join('\n')}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Browser and PDF

const BROWSERS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const BROWSERS_MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const HEADLESS = join(process.env.HOME ?? '', '.cache', 'chrome-headless');
const HEADLESS_SHELL = join(HEADLESS, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
const BROWSERS_LINUX = [
  HEADLESS_SHELL,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
];

/** First Chrome / Edge / Chromium found (VIGIE_EMPLOI_BROWSER to force one), or null. */
export function findBrowser(env: NodeJS.ProcessEnv = process.env): string | null {
  const forced = variable(env, 'BROWSER');
  if (forced) return existsSync(forced) ? forced : null;
  const list =
    process.platform === 'win32'
      ? [...BROWSERS_WINDOWS, ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')] : [])]
      : process.platform === 'darwin'
        ? BROWSERS_MAC
        : BROWSERS_LINUX;
  return list.find((p) => existsSync(p)) ?? null;
}

function urlFile(path: string): string {
  const p = path.replace(/\\/g, '/');
  return p.startsWith('//') ? `file:${encodeURI(p)}` : `file:///${encodeURI(p.replace(/^\/+/, ''))}`;
}

export function countPages(pdf: string): number {
  const text = readFileSync(pdf).toString('latin1');
  return text.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

export function pathPortrait(folderTemplate: string): string | null {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    if (existsSync(join(folderTemplate, `portrait.${ext}`))) return `portrait.${ext}`;
  }
  return null;
}

function portraitRelative(template: string): string | null {
  const p = pathPortrait(template);
  return p ? `../${p}` : null;
}

export interface ResultCv {
  markdown: string;
  html: string;
  pdf: string;
  pages: number;
  /** PNG image of the real pages of the PDF (capture option), for a visual check without a PDF viewer. */
  capture?: string;
}

/** Generates the PDF of a Markdown CV with the given template (folder containing gabarit.css). */
export function generateCv(markdown: string, folderTemplate: string, browser: string, o: { capture?: boolean } = {}): ResultCv {
  const md = resolve(markdown);
  if (!existsSync(md)) throw new AppError('not-found', t('core.cv.notFound', { path: md }));
  const template = resolve(folderTemplate);
  if (!existsSync(join(template, 'gabarit.css'))) {
    throw new AppError('invalid', t('core.cv.templateIncomplete', { path: join(template, 'gabarit.css') }));
  }
  const name = basename(md).replace(/\.md$/i, '');
  const preview = join(template, 'apercu');
  mkdirSync(preview, { recursive: true });
  const html = join(preview, `${name}.html`);
  const pdf = join(dirname(md), `${name}.pdf`);
  writeFileSync(html, cvToHtml(readFileSync(md, 'utf8'), { css: '../gabarit.css', portrait: portraitRelative(template) }), 'utf8');
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=4000',
      `--print-to-pdf=${pdf}`,
      urlFile(html),
    ],
    {
      stdio: 'pipe',
      env: browser === HEADLESS_SHELL ? { ...process.env, LD_LIBRARY_PATH: join(HEADLESS, 'lib') } : process.env,
    },
  );
  const pages = countPages(pdf);
  const result: ResultCv = { markdown: md, html, pdf, pages };
  if (o.capture) {
    // Real pages of the PDF (rendered by pdf.js), and not the on-screen HTML rendering: the page breaks are those of the PDF.
    const png = join(preview, `${name}.png`);
    capturePages(pdf, png, browser, {
      pages,
      env: browser === HEADLESS_SHELL ? { ...process.env, LD_LIBRARY_PATH: join(HEADLESS, 'lib') } : process.env,
    });
    result.capture = png;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Shipped templates and choice of the workspace's template

export const FOLDER_TEMPLATES = join(APP_ROOT, 'templates', 'cv');

/** Translated descriptions of the shipped templates, by language (the header of the stylesheets, read as a fallback, is in French). */
const DESCRIPTIONS_TEMPLATES: Partial<Record<Language, Record<string, string>>> = {
  en: {
    compact: '"compact" template — dense single-column CV, for long careers or a one-page CV.',
    modern: '"modern" template — 2-page A4 CV, sans-serif (Source Sans 3, SIL OFL licence, see fonts/OFL.txt).',
    plain:
      '"plain" template — 2-page A4 CV: header with an optional round photo, contact details in three rows, two-column sections for skills, education and languages.',
  },
};

/** Templates shipped with the application: folder name and first sentence of the header of gabarit.css. */
export function listTemplates(): { name: string; description: string }[] {
  return readdirSync(FOLDER_TEMPLATES)
    .filter((n) => existsSync(join(FOLDER_TEMPLATES, n, 'gabarit.css')))
    .map((name) => {
      const css = readFileSync(join(FOLDER_TEMPLATES, name, 'gabarit.css'), 'utf8');
      const header = css.match(/\/\*([\s\S]*?)\*\//)?.[1] ?? '';
      const phrase =
        header
          .replace(/\s+/g, ' ')
          .trim()
          .split(/(?<=\.)\s/)[0] ?? '';
      // The description comes from the (French) header of the stylesheet; translated for the known shipped templates.
      const translated = DESCRIPTIONS_TEMPLATES[languageCurrent()]?.[name];
      return { name, description: translated ?? phrase };
    });
}

/**
 * Installs a shipped template into <workspace>/cv/gabarit. The old one is renamed cv/gabarit-<YYYYMMDD-HHMMSS>
 * (-2, -3… if that name is taken: nothing is lost); the photo (portrait.*) is carried over into the new one.
 */
export function chooseTemplate(workspace: string, name: string): { folder: string; old: string | null } {
  const source = join(FOLDER_TEMPLATES, name);
  if (!/^[\w-]+$/.test(name) || !existsSync(join(source, 'gabarit.css'))) {
    const names = listTemplates()
      .map((g) => g.name)
      .join(', ');
    throw new AppError('invalid', t('core.cv.templateUnknown', { name, list: names }));
  }
  const target = join(workspace, 'cv', 'gabarit');
  let old: string | null = null;
  if (existsSync(target)) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = join(
      workspace,
      'cv',
      `gabarit-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`,
    );
    // A second change within the same second: -2, -3… (an existing backup is never overwritten).
    old = stamp;
    for (let n = 2; existsSync(old); n++) old = `${stamp}-${n}`;
    renameSync(target, old);
  }
  cpSync(source, target, { recursive: true });
  const portrait = old ? pathPortrait(old) : null;
  if (old && portrait) cpSync(join(old, portrait), join(target, portrait));
  return { folder: target, old };
}
