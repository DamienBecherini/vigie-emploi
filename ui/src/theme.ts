// Palettes de couleurs : chaque palette remplace les gris (classes slate-*) et l'accent (classes blue-*)
// par une famille de Tailwind. Les classes du code ne changent pas : seules les variables CSS changent.
import colors from 'tailwindcss/colors';
import type { Language } from '../../src/i18n/tool.ts';

export const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const;
export const ACCENTS = [
  'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo',
] as const;
export type Neutral = (typeof NEUTRAL)[number];
export type Accent = (typeof ACCENTS)[number];

/** Noms des familles de gris, par langue (une langue ajoutée doit les traduire : erreur de compilation sinon). */
export const LABELS_NEUTRAL: Record<Language, Record<Neutral, string>> = {
  fr: { slate: 'Ardoise (bleuté)', gray: 'Gris', zinc: 'Zinc', neutral: 'Neutre', stone: 'Pierre (chaud)' },
  en: { slate: 'Slate (bluish)', gray: 'Grey', zinc: 'Zinc', neutral: 'Neutral', stone: 'Stone (warm)' },
};
/** Noms des couleurs d'accent, par langue. */
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
  /** Nom et description dans les autres langues ; à défaut, le nom français. */
  translations?: Partial<Record<Language, { name: string; description?: string }>>;
  id: string;
  name: string;
  description?: string;
}

/** Nom et description d'une palette livrée dans la langue voulue (le français à défaut de traduction). */
export function textsPalette(p: PaletteNamed, language: Language): { name: string; description?: string } {
  return p.translations?.[language] ?? { name: p.name, description: p.description };
}

/** Identifiant de la palette réglée par l'utilisateur (une par mode). */
export const PERSONAL = 'personal';

export const PALETTES_LIGHT: PaletteNamed[] = [
  // Sable en tête : palette par défaut, et repli d'une palette inconnue.
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

/** Variables CSS d'une palette : --color-slate-* = gris choisi, --color-blue-* = accent choisi. */
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

/** Couleur d'aperçu (pastilles de la fenêtre Thème). */
export function hue(family: Neutral | Accent, shade: (typeof SHADES)[number]): string {
  return (colors[family] as Record<string, string>)[shade];
}

export function applyPalette(p: Palette) {
  const s = document.documentElement.style;
  for (const [k, val] of Object.entries(variablesPalette(p))) s.setProperty(k, val);
}
