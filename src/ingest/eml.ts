// Lecture d'un e-mail d'alertes (.eml) : MIME, quoted-printable, base64, jeux de caractères (postal-mime).
import PostalMime from 'postal-mime';
import { identifierLien, texteHtml, decodeHTML, type Source } from '../core/liens.ts';
import { dateIso } from '../core/texte.ts';

export interface OffreEmail {
  source: Source;
  idSite: string;
  url: string;
  titre: string;
  /** Objet de l'e-mail d'où vient l'offre. */
  sujet: string;
  /** Date de l'e-mail (AAAA-MM-JJ). */
  recueLe: string | null;
  /** Champs séparés du titre quand l'e-mail les colle ensemble (Glassdoor). */
  entreprise?: string;
  lieu?: string;
  remuneration?: string;
}

export interface EmailLu {
  sujet: string;
  date: string | null;
  offres: OffreEmail[];
  /** Accusé de réception d'une candidature déjà envoyée (pas une alerte) : ses liens ne sont pas de nouvelles offres. */
  confirmation: boolean;
}

/** Objets des accusés de réception de candidature (LinkedIn, Free-Work, Indeed, Welcome to the Jungle, ATS…). */
export const SUJET_CONFIRMATION =
  /confirmation de (votre |ta )?candidature|(votre|ta) candidature (a (bien )?été|est) (envoyée|transmise|reçue|enregistrée)|candidature (bien )?(envoyée|reçue|transmise)|nous avons (bien )?reçu (votre|ta) candidature|merci pour (votre|ta) candidature|application (was |has been )?(sent|submitted|received)|thank you for (your )?appl/i;

/** Textes de liens qui ne sont pas des intitulés d'offres. */
const LIENS_GENERIQUES =
  /^(voir l|voir plus|en savoir plus|postuler|candidater|ne correspond pas|afficher plus|voir toutes|offres? d.emploi similaires|emplois (de|chez|-)|chercher un autre|votre alerte|view job|apply|see all|see more|plus d.offres|modifier|se désabonner|désinscri)/i;

/** Extrait les offres d'un message .eml (contenu brut). Les doublons internes au message sont fusionnés. */
export async function lireEmail(contenu: Buffer | string): Promise<EmailLu> {
  const msg = await PostalMime.parse(contenu);
  const sujet = msg.subject ?? '';
  const date = dateIso(msg.date ?? null);
  const offres = new Map<string, OffreEmail>();
  const retenir = (href: string, titreBrut: string) => {
    const id = identifierLien(decodeHTML(href));
    if (!id) return;
    const titre = titreBrut.trim();
    let o = offres.get(id.url);
    if (!o) {
      o = { source: id.source, idSite: id.idSite, url: id.url, titre: '', sujet, recueLe: date };
      offres.set(id.url, o);
    }
    if (titre.length > o.titre.length && !LIENS_GENERIQUES.test(titre) && !/^https?:\/\//.test(titre)) {
      o.titre = titre.slice(0, 140);
    }
  };
  if (msg.html) {
    for (const m of msg.html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      retenir(m[1], texteHtml(m[2]));
    }
  } else if (msg.text) {
    // Version texte : « Intitulé » sur la ligne qui précède l'URL, quand il y en a une.
    const lignes = msg.text.split(/\r?\n/);
    lignes.forEach((ligne, i) => {
      for (const m of ligne.matchAll(/https?:\/\/[^\s<>"]+/g)) {
        const avant = (ligne.slice(0, m.index).trim() || (lignes[i - 1] ?? '').trim()).replace(/\s*[:\-–<(]+$/, '');
        retenir(m[0], avant);
      }
    });
  }
  // Collective : les liens disent « Voir l'offre » ; l'intitulé est dans le texte (« Offre : … Postuler »).
  const liste = [...offres.values()];
  if (liste.length === 1 && !liste[0].titre && msg.html) {
    const m = texteHtml(msg.html).match(/Offre\s*:\s*(.+?)\s+Postuler\b/);
    if (m) liste[0].titre = m[1].trim().slice(0, 140);
  }
  for (const o of liste) {
    if (o.source === 'glassdoor' && o.titre) Object.assign(o, decouperGlassdoor(o.titre));
  }
  return { sujet, date, offres: liste, confirmation: SUJET_CONFIRMATION.test(sujet) };
}

/** Champs tirés du bloc d'une offre Glassdoor, dont le lien contient tout à la suite. */
export interface BlocGlassdoor {
  titre: string;
  entreprise?: string;
  lieu?: string;
  remuneration?: string;
}

/** Mentions de genre qui terminent l'intitulé (le lieu suit). */
const GENRE = /^(.*?(?:\(?\b(?:H\s*\/\s*F|F\s*\/\s*H)(?:\s*\/\s*[NX])?\)?|\((?:m\s*\/\s*w\s*\/\s*d|w\s*\/\s*m\s*\/\s*d|f\s*\/\s*m\s*\/\s*d)\)))\s+(.+)$/i;

/**
 * Glassdoor met dans le lien : « Entreprise 4.0 ★ Intitulé (H/F) Lieu 50 k € - 65 k € (Estimation de l'employeur) 17h
 * Candidature facile ». On sépare ce qui peut l'être sans risque ; le reste reste dans l'intitulé.
 */
export function decouperGlassdoor(brut: string): BlocGlassdoor {
  let t = brut.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+Candidature\b.*$/i, '').trim();
  t = t.replace(/\s+\d{1,2}\s*(?:h|j|d)\+?$/i, '').trim();
  const r: BlocGlassdoor = { titre: t };
  const salaire = t.match(/\s+(\d[\d\s.,]*\s*k?\s*€(?:\s*-\s*\d[\d\s.,]*\s*k?\s*€)?)(?:\s*\(Estimation[^)]*\)?)?$/i);
  if (salaire && salaire.index !== undefined) {
    r.remuneration = salaire[1].replace(/\s+/g, ' ').trim();
    t = t.slice(0, salaire.index).trim();
  }
  const note = t.match(/^(.+?)\s+\d[.,]\d\s*★\s+(.+)$/);
  if (note) {
    r.entreprise = note[1].trim();
    t = note[2].trim();
  }
  const genre = t.match(GENRE);
  if (genre && genre[2].length <= 40) {
    t = genre[1].trim();
    r.lieu = genre[2].trim();
  }
  r.titre = t;
  return r;
}
