// Reading of the Markdown tables of the registers (## sections and | … | lines).

export interface LineTable {
  section: string;
  number: number;
  headers: string[];
  cells: string[];
  raw: string;
}

/** Splits a "| a | b |" line into cells (escaped \| stay in the cell). */
export function cells(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

const SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** All the data lines of the tables, with the ## section and the headers of the table. */
export function linesTables(text: string): LineTable[] {
  const lines = text.split(/\r?\n/);
  const r: LineTable[] = [];
  let section = '';
  let headers: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const title = l.match(/^#{2,3}\s+(.*)$/);
    if (title) {
      section = title[1].trim();
      headers = null;
      continue;
    }
    if (!l.trim().startsWith('|')) {
      headers = null;
      continue;
    }
    if (SEPARATOR.test(l.trim())) continue;
    if (!headers) {
      // First line of the table = headers, if the next one is a separator.
      if (SEPARATOR.test((lines[i + 1] ?? '').trim())) {
        headers = cells(l);
        continue;
      }
      headers = [];
    }
    r.push({ section, number: i + 1, headers, cells: cells(l), raw: l });
  }
  return r;
}

export interface LinkMd {
  text: string;
  url: string;
  index: number;
}

export function linksMarkdown(text: string): LinkMd[] {
  return [...text.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ text: m[1], url: m[2], index: m.index! }));
}

/** Splits a text on a separator, without cutting inside a Markdown link. */
export function split(text: string, sep: string): string[] {
  const r: string[] = [];
  let current = '';
  const link = /\[[^\]]*\]\([^)\s]*\)/y;
  for (let i = 0; i < text.length; ) {
    link.lastIndex = i;
    const m = link.exec(text);
    if (m) {
      current += m[0];
      i += m[0].length;
    } else if (text.startsWith(sep, i)) {
      r.push(current);
      current = '';
      i += sep.length;
    } else {
      current += text[i];
      i++;
    }
  }
  r.push(current);
  return r.map((s) => s.trim()).filter(Boolean);
}
