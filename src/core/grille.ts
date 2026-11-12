// Grille de notation : schéma (Zod), calcul de la note (fonctions pures, sans accès disque ni base)
// et modification partielle. Partagé par la CLI, l'API, le serveur MCP et l'interface.
//
// Principe : l'IA (ou l'utilisateur) note quelques critères de 0 à 10 et signale les règles bloquantes
// qui s'appliquent ; l'application calcule les critères à barème (télétravail, rémunération), la moyenne
// pondérée, applique les règles (zéro, plafond) et arrondit au demi-point. L'IA ne donne jamais la note finale.
import { z } from 'zod';
import { decimal, langueCourante, t, t as tr } from '../i18n/index.ts';

export const NIVEAUX = ['fort', 'moyen', 'leger', 'zero'] as const;
export type Niveau = (typeof NIVEAUX)[number];
export const LIBELLES_NIVEAUX: Record<Niveau, string> = { fort: 'Fort', moyen: 'Moyen', leger: 'Léger', zero: 'Zéro' };

/** Critères dont la sous-note est calculée par l'application à partir d'un barème. */
export const CALCULS = ['teletravail', 'remuneration'] as const;
export type Calcul = (typeof CALCULS)[number];

export const UNITES = ['an', 'mois', 'jour', 'heure'] as const;
export type Unite = (typeof UNITES)[number];

/** Nombre de critères pondérés au plus (au-delà, la grille perd en lisibilité). */
export const CRITERES_MAX = 7;

const identifiant = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,39}$/, { error: () => t('core.grille.identifiant') });
const note10 = z
  .number()
  .min(0, { error: () => t('core.grille.note10') })
  .max(10, { error: () => t('core.grille.note10') });

export const schemaCritere = z
  .strictObject({
    id: identifiant,
    libelle: z.string().min(1),
    /** Consigne pour l'IA (ce que mesure le critère, ce qui fait monter ou baisser la sous-note). */
    description: z.string().default(''),
    /** ia : sous-note donnée par l'IA ; calcul : sous-note calculée depuis le barème « calcul ». */
    source: z.enum(['ia', 'calcul']),
    calcul: z.enum(CALCULS).optional(),
    /** Poids relatif (la somme est normalisée : 35 + 20 + 20 + 10 + 10 + 5 = 100 %). */
    poids: z.number().min(0).max(100),
  })
  .superRefine((c, ctx) => {
    if (c.source === 'calcul' && !c.calcul) {
      ctx.addIssue({ code: 'custom', path: ['calcul'], message: t('core.grille.calculAttendu', { id: c.id, calculs: CALCULS.join(t('core.ou')) }) });
    }
    if (c.source === 'ia' && c.calcul) {
      ctx.addIssue({ code: 'custom', path: ['calcul'], message: t('core.grille.calculReserve', { id: c.id }) });
    }
  });

/** Barème de rémunération pour une unité : plancher → 5, cible haute et au-delà → 10, sous le plancher → 0. */
const champsPalier = {
  plancher: z.number().positive(),
  cible_basse: z.number().positive(),
  cible_haute: z.number().positive(),
  /** Plancher propre aux postes en full remote (facultatif). */
  plancher_full_remote: z.number().positive().optional(),
};
export const schemaPalier = z
  .strictObject(champsPalier)
  .superRefine((p, ctx) => {
    if (p.cible_haute <= p.plancher) ctx.addIssue({ code: 'custom', path: ['cible_haute'], message: t('core.grille.cibleHaute') });
    if (p.plancher_full_remote !== undefined && p.cible_haute <= p.plancher_full_remote) {
      ctx.addIssue({ code: 'custom', path: ['plancher_full_remote'], message: t('core.grille.cibleHauteFullRemote') });
    }
    if (p.cible_basse > p.cible_haute) ctx.addIssue({ code: 'custom', path: ['cible_basse'], message: t('core.grille.cibleBasse') });
  });
export type Palier = z.infer<typeof schemaPalier>;

export const schemaBaremes = z.strictObject({
  teletravail: z.strictObject({
    /** Sous-note selon le nombre de jours sur site par semaine : index 0 (full remote) à 5 (sur site). */
    jours_sur_site: z.array(note10).length(6, { error: () => t('core.grille.sixValeurs') }),
    /** Sous-note quand le rythme est inconnu (valeur neutre, avec un drapeau). */
    inconnu: note10.default(5),
  }),
  remuneration: z.strictObject({
    /** Valeur comparée au barème quand l'offre donne une fourchette. */
    reference: z.enum(['milieu', 'min', 'max']).default('milieu'),
    inconnue: note10.default(5),
    /** Salaire annuel brut, en K€ (un salaire mensuel est multiplié par 12). */
    salaire: schemaPalier,
    /** Taux journalier, en € (un taux horaire est multiplié par 7). */
    tjm: schemaPalier,
  }),
});
export type Baremes = z.infer<typeof schemaBaremes>;

export const schemaRegle = z
  .strictObject({
    id: identifiant,
    libelle: z.string().min(1),
    /** Quand la signaler (consigne pour l'IA). */
    description: z.string().default(''),
    /**
     * zero / plafond : appliquées quand l'IA signale la règle dans « bloquants ».
     * plafond_critere : appliquée automatiquement quand la sous-note de « critere » est sous « seuil » ;
     * la note finale est alors plafonnée à cette sous-note.
     */
    effet: z.enum(['zero', 'plafond', 'plafond_critere']),
    /** Note maximale pour l'effet « plafond ». */
    valeur: note10.optional(),
    /** Critère surveillé (effet « plafond_critere »). */
    critere: z.string().optional(),
    /** Seuil sous lequel la règle s'applique (effet « plafond_critere »). */
    seuil: note10.optional(),
    actif: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.effet === 'plafond' && r.valeur === undefined) {
      ctx.addIssue({ code: 'custom', path: ['valeur'], message: t('core.grille.valeurPlafond', { id: r.id }) });
    }
    if (r.effet === 'plafond_critere' && (r.critere === undefined || r.seuil === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['critere'], message: t('core.grille.critereSeuil', { id: r.id }) });
    }
  });
export type Regle = z.infer<typeof schemaRegle>;

export const schemaTechno = z.strictObject({
  techno: z.string().min(1),
  niveau: z.enum(NIVEAUX),
  precision: z.string().optional(),
});
export type Techno = z.infer<typeof schemaTechno>;

/** Données d'entrée des critères calculés, lues dans l'offre par l'IA (sinon déduites des champs de l'offre). */
export const schemaEntrees = z.strictObject({
  jours_sur_site: z.number().int().min(0).max(5).nullable().optional(),
  salaire_min: z.number().positive().nullable().optional(),
  salaire_max: z.number().positive().nullable().optional(),
  unite: z.enum(UNITES).nullable().optional(),
});
export type Entrees = z.infer<typeof schemaEntrees>;

const sousNote = z.strictObject({
  note: z.union([note10, z.string()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      ctx.addIssue({ code: 'custom', message: t('core.grille.sousNote', { valeur: String(v) }) });
      return z.NEVER;
    }
    return n;
  }),
  justification: z.string().optional(),
  /** Qui l'a donnée : l'IA (par défaut) ou l'utilisateur dans l'interface. */
  origine: z.enum(['ia', 'interface']).optional(),
});

/** Ce que l'IA (ou l'interface) fournit pour une note à critères. */
export const schemaSaisie = z.strictObject({
  criteres: z.record(z.string(), sousNote).default({}),
  entrees: schemaEntrees.optional(),
  bloquants: z.array(z.string()).default([]),
});
export type Saisie = z.infer<typeof schemaSaisie>;

export const schemaExemple = z.strictObject({
  titre: z.string().min(1),
  entreprise: z.string().optional(),
  url: z.string().optional(),
  /** Rappel des conditions de l'offre (lieu, contrat, rythme, salaire) pour situer l'exemple. */
  conditions: z.string().optional(),
  criteres: z.record(z.string(), z.strictObject({ note: note10, justification: z.string() })).default({}),
  entrees: schemaEntrees.optional(),
  bloquants: z.array(z.string()).default([]),
  commentaire: z.string().default(''),
});
export type Exemple = z.infer<typeof schemaExemple>;

export const schemaGrille = z
  .strictObject({
    nom: z.string().default('Grille de notation'),
    /** Seuil « à regarder » : vue rapide « Notées ≥ … ». */
    seuil: note10.default(4.5),
    /** Consignes générales pour l'IA (cibles, bonus, ce qui compte), en plus des descriptions des critères. */
    consignes: z.array(z.string()).default([]),
    criteres: z.array(schemaCritere).min(1).max(CRITERES_MAX, { error: () => t('core.grille.criteresMax', { n: CRITERES_MAX }) }),
    baremes: schemaBaremes,
    regles: z.array(schemaRegle).default([]),
    inventaire: z.array(schemaTechno).default([]),
    exemples: z.array(schemaExemple).default([]),
  })
  .superRefine((g, ctx) => {
    const doublons = (ids: string[]) => ids.filter((x, i) => ids.indexOf(x) !== i);
    for (const d of doublons(g.criteres.map((c) => c.id))) ctx.addIssue({ code: 'custom', path: ['criteres'], message: t('core.grille.critereDouble', { id: d }) });
    for (const d of doublons(g.regles.map((r) => r.id))) ctx.addIssue({ code: 'custom', path: ['regles'], message: t('core.grille.regleDouble', { id: d }) });
    for (const d of doublons(g.criteres.flatMap((c) => (c.calcul ? [c.calcul] : [])))) {
      ctx.addIssue({ code: 'custom', path: ['criteres'], message: t('core.grille.baremeDouble', { calcul: d }) });
    }
    if (!g.criteres.some((c) => c.poids > 0)) ctx.addIssue({ code: 'custom', path: ['criteres'], message: t('core.grille.unPoids') });
    const ia = new Set(g.criteres.filter((c) => c.source === 'ia').map((c) => c.id));
    const regles = new Set(g.regles.map((r) => r.id));
    g.exemples.forEach((e, i) => {
      for (const k of Object.keys(e.criteres)) {
        if (!ia.has(k)) ctx.addIssue({ code: 'custom', path: ['exemples', i, 'criteres', k], message: t('core.grille.exempleCritere', { titre: e.titre, critere: k }) });
      }
      for (const b of e.bloquants) {
        if (!regles.has(b)) ctx.addIssue({ code: 'custom', path: ['exemples', i, 'bloquants'], message: t('core.grille.exempleRegle', { titre: e.titre, regle: b }) });
      }
    });
  });
export type Grille = z.infer<typeof schemaGrille>;
export type CritereGrille = Grille['criteres'][number];

/** Clés de métadonnées du fichier grille.json (hors contenu versionné). */
export const META_FICHIER = ['version', 'modifiee_le', 'resume', '$schema', '$commentaire'] as const;

/** Message lisible d'une erreur Zod : « criteres.2.poids : … ; seuil : … ». */
export function messageZod(e: z.ZodError, prefixe = ''): string {
  return e.issues
    .map((i) => {
      const chemin = [prefixe, ...i.path.map(String)].filter(Boolean).join('.');
      return chemin ? `${chemin} : ${i.message}` : i.message;
    })
    .join(' ; ');
}

/** Valide une grille (objet JSON) ; lève une Error au message lisible. */
export function validerGrille(brut: unknown, origine = 'grille'): Grille {
  const r = schemaGrille.safeParse(brut);
  if (!r.success) throw new Error(t('core.grille.invalide', { origine, message: messageZod(r.error) }));
  return r.data;
}

// ---------------------------------------------------------------------------------------------
// Calcul

/** Champs de l'offre utiles aux critères calculés (quand l'IA n'a pas donné les entrées). */
export interface DonneesOffre {
  teletravail?: string | null;
  remuneration_min?: number | null;
  remuneration_max?: number | null;
  remuneration_unite?: string | null;
}

export type OrigineSousNote = 'ia' | 'interface' | 'calcul' | 'neutre';

export interface LigneCritere {
  id: string;
  libelle: string;
  source: 'ia' | 'calcul';
  note: number;
  justification: string | null;
  origine: OrigineSousNote;
  poids: number;
  /** Poids ramené à 1 (somme des poids = 1). */
  poids_normalise: number;
  /** Points apportés à la moyenne : note × poids normalisé. */
  contribution: number;
}

export interface RegleAppliquee {
  id: string;
  libelle: string;
  effet: 'zero' | 'plafond' | 'plafond_critere';
  valeur: number | null;
  /** La règle a fait baisser la note (un plafond au-dessus de la moyenne ne change rien). */
  effective: boolean;
}

export interface Drapeau {
  code: string;
  message: string;
}

export interface EntreesUtilisees {
  jours_sur_site: number | null;
  jours_provenance: 'saisie' | 'offre' | null;
  salaire_min: number | null;
  salaire_max: number | null;
  unite: Unite | null;
  salaire_provenance: 'saisie' | 'offre' | null;
}

export interface Decomposition {
  grille_version: number | null;
  criteres: LigneCritere[];
  /** Moyenne pondérée, avant les règles bloquantes. */
  moyenne: number;
  regles: RegleAppliquee[];
  /** Règles signalées mais inconnues ou désactivées dans cette version de la grille. */
  bloquants_ignores: string[];
  drapeaux: Drapeau[];
  entrees: EntreesUtilisees;
  /** Note après les règles, non arrondie (gardée en base). */
  note_exacte: number;
  /** Note affichée : arrondie au demi-point. */
  note: number;
}

/** Arrondi au demi-point le plus proche (4,25 → 4,5 ; 4,24 → 4). */
export function arrondiDemi(x: number): number {
  return Math.round(x * 2 + 1e-9) / 2;
}

function arrondi(x: number, decimales = 4): number {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
}

/**
 * Interpolation du barème de rémunération : sous le plancher 0 ; au plancher 5 ; à la cible haute
 * et au-delà 10 ; linéaire entre les deux.
 */
export function interpoler(valeur: number, plancher: number, cibleHaute: number): number {
  if (valeur < plancher) return 0;
  if (valeur >= cibleHaute) return 10;
  return 5 + (5 * (valeur - plancher)) / (cibleHaute - plancher);
}

/**
 * Jours sur site par semaine lus dans un texte libre de télétravail : « full remote » → 0,
 * « 3 j sur site » → 3, « 2 j de télétravail » → 3, « sur site » → 5 ; null si le texte ne permet pas de conclure
 * (« hybride », « télétravail partiel », « NC »).
 */
export function joursSurSiteDepuisTexte(texte: string | null | undefined): number | null {
  if (!texte) return null;
  const t = texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  const j = String.raw`(\d)(?:[,.]5)?\s*(?:j\b|jours?\b|jrs?\b)\s*(?:\/|par)?\s*(?:sem\w*)?\s*`;
  let m = t.match(new RegExp(`${j}(?:sur site|au bureau|en presentiel|de presentiel|presentiel|on[- ]?site|dans nos locaux|chez le client)`));
  if (m) return Math.min(5, Number(m[1]));
  m = t.match(new RegExp(`${j}(?:de |en )?(?:teletravail|remote|tt\\b|a distance)`));
  if (m) return Math.max(0, 5 - Number(m[1]));
  if (/full[ -]?remote|100 ?% (?:teletravail|remote|a distance)|(?:tout|totalement|entierement) (?:a distance|en teletravail)|teletravail (?:complet|total|integral)|remote total|fully remote|\bremote only\b/.test(t)) {
    return 0;
  }
  if (/^\s*(?:a distance|remote|teletravail)\s*$/.test(t)) return 0;
  if (/(?:100 ?% )?(?:sur site|presentiel|on[- ]?site)|pas de teletravail|sans teletravail|aucun teletravail/.test(t)) return 5;
  return null;
}

/** Montant ramené à l'unité du barème : K€/an pour un salaire, €/j pour un taux. */
function versBareme(v: number, unite: Unite): { valeur: number; type: 'salaire' | 'tjm' } {
  switch (unite) {
    case 'an':
      return { valeur: v >= 1000 ? v / 1000 : v, type: 'salaire' };
    case 'mois':
      return { valeur: (v * 12) / 1000, type: 'salaire' };
    case 'jour':
      return { valeur: v, type: 'tjm' };
    case 'heure':
      return { valeur: v * 7, type: 'tjm' };
  }
}

function formatNombre(n: number): string {
  return decimal(arrondi(n, 1), langueCourante(), 1);
}

export interface ResultatCalcul {
  note: number;
  justification: string;
  drapeau?: Drapeau;
}

export function noteTeletravail(b: Baremes['teletravail'], jours: number | null): ResultatCalcul {
  if (jours === null) {
    return {
      note: b.inconnu,
      justification: t('core.calc.rythmeInconnu'),
      drapeau: { code: 'teletravail_inconnu', message: 'Télétravail inconnu (valeur neutre) : à vérifier' },
    };
  }
  const n = b.jours_sur_site[Math.min(5, Math.max(0, Math.round(jours)))];
  return { note: n, justification: jours === 0 ? t('core.calc.fullRemote') : t('core.calc.joursSurSite', { n: jours }) };
}

export function noteRemuneration(
  b: Baremes['remuneration'],
  r: { min: number | null; max: number | null; unite: Unite | null },
  jours: number | null,
): ResultatCalcul {
  const valeurs = [r.min, r.max].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (!valeurs.length || !r.unite) {
    return {
      note: b.inconnue,
      justification: t('core.calc.remunerationInconnue'),
      drapeau: { code: 'remuneration_inconnue', message: 'Rémunération inconnue (valeur neutre) : à demander' },
    };
  }
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const brut = b.reference === 'min' ? min : b.reference === 'max' ? max : (min + max) / 2;
  const { valeur, type } = versBareme(brut, r.unite);
  const p = type === 'salaire' ? b.salaire : b.tjm;
  const fullRemote = jours === 0 && p.plancher_full_remote !== undefined;
  const plancher = fullRemote ? p.plancher_full_remote! : p.plancher;
  const note = interpoler(valeur, plancher, p.cible_haute);
  const u = type === 'salaire' ? t('core.calc.uniteSalaire') : t('core.calc.uniteTjm');
  const ref = valeurs.length > 1 && min !== max ? ` (${b.reference === 'milieu' ? t('core.calc.milieu') : b.reference})` : '';
  const position =
    valeur < plancher
      ? t('core.calc.sousPlancher', { plancher: `${formatNombre(plancher)}${u}` })
      : valeur >= p.cible_haute
        ? t('core.calc.cibleHaute', { cible: `${formatNombre(p.cible_haute)}${u}` })
        : t('core.calc.entre', { plancher: formatNombre(plancher), cible: `${formatNombre(p.cible_haute)}${u}` });
  return {
    note,
    justification: `${formatNombre(valeur)}${u}${ref}, ${position}${fullRemote ? t('core.calc.plancherFullRemote') : ''}`,
    drapeau: valeur < plancher ? { code: 'sous_plancher', message: `Rémunération sous le plancher (${formatNombre(valeur)}${u}) : à signaler` } : undefined,
  };
}

/** Entrées des critères calculés : celles de la saisie d'abord, sinon les champs de l'offre. */
export function entreesUtilisees(saisie: Saisie, offre: DonneesOffre): EntreesUtilisees {
  const e = saisie.entrees ?? {};
  const joursSaisis = e.jours_sur_site ?? null;
  const joursOffre = joursSaisis === null ? joursSurSiteDepuisTexte(offre.teletravail) : null;
  const salaireSaisi = (e.salaire_min ?? e.salaire_max ?? null) !== null;
  const uniteOffre = (UNITES as readonly string[]).includes(offre.remuneration_unite ?? '') ? (offre.remuneration_unite as Unite) : null;
  const salaireOffre = !salaireSaisi && (offre.remuneration_min ?? offre.remuneration_max ?? null) !== null && uniteOffre !== null;
  return {
    jours_sur_site: joursSaisis ?? joursOffre,
    jours_provenance: joursSaisis !== null ? 'saisie' : joursOffre !== null ? 'offre' : null,
    salaire_min: salaireSaisi ? (e.salaire_min ?? e.salaire_max ?? null) : salaireOffre ? (offre.remuneration_min ?? offre.remuneration_max ?? null) : null,
    salaire_max: salaireSaisi ? (e.salaire_max ?? e.salaire_min ?? null) : salaireOffre ? (offre.remuneration_max ?? offre.remuneration_min ?? null) : null,
    unite: salaireSaisi ? (e.unite ?? 'an') : salaireOffre ? uniteOffre : null,
    salaire_provenance: salaireSaisi ? 'saisie' : salaireOffre ? 'offre' : null,
  };
}

/**
 * Calcule la note d'une offre : sous-notes (IA ou barème), moyenne pondérée normalisée, règles bloquantes
 * (zéro, plafond), arrondi au demi-point. Tolérant : un critère IA absent vaut la valeur neutre 5 avec un
 * drapeau, une règle inconnue ou désactivée est ignorée (listée). Pour valider une nouvelle saisie,
 * voir verifierSaisie.
 */
export function calculerNote(grille: Grille, saisie: Saisie, offre: DonneesOffre = {}, version: number | null = null): Decomposition {
  const entrees = entreesUtilisees(saisie, offre);
  const drapeaux: Drapeau[] = [];
  const somme = grille.criteres.reduce((s, c) => s + c.poids, 0);
  const criteres: LigneCritere[] = grille.criteres.map((c) => {
    let note: number;
    let justification: string | null;
    let origine: OrigineSousNote;
    if (c.source === 'calcul') {
      const r =
        c.calcul === 'teletravail'
          ? noteTeletravail(grille.baremes.teletravail, entrees.jours_sur_site)
          : noteRemuneration(
              grille.baremes.remuneration,
              { min: entrees.salaire_min, max: entrees.salaire_max, unite: entrees.unite },
              entrees.jours_sur_site,
            );
      note = r.note;
      justification = r.justification;
      origine = r.drapeau && r.drapeau.code !== 'sous_plancher' ? 'neutre' : 'calcul';
      if (r.drapeau) drapeaux.push(r.drapeau);
    } else {
      const s = saisie.criteres[c.id];
      if (s) {
        note = s.note;
        justification = s.justification?.trim() || null;
        origine = s.origine === 'interface' ? 'interface' : 'ia';
      } else {
        note = 5;
        justification = null;
        origine = 'neutre';
        drapeaux.push({ code: `critere_manquant:${c.id}`, message: `${c.libelle} : pas de sous-note (valeur neutre 5)` });
      }
    }
    const poidsNormalise = somme > 0 ? c.poids / somme : 0;
    return {
      id: c.id,
      libelle: c.libelle,
      source: c.source,
      note: arrondi(note),
      justification,
      origine,
      poids: c.poids,
      poids_normalise: arrondi(poidsNormalise, 6),
      contribution: arrondi(note * poidsNormalise),
    };
  });
  const moyenne = arrondi(criteres.reduce((s, c) => s + c.note * (somme > 0 ? c.poids / somme : 0), 0));
  let noteExacte = moyenne;
  const regles: RegleAppliquee[] = [];
  const ignores: string[] = [];
  for (const id of [...new Set(saisie.bloquants)]) {
    const r = grille.regles.find((x) => x.id === id);
    if (!r || !r.actif) {
      ignores.push(id);
      continue;
    }
    const avant = noteExacte;
    if (r.effet === 'zero') noteExacte = 0;
    else noteExacte = Math.min(noteExacte, r.valeur!);
    regles.push({ id: r.id, libelle: r.libelle, effet: r.effet, valeur: r.effet === 'plafond' ? r.valeur! : null, effective: noteExacte < avant });
  }
  for (const r of grille.regles) {
    if (!r.actif || r.effet !== 'plafond_critere') continue;
    const c = criteres.find((x) => x.id === r.critere);
    if (!c || c.origine === 'neutre' || c.note >= r.seuil!) continue;
    const avant = noteExacte;
    noteExacte = Math.min(noteExacte, c.note);
    regles.push({ id: r.id, libelle: r.libelle, effet: r.effet, valeur: c.note, effective: noteExacte < avant });
  }
  noteExacte = arrondi(noteExacte);
  return {
    grille_version: version,
    criteres,
    moyenne,
    regles,
    bloquants_ignores: ignores,
    drapeaux,
    entrees,
    note_exacte: noteExacte,
    note: arrondiDemi(noteExacte),
  };
}

/**
 * Valide une nouvelle saisie contre la grille : critères connus et notés par l'IA, règles connues.
 * Lève une Error au message utile à l'IA (liste des identifiants attendus).
 */
export function verifierSaisie(grille: Grille, brut: unknown): Saisie {
  const r = schemaSaisie.safeParse(brut);
  if (!r.success) throw new Error(t('core.saisie.invalide', { message: messageZod(r.error) }));
  const s = r.data;
  const ia = grille.criteres.filter((c) => c.source === 'ia').map((c) => c.id);
  for (const k of Object.keys(s.criteres)) {
    const c = grille.criteres.find((x) => x.id === k);
    if (!c) throw new Error(t('core.saisie.critereInconnu', { id: k, liste: ia.join(', ') }));
    if (c.source === 'calcul') {
      throw new Error(
        t('core.saisie.critereCalcule', {
          id: k,
          champs: c.calcul === 'teletravail' ? 'entrees.jours_sur_site' : 'entrees.salaire_min / salaire_max / unite',
        }),
      );
    }
  }
  const regles = grille.regles.map((x) => x.id);
  for (const b of s.bloquants) {
    if (!regles.includes(b)) throw new Error(t('core.saisie.regleInconnue', { id: b, liste: regles.join(', ') || t('core.aucune') }));
  }
  return s;
}

/** Libellé court des règles appliquées, pour la colonne « pénalités » des notes. */
export function resumeRegles(d: Decomposition): string | null {
  const t = d.regles.map((r) => `${r.effet === 'zero' ? '0' : `plafond ${formatNombre(r.valeur!)}`} : ${r.libelle}`);
  return t.length ? t.join(' ; ') : null;
}

/** Note d'un exemple de référence, calculée avec la grille (pour l'afficher et calibrer l'IA). */
export function noteExemple(grille: Grille, e: Exemple, version: number | null = null): Decomposition {
  return calculerNote(grille, { criteres: e.criteres, entrees: e.entrees, bloquants: e.bloquants }, {}, version);
}

// ---------------------------------------------------------------------------------------------
// Modification partielle (MCP modifier_grille, CLI grille --modifier)

export const schemaChangement = z.strictObject({
  poids: z.record(z.string(), z.number().min(0).max(100)).optional(),
  seuil: note10.optional(),
  nom: z.string().optional(),
  consignes: z.array(z.string()).optional(),
  baremes: z
    .strictObject({
      teletravail: schemaBaremes.shape.teletravail.partial().optional(),
      remuneration: z
        .strictObject({
          reference: z.enum(['milieu', 'min', 'max']).optional(),
          inconnue: note10.optional(),
          salaire: z.strictObject(champsPalier).partial().optional(),
          tjm: z.strictObject(champsPalier).partial().optional(),
        })
        .optional(),
    })
    .optional(),
  /** Règles : ajout (id nouveau) ou modification des champs donnés (id existant). */
  regles: z
    .array(
      z.strictObject({
        id: identifiant,
        libelle: z.string().optional(),
        description: z.string().optional(),
        effet: z.enum(['zero', 'plafond', 'plafond_critere']).optional(),
        valeur: note10.nullable().optional(),
        critere: z.string().optional(),
        seuil: note10.optional(),
        actif: z.boolean().optional(),
      }),
    )
    .optional(),
  retirer_regles: z.array(z.string()).optional(),
  /** Critères : modification des champs donnés (libellé, description, poids). */
  criteres: z
    .array(z.strictObject({ id: z.string(), libelle: z.string().optional(), description: z.string().optional(), poids: z.number().min(0).max(100).optional() }))
    .optional(),
  inventaire: z
    .strictObject({
      /** Ajoute ou remplace (même techno, sans casse). */
      ajouter: z.array(schemaTechno).optional(),
      retirer: z.array(z.string()).optional(),
    })
    .optional(),
  /** Exemples de référence : ajout ou remplacement (même titre et même entreprise, sans casse), retrait par titre. */
  exemples: z
    .strictObject({
      ajouter: z.array(schemaExemple).optional(),
      retirer: z
        .array(z.union([z.string(), z.strictObject({ titre: z.string(), entreprise: z.string().optional() })]))
        .optional()
        .describe('Titres des exemples à retirer, ou { titre, entreprise } si deux exemples ont le même titre'),
    })
    .optional(),
});
export type Changement = z.infer<typeof schemaChangement>;

/** Applique un changement partiel à une grille et renvoie la nouvelle grille validée. */
export function appliquerChangement(grille: Grille, brut: unknown): Grille {
  const r = schemaChangement.safeParse(brut);
  if (!r.success) throw new Error(t('core.changement.invalide', { message: messageZod(r.error) }));
  const ch = r.data;
  const g = structuredClone(grille) as Grille;
  if (ch.nom !== undefined) g.nom = ch.nom;
  if (ch.seuil !== undefined) g.seuil = ch.seuil;
  if (ch.consignes !== undefined) g.consignes = ch.consignes;
  for (const [id, p] of Object.entries(ch.poids ?? {})) {
    const c = g.criteres.find((x) => x.id === id);
    if (!c) throw new Error(t('core.changement.critereInconnuListe', { id, liste: g.criteres.map((x) => x.id).join(', ') }));
    c.poids = p;
  }
  for (const m of ch.criteres ?? []) {
    const c = g.criteres.find((x) => x.id === m.id);
    if (!c) throw new Error(t('core.changement.critereInconnu', { id: m.id }));
    if (m.libelle !== undefined) c.libelle = m.libelle;
    if (m.description !== undefined) c.description = m.description;
    if (m.poids !== undefined) c.poids = m.poids;
  }
  if (ch.baremes?.teletravail) Object.assign(g.baremes.teletravail, ch.baremes.teletravail);
  const rem = ch.baremes?.remuneration;
  if (rem) {
    if (rem.reference !== undefined) g.baremes.remuneration.reference = rem.reference;
    if (rem.inconnue !== undefined) g.baremes.remuneration.inconnue = rem.inconnue;
    if (rem.salaire) Object.assign(g.baremes.remuneration.salaire, rem.salaire);
    if (rem.tjm) Object.assign(g.baremes.remuneration.tjm, rem.tjm);
  }
  for (const m of ch.regles ?? []) {
    const r0 = g.regles.find((x) => x.id === m.id);
    if (r0) {
      if (m.libelle !== undefined) r0.libelle = m.libelle;
      if (m.description !== undefined) r0.description = m.description;
      if (m.effet !== undefined) r0.effet = m.effet;
      if (m.valeur !== undefined) {
        if (m.valeur === null) delete r0.valeur;
        else r0.valeur = m.valeur;
      }
      if (m.critere !== undefined) r0.critere = m.critere;
      if (m.seuil !== undefined) r0.seuil = m.seuil;
      if (m.actif !== undefined) r0.actif = m.actif;
    } else {
      if (!m.libelle || !m.effet) throw new Error(t('core.changement.nouvelleRegle', { id: m.id }));
      g.regles.push({ id: m.id, libelle: m.libelle, description: m.description ?? '', effet: m.effet, valeur: m.valeur ?? undefined, critere: m.critere, seuil: m.seuil, actif: m.actif ?? true });
    }
  }
  for (const id of ch.retirer_regles ?? []) {
    if (!g.regles.some((x) => x.id === id)) throw new Error(t('core.changement.regleInconnue', { id }));
    g.regles = g.regles.filter((x) => x.id !== id);
    for (const e of g.exemples) e.bloquants = e.bloquants.filter((b) => b !== id);
  }
  const cle = (s: string) => s.trim().toLowerCase();
  // Retraits d'abord, ajouts ensuite : une techno retirée puis ajoutée dans le même changement
  // est remplacée, jamais perdue (les ajouts d'un appel ne peuvent pas être effacés par ses retraits).
  for (const t of ch.inventaire?.retirer ?? []) {
    const avant = g.inventaire.length;
    g.inventaire = g.inventaire.filter((x) => cle(x.techno) !== cle(t));
    if (g.inventaire.length === avant) throw new Error(tr('core.changement.technoAbsente', { techno: t }));
  }
  for (const t of ch.inventaire?.ajouter ?? []) {
    const i = g.inventaire.findIndex((x) => cle(x.techno) === cle(t.techno));
    if (i >= 0) g.inventaire[i] = t;
    else g.inventaire.push(t);
  }
  // Exemples : même logique (retraits, puis ajouts ou remplacements).
  const memeExemple = (e: Exemple, titre: string, entreprise: string | undefined) =>
    cle(e.titre) === cle(titre) && (entreprise === undefined || cle(e.entreprise ?? '') === cle(entreprise));
  for (const x of ch.exemples?.retirer ?? []) {
    const { titre, entreprise } = typeof x === 'string' ? { titre: x, entreprise: undefined } : x;
    const trouves = g.exemples.filter((e) => memeExemple(e, titre, entreprise));
    if (!trouves.length) throw new Error(t('core.changement.exempleAbsent', { titre, liste: g.exemples.map((e) => e.titre).join(' ; ') || t('core.aucun') }));
    if (trouves.length > 1) throw new Error(t('core.changement.exemplesHomonymes', { titre }));
    g.exemples = g.exemples.filter((e) => e !== trouves[0]);
  }
  for (const e of ch.exemples?.ajouter ?? []) {
    const i = g.exemples.findIndex((x) => cle(x.titre) === cle(e.titre) && cle(x.entreprise ?? '') === cle(e.entreprise ?? ''));
    if (i >= 0) g.exemples[i] = e;
    else g.exemples.push(e);
  }
  return validerGrille(g, t('core.grille.apresChangement'));
}

export interface ExempleCalcule {
  titre: string;
  entreprise: string | null;
  note: number;
  moyenne: number;
  /** Note avec la grille d'avant le changement (null : exemple ajouté par le changement). */
  avant?: number | null;
  /** Moyenne pondérée avant le changement (la note, arrondie au demi-point, peut ne pas bouger). */
  moyenne_avant?: number | null;
}

/** Notes des exemples de référence avec une grille ; avec `avant`, la note de chaque exemple avec l'ancienne grille. */
export function exemplesCalcules(g: Grille, version: number | null, avant?: { grille: Grille; version: number | null }): ExempleCalcule[] {
  const cleEx = (e: Exemple) => `${e.titre.trim().toLowerCase()}|${(e.entreprise ?? '').trim().toLowerCase()}`;
  return g.exemples.map((e) => {
    const d = noteExemple(g, e, version);
    const r: ExempleCalcule = { titre: e.titre, entreprise: e.entreprise ?? null, note: d.note, moyenne: d.moyenne };
    if (avant) {
      const ancien = avant.grille.exemples.find((x) => cleEx(x) === cleEx(e));
      const da = ancien ? noteExemple(avant.grille, ancien, avant.version) : null;
      r.avant = da?.note ?? null;
      r.moyenne_avant = da?.moyenne ?? null;
    }
    return r;
  });
}

// ---------------------------------------------------------------------------------------------
// Consignes pour l'IA (outil MCP « grille », commande « grille »)

/** Consignes de notation générées depuis la grille : ce que l'IA doit fournir, et comment. */
export function consignesIa(g: Grille): string[] {
  const ia = g.criteres.filter((c) => c.source === 'ia');
  const calc = g.criteres.filter((c) => c.source === 'calcul');
  const somme = g.criteres.reduce((s, c) => s + c.poids, 0) || 1;
  const pct = (p: number) => t('core.pages.pourcent', { pc: Math.round((p / somme) * 100) });
  return [
    t('core.consignes.noteFinale'),
    t('core.consignes.criteres', { liste: ia.map((c) => `${c.id} (${c.libelle}, ${pct(c.poids)})`).join(' ; ') }),
    t('core.consignes.calcules', { n: calc.length, liste: calc.map((c) => c.id).join(t('core.ni')) }) + t('core.consignes.entrees'),
    t('core.consignes.bloquants', {
      liste:
        g.regles
          .filter((r) => r.actif && r.effet !== 'plafond_critere')
          .map((r) => `${r.id} = ${r.libelle} → ${r.effet === 'zero' ? '0' : t('core.plafond', { valeur: decimal(r.valeur ?? 0) })}`)
          .join(' ; ') || t('core.aucune'),
    }),
    t('core.consignes.technique'),
    t('core.consignes.exemples'),
    t('core.consignes.seuil', { seuil: decimal(g.seuil) }),
  ];
}
