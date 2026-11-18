// Reading of a free remote-work text ("3 j sur site", "full remote"): days on site per week.
// Pure function, no dependency.

/**
 * Days on site per week read in a free remote-work text: "full remote" → 0,
 * "3 j sur site" → 3, "2 j de télétravail" → 3, "sur site" → 5; null if the text does not allow a conclusion
 * ("hybride", "télétravail partiel", "NC").
 */
export function onsiteDaysFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
  const j = String.raw`(\d)(?:[,.]5)?\s*(?:j\b|jours?\b|jrs?\b)\s*(?:\/|par)?\s*(?:sem\w*)?\s*`;
  let m = t.match(new RegExp(`${j}(?:sur site|au bureau|en presentiel|de presentiel|presentiel|on[- ]?site|dans nos locaux|chez le client)`));
  if (m) return Math.min(5, Number(m[1]));
  m = t.match(new RegExp(`${j}(?:de |en )?(?:teletravail|remote|tt\\b|a distance)`));
  if (m) return Math.max(0, 5 - Number(m[1]));
  if (
    /full[ -]?remote|100 ?% (?:teletravail|remote|a distance)|(?:tout|totalement|entierement) (?:a distance|en teletravail)|teletravail (?:complet|total|integral)|remote total|fully remote|\bremote only\b/.test(
      t,
    )
  ) {
    return 0;
  }
  if (/^\s*(?:a distance|remote|teletravail)\s*$/.test(t)) return 0;
  if (/(?:100 ?% )?(?:sur site|presentiel|on[- ]?site)|pas de teletravail|sans teletravail|aucun teletravail/.test(t)) return 5;
  return null;
}
