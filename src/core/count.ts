// Length of the messages to copy and paste: each block framed by "──── début … ────" / "──── fin … ────"
// (in English: "──── start … ────" / "──── end … ────"),
// or the whole text if there is no block. Characters counted like forms do (code points).

export interface MeasureBlock {
  start: string;
  characters: number;
  words: number;
}

function measure(s: string): MeasureBlock {
  return { start: s.slice(0, 60), characters: [...s].length, words: s.split(/\s+/).filter(Boolean).length };
}

export function countText(raw: string): MeasureBlock[] {
  const text = raw.replace(/\r\n/g, '\n');
  const blocks: MeasureBlock[] = [];
  // French separators ("début" / "fin") or English ones ("start" / "end").
  const re = /^─+[^\n]*(?:début|start)[^\n]*\n([\s\S]*?)\n─+[^\n]*(?:fin|end)[^\n]*$/gm;
  for (const m of text.matchAll(re)) blocks.push(measure(m[1].trim()));
  return blocks.length ? blocks : [measure(text.trim())];
}
