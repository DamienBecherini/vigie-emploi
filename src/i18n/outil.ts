// Mécanisme de traduction partagé par la CLI, l'API, le suivi généré et l'interface (aucune dépendance Node ici).
// Un dictionnaire par langue, de même type : une clé absente de la traduction anglaise est une erreur de compilation.
// Les textes portent des paramètres « {nom} » ; un texte au pluriel est un objet { one, other } choisi d'après
// le paramètre « n » (règles de pluriel de la langue : en français, 0 et 1 sont au singulier).

export const LANGUES = ['fr', 'en'] as const;
export type Langue = (typeof LANGUES)[number];
export const LANGUE_DEFAUT: Langue = 'fr';

/** Locale utilisée pour les dates et les nombres (Intl) : jour avant le mois dans les deux langues. */
export const LOCALES: Record<Langue, string> = { fr: 'fr-FR', en: 'en-GB' };

export interface Pluriel {
  one: string;
  other: string;
}
export type Texte = string | Pluriel;
export type Params = Record<string, string | number | null | undefined>;

export function estLangue(x: unknown): x is Langue {
  return typeof x === 'string' && (LANGUES as readonly string[]).includes(x);
}

const regles = new Map<Langue, Intl.PluralRules>();
function reglesPluriel(langue: Langue): Intl.PluralRules {
  let r = regles.get(langue);
  if (!r) {
    r = new Intl.PluralRules(LOCALES[langue]);
    regles.set(langue, r);
  }
  return r;
}

/** Remplace les paramètres {nom} ; un paramètre absent laisse le marqueur visible (oubli repérable). */
export function traduire(texte: Texte, langue: Langue, params: Params = {}): string {
  const brut = typeof texte === 'string' ? texte : reglesPluriel(langue).select(Number(params.n ?? 0)) === 'one' ? texte.one : texte.other;
  return brut.replace(/\{(\w+)\}/g, (m, cle: string) => {
    const v = params[cle];
    return v === undefined || v === null ? m : String(v);
  });
}

/** Fonction t(clé, params) sur un jeu de dictionnaires, pour la langue renvoyée par `langue()`. */
export function creerTraducteur<C extends string>(dictionnaires: Record<Langue, Record<C, Texte>>, langue: () => Langue) {
  return (cle: C, params?: Params): string => traduire(dictionnaires[langue()][cle], langue(), params);
}

/** Nombre selon la langue (« 6,5 » en français, « 6.5 » en anglais). */
export function nombreLocal(n: number, langue: Langue, decimales = 2): string {
  return n.toLocaleString(LOCALES[langue], { maximumFractionDigits: decimales });
}
