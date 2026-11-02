// Lecture des tableaux Markdown des registres (sections ## et lignes | … |).

export interface LigneTableau {
  section: string;
  numero: number;
  entetes: string[];
  cellules: string[];
  brut: string;
}

/** Découpe une ligne « | a | b | » en cellules (les \| échappés restent dans la cellule). */
export function cellules(ligne: string): string[] {
  const t = ligne.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
}

const SEPARATEUR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Toutes les lignes de données des tableaux, avec la section ## et les en-têtes du tableau. */
export function lignesTableaux(texte: string): LigneTableau[] {
  const lignes = texte.split(/\r?\n/);
  const r: LigneTableau[] = [];
  let section = '';
  let entetes: string[] | null = null;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const titre = l.match(/^#{2,3}\s+(.*)$/);
    if (titre) {
      section = titre[1].trim();
      entetes = null;
      continue;
    }
    if (!l.trim().startsWith('|')) {
      entetes = null;
      continue;
    }
    if (SEPARATEUR.test(l.trim())) continue;
    if (!entetes) {
      // Première ligne du tableau = en-têtes, si la suivante est un séparateur.
      if (SEPARATEUR.test((lignes[i + 1] ?? '').trim())) {
        entetes = cellules(l);
        continue;
      }
      entetes = [];
    }
    r.push({ section, numero: i + 1, entetes, cellules: cellules(l), brut: l });
  }
  return r;
}

export interface LienMd {
  texte: string;
  url: string;
  index: number;
}

export function liensMarkdown(texte: string): LienMd[] {
  return [...texte.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ texte: m[1], url: m[2], index: m.index! }));
}

/** Découpe un texte sur un séparateur, sans couper à l'intérieur d'un lien Markdown. */
export function decouper(texte: string, sep: string): string[] {
  const r: string[] = [];
  let courant = '';
  const lien = /\[[^\]]*\]\([^)\s]*\)/y;
  for (let i = 0; i < texte.length; ) {
    lien.lastIndex = i;
    const m = lien.exec(texte);
    if (m) {
      courant += m[0];
      i += m[0].length;
    } else if (texte.startsWith(sep, i)) {
      r.push(courant);
      courant = '';
      i += sep.length;
    } else {
      courant += texte[i];
      i++;
    }
  }
  r.push(courant);
  return r.map((s) => s.trim()).filter(Boolean);
}
