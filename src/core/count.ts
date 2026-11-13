// Longueur des messages à copier-coller : chaque bloc encadré par « ──── début … ──── » / « ──── fin … ──── »
// (en anglais : « ──── start … ──── » / « ──── end … ──── »),
// ou le texte entier s'il n'y a pas de bloc. Caractères comptés comme les formulaires (points de code).

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
  // Séparateurs français (« début » / « fin ») ou anglais (« start » / « end »).
  const re = /^─+[^\n]*(?:début|start)[^\n]*\n([\s\S]*?)\n─+[^\n]*(?:fin|end)[^\n]*$/gm;
  for (const m of text.matchAll(re)) blocks.push(measure(m[1].trim()));
  return blocks.length ? blocks : [measure(text.trim())];
}
