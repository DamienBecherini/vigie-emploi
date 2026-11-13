// Palettes de couleurs : chaque palette remplace les gris (classes slate-*) et l'accent (classes blue-*)
// par une famille de Tailwind. Les classes du code ne changent pas : seules les variables CSS changent.
import couleurs from 'tailwindcss/colors';
import type { Langue } from '../../src/i18n/outil.ts';

export const NEUTRES = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const;
export const ACCENTS = [
  'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo',
] as const;
export type Neutre = (typeof NEUTRES)[number];
export type Accent = (typeof ACCENTS)[number];

/** Noms des familles de gris, par langue (une langue ajoutée doit les traduire : erreur de compilation sinon). */
export const LIBELLES_NEUTRES: Record<Langue, Record<Neutre, string>> = {
  fr: { slate: 'Ardoise (bleuté)', gray: 'Gris', zinc: 'Zinc', neutral: 'Neutre', stone: 'Pierre (chaud)' },
  en: { slate: 'Slate (bluish)', gray: 'Grey', zinc: 'Zinc', neutral: 'Neutral', stone: 'Stone (warm)' },
};
/** Noms des couleurs d'accent, par langue. */
export const LIBELLES_ACCENTS: Record<Langue, Record<Accent, string>> = {
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
  neutre: Neutre;
  accent: Accent;
}
export interface PaletteNommee extends Palette {
  /** Nom et description dans les autres langues ; à défaut, le nom français. */
  traductions?: Partial<Record<Langue, { nom: string; description?: string }>>;
  id: string;
  nom: string;
  description?: string;
}

/** Nom et description d'une palette livrée dans la langue voulue (le français à défaut de traduction). */
export function textesPalette(p: PaletteNommee, langue: Langue): { nom: string; description?: string } {
  return p.traductions?.[langue] ?? { nom: p.nom, description: p.description };
}

/** Identifiant de la palette réglée par l'utilisateur (une par mode). */
export const PERSO = 'perso';

export const PALETTES_CLAIRES: PaletteNommee[] = [
  // Sable en tête : palette par défaut, et repli d'une palette disparue (ancienne « framboise »).
  { id: 'sable', nom: 'Sable', neutre: 'stone', accent: 'orange', description: 'Gris chauds, accent orange', traductions: { en: { nom: 'Sand', description: 'Warm greys, orange accent' } } },
  { id: 'orange', nom: 'Orange', neutre: 'neutral', accent: 'orange', description: 'Gris neutres, accent orange', traductions: { en: { nom: 'Orange', description: 'Neutral greys, orange accent' } } },
  { id: 'bleu', nom: 'Ardoise bleue', neutre: 'slate', accent: 'blue', description: "La palette d'origine", traductions: { en: { nom: 'Blue slate', description: 'The original palette' } } },
  { id: 'sauge', nom: 'Sauge', neutre: 'neutral', accent: 'teal', traductions: { en: { nom: 'Sage' } } },
  { id: 'lavande', nom: 'Lavande', neutre: 'zinc', accent: 'violet', traductions: { en: { nom: 'Lavender' } } },
];

export const PALETTES_SOMBRES: PaletteNommee[] = [
  { id: 'chaud', nom: 'Chaud', neutre: 'stone', accent: 'orange', description: 'Sans lumière bleue', traductions: { en: { nom: 'Warm', description: 'No blue light' } } },
  { id: 'olive', nom: 'Olive', neutre: 'stone', accent: 'lime', description: 'Sans lumière bleue', traductions: { en: { nom: 'Olive', description: 'No blue light' } } },
  { id: 'braise', nom: 'Braise', neutre: 'neutral', accent: 'red', description: 'Sans lumière bleue', traductions: { en: { nom: 'Embers', description: 'No blue light' } } },
  { id: 'bleu-nuit', nom: 'Bleu nuit', neutre: 'slate', accent: 'blue', description: "La palette d'origine", traductions: { en: { nom: 'Midnight blue', description: 'The original palette' } } },
];

export const PALETTE_CLAIRE_DEFAUT = 'sable';
export const PALETTE_SOMBRE_DEFAUT = 'chaud';
export const PERSO_DEFAUT: Palette = { neutre: 'stone', accent: 'orange' };

const NUANCES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;

export function trouverPalette(liste: PaletteNommee[], id: string, perso: Palette): Palette {
  if (id === PERSO) return perso;
  return liste.find((p) => p.id === id) ?? liste[0];
}

/** Variables CSS d'une palette : --color-slate-* = gris choisi, --color-blue-* = accent choisi. */
export function variablesPalette(p: Palette): Record<string, string> {
  const v: Record<string, string> = {};
  const neutre = couleurs[p.neutre] as Record<string, string>;
  const accent = couleurs[p.accent] as Record<string, string>;
  for (const n of NUANCES) {
    v[`--color-slate-${n}`] = neutre[n];
    v[`--color-blue-${n}`] = accent[n];
  }
  return v;
}

/** Couleur d'aperçu (pastilles de la fenêtre Thème). */
export function teinte(famille: Neutre | Accent, nuance: (typeof NUANCES)[number]): string {
  return (couleurs[famille] as Record<string, string>)[nuance];
}

export function appliquerPalette(p: Palette) {
  const s = document.documentElement.style;
  for (const [k, val] of Object.entries(variablesPalette(p))) s.setProperty(k, val);
}
