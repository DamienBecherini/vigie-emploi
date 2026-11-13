// Colour palettes: each palette replaces the greys (slate-* classes) and the accent (blue-* classes)
// with a Tailwind family. The classes of the code do not change: only the CSS variables change.
import colors from 'tailwindcss/colors';
import type { Language } from '../../src/i18n/tool.ts';

export const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const;
export const ACCENTS = [
  'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo',
] as const;
export type Neutral = (typeof NEUTRAL)[number];
export type Accent = (typeof ACCENTS)[number];

/** Names of the grey families, by language (an added language must translate them: compilation error otherwise). */
export const LABELS_NEUTRAL: Record<Language, Record<Neutral, string>> = {
  fr: { slate: 'Ardoise (bleuté)', gray: 'Gris', zinc: 'Zinc', neutral: 'Neutre', stone: 'Pierre (chaud)' },
  en: { slate: 'Slate (bluish)', gray: 'Grey', zinc: 'Zinc', neutral: 'Neutral', stone: 'Stone (warm)' },
};
/** Names of the accent colours, by language. */
export const LABELS_ACCENTS: Record<Language, Record<Accent, string>> = {
  fr: {
    blue: 'Bleu', sky: 'Ciel', cyan: 'Cyan', teal: 'Sarcelle', emerald: 'Émeraude', green: 'Vert', lime: 'Citron vert',
    yellow: 'Jaune', amber: 'Ambre', orange: 'Orange', red: 'Rouge', rose: 'Rose', pink: 'Rose vif', fuchsia: 'Fuchsia',
    purple: 'Pourpre', violet: 'Violet', indigo: 'Indigo',
  },
  en: {
    blue: 'Blue', sky: 'Sky', cyan: 'Cyan', teal: 'Teal', emerald: 'Emerald', green: 'Green', lime: 'Lime',
    yellow: 'Yellow', amber: 'Amber', orange: 'Orange', red: 'Red', rose: 'Rose', pink: 'Pink', fuchsia: 'Fuchsia',
    purple: 'Purple', violet: 'Violet', indigo: 'Indigo',
  },
};

export interface Palette {
  neutral: Neutral;
  accent: Accent;
}
export interface PaletteNamed extends Palette {
  /** Name and description in the other languages; otherwise, the French name. */
  translations?: Partial<Record<Language, { name: string; description?: string }>>;
  id: string;
  name: string;
  description?: string;
}

/** Name and description of a shipped palette in the wanted language (French if there is no translation). */
export function textsPalette(p: PaletteNamed, language: Language): { name: string; description?: string } {
  return p.translations?.[language] ?? { name: p.name, description: p.description };
}

/** Id of the palette set by the user (one per mode). */
export const PERSONAL = 'personal';

export const PALETTES_LIGHT: PaletteNamed[] = [
  // Sand first: default palette, and fallback for an unknown palette.
  { id: 'sand', name: 'Sable', neutral: 'stone', accent: 'orange', description: 'Gris chauds, accent orange', translations: { en: { name: 'Sand', description: 'Warm greys, orange accent' } } },
  { id: 'blue', name: 'Ardoise bleue', neutral: 'slate', accent: 'blue', description: "La palette d'origine", translations: { en: { name: 'Blue slate', description: 'The original palette' } } },
  { id: 'sage', name: 'Sauge', neutral: 'neutral', accent: 'teal', translations: { en: { name: 'Sage' } } },
  { id: 'lavender', name: 'Lavande', neutral: 'zinc', accent: 'violet', translations: { en: { name: 'Lavender' } } },
  { id: 'raspberry', name: 'Framboise', neutral: 'gray', accent: 'rose', translations: { en: { name: 'Raspberry' } } },
];

export const PALETTES_DARK: PaletteNamed[] = [
  { id: 'warm', name: 'Chaud', neutral: 'stone', accent: 'orange', description: 'Sans lumière bleue', translations: { en: { name: 'Warm', description: 'No blue light' } } },
  { id: 'olive', name: 'Olive', neutral: 'stone', accent: 'lime', description: 'Sans lumière bleue', translations: { en: { name: 'Olive', description: 'No blue light' } } },
  { id: 'embers', name: 'Braise', neutral: 'neutral', accent: 'red', description: 'Sans lumière bleue', translations: { en: { name: 'Embers', description: 'No blue light' } } },
  { id: 'blue-night', name: 'Bleu nuit', neutral: 'slate', accent: 'blue', description: "La palette d'origine", translations: { en: { name: 'Midnight blue', description: 'The original palette' } } },
];

export const PALETTE_LIGHT_DEFAULT = 'sand';
export const PALETTE_DARK_DEFAULT = 'warm';
export const PERSONAL_DEFAULT: Palette = { neutral: 'stone', accent: 'orange' };

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

export function findPalette(list: PaletteNamed[], id: string, personal: Palette): Palette {
  if (id === PERSONAL) return personal;
  return list.find((p) => p.id === id) ?? list[0];
}

/** CSS variables of a palette: --color-slate-* = chosen grey, --color-blue-* = chosen accent. */
export function variablesPalette(p: Palette): Record<string, string> {
  const v: Record<string, string> = {};
  const neutral = colors[p.neutral] as Record<string, string>;
  const accent = colors[p.accent] as Record<string, string>;
  for (const n of SHADES) {
    v[`--color-slate-${n}`] = neutral[n];
    v[`--color-blue-${n}`] = accent[n];
  }
  return v;
}

/** Preview colour (dots of the Theme window). */
export function hue(family: Neutral | Accent, shade: (typeof SHADES)[number]): string {
  return (colors[family] as Record<string, string>)[shade];
}

export function applyPalette(p: Palette) {
  const s = document.documentElement.style;
  for (const [k, val] of Object.entries(variablesPalette(p))) s.setProperty(k, val);
}
