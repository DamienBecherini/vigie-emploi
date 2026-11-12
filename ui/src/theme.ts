// Palettes de couleurs : chaque palette remplace les gris (classes slate-*) et l'accent (classes blue-*)
// par une famille de Tailwind. Les classes du code ne changent pas : seules les variables CSS changent.
import couleurs from 'tailwindcss/colors';

export const NEUTRES = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const;
export const ACCENTS = [
  'blue', 'sky', 'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber',
  'orange', 'red', 'rose', 'pink', 'fuchsia', 'purple', 'violet', 'indigo',
] as const;
export type Neutre = (typeof NEUTRES)[number];
export type Accent = (typeof ACCENTS)[number];

export const LIBELLES_NEUTRES: Record<Neutre, string> = {
  slate: 'Ardoise (bleuté)', gray: 'Gris', zinc: 'Zinc', neutral: 'Neutre', stone: 'Pierre (chaud)',
};
export const LIBELLES_ACCENTS: Record<Accent, string> = {
  blue: 'Bleu', sky: 'Ciel', cyan: 'Cyan', teal: 'Sarcelle', emerald: 'Émeraude', green: 'Vert', lime: 'Citron vert',
  yellow: 'Jaune', amber: 'Ambre', orange: 'Orange', red: 'Rouge', rose: 'Rose', pink: 'Rose vif', fuchsia: 'Fuchsia',
  purple: 'Pourpre', violet: 'Violet', indigo: 'Indigo',
};

export const LIBELLES_NEUTRES_EN: Record<Neutre, string> = {
  slate: 'Slate (bluish)', gray: 'Grey', zinc: 'Zinc', neutral: 'Neutral', stone: 'Stone (warm)',
};
export const LIBELLES_ACCENTS_EN: Record<Accent, string> = {
  blue: 'Blue', sky: 'Sky', cyan: 'Cyan', teal: 'Teal', emerald: 'Emerald', green: 'Green', lime: 'Lime',
  yellow: 'Yellow', amber: 'Amber', orange: 'Orange', red: 'Red', rose: 'Rose', pink: 'Pink', fuchsia: 'Fuchsia',
  purple: 'Purple', violet: 'Violet', indigo: 'Indigo',
};

export interface Palette {
  neutre: Neutre;
  accent: Accent;
}
export interface PaletteNommee extends Palette {
  /** Nom et description en anglais (interface en anglais). */
  en?: { nom: string; description?: string };
  id: string;
  nom: string;
  description?: string;
}

/** Identifiant de la palette réglée par l'utilisateur (une par mode). */
export const PERSO = 'perso';

export const PALETTES_CLAIRES: PaletteNommee[] = [
  { id: 'bleu', nom: 'Ardoise bleue', neutre: 'slate', accent: 'blue', description: "La palette d'origine", en: { nom: 'Blue slate', description: 'The original palette' } },
  { id: 'sable', nom: 'Sable', neutre: 'stone', accent: 'orange', en: { nom: 'Sand' } },
  { id: 'sauge', nom: 'Sauge', neutre: 'neutral', accent: 'teal', en: { nom: 'Sage' } },
  { id: 'lavande', nom: 'Lavande', neutre: 'zinc', accent: 'violet', en: { nom: 'Lavender' } },
  { id: 'framboise', nom: 'Framboise', neutre: 'gray', accent: 'rose', en: { nom: 'Raspberry' } },
];

export const PALETTES_SOMBRES: PaletteNommee[] = [
  { id: 'chaud', nom: 'Chaud', neutre: 'stone', accent: 'orange', description: 'Sans lumière bleue', en: { nom: 'Warm', description: 'No blue light' } },
  { id: 'olive', nom: 'Olive', neutre: 'stone', accent: 'lime', description: 'Sans lumière bleue', en: { nom: 'Olive', description: 'No blue light' } },
  { id: 'braise', nom: 'Braise', neutre: 'neutral', accent: 'red', description: 'Sans lumière bleue', en: { nom: 'Embers', description: 'No blue light' } },
  { id: 'bleu-nuit', nom: 'Bleu nuit', neutre: 'slate', accent: 'blue', description: "La palette d'origine", en: { nom: 'Midnight blue', description: 'The original palette' } },
];

export const PALETTE_CLAIRE_DEFAUT = 'bleu';
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
