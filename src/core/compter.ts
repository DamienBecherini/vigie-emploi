// Longueur des messages à copier-coller : chaque bloc encadré par « ──── début … ──── » / « ──── fin … ──── »
// (en anglais : « ──── start … ──── » / « ──── end … ──── »),
// ou le texte entier s'il n'y a pas de bloc. Caractères comptés comme les formulaires (points de code).

export interface MesureBloc {
  debut: string;
  caracteres: number;
  mots: number;
}

function mesurer(s: string): MesureBloc {
  return { debut: s.slice(0, 60), caracteres: [...s].length, mots: s.split(/\s+/).filter(Boolean).length };
}

export function compterTexte(brut: string): MesureBloc[] {
  const texte = brut.replace(/\r\n/g, '\n');
  const blocs: MesureBloc[] = [];
  // Séparateurs français (« début » / « fin ») ou anglais (« start » / « end »).
  const re = /^─+[^\n]*(?:début|start)[^\n]*\n([\s\S]*?)\n─+[^\n]*(?:fin|end)[^\n]*$/gm;
  for (const m of texte.matchAll(re)) blocs.push(mesurer(m[1].trim()));
  return blocs.length ? blocs : [mesurer(texte.trim())];
}
