// CV en Markdown -> HTML -> PDF A4 (Chrome ou Edge sans interface).
// Le gabarit est un dossier : gabarit.css, ses polices, et une photo facultative (portrait.webp|jpg|jpeg|png).
// L'HTML intermédiaire est écrit dans <gabarit>/apercu/ (il pointe vers ../gabarit.css), le PDF à côté du .md. Le nombre de pages est l'indicateur à surveiller (cible : 2).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { marked, type Token, type Tokens } from 'marked';
import { RACINE_APP, variable } from '../core/config.ts';
import { capturerPages } from './pages.ts';

/** Gabarit livré avec l'application. */
export const GABARIT_DEFAUT = join(RACINE_APP, 'gabarits', 'cv', 'sobre');

/** Sections rendues sur deux colonnes (listes courtes). */
const SECTIONS_DEUX_COLONNES = /compétences|competences|formations|certifications|langues|skills|education|languages/i;

const ICONES: Record<string, string> = {
  mail: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3h15A2.5 2.5 0 0 1 22 5.5v13A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5v-13Zm2.2-.5 7.8 6.1L19.8 5H4.2ZM20 7.4l-7.4 5.8a1 1 0 0 1-1.2 0L4 7.4V19h16V7.4Z"/>',
  phone:
    '<path d="M6.6 2.5a1.8 1.8 0 0 1 2.5.6l1.7 2.8c.4.7.3 1.6-.3 2.1l-1.3 1.2a12 12 0 0 0 4.6 4.6l1.2-1.3c.5-.6 1.4-.7 2.1-.3l2.8 1.7a1.8 1.8 0 0 1 .6 2.5l-1.2 1.9a3 3 0 0 1-3.4 1.3C11.1 18.2 5.8 12.9 4.4 6.1A3 3 0 0 1 5.7 2.7l.9-.2Z"/>',
  pin: '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7Zm0 4.2A2.8 2.8 0 1 0 12 11.8 2.8 2.8 0 0 0 12 6.2Z"/>',
  globe:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15 15 0 0 0-1.2-5.5A8 8 0 0 1 18.9 11ZM12 4.2c.9 1.3 1.7 3.6 1.9 6.8h-3.8c.2-3.2 1-5.5 1.9-6.8ZM5.1 11a8 8 0 0 1 4.2-5.5A15 15 0 0 0 8.1 11h-3Zm0 2h3a15 15 0 0 0 1.2 5.5A8 8 0 0 1 5.1 13Zm6.9 6.8c-.9-1.3-1.7-3.6-1.9-6.8h3.8c-.2 3.2-1 5.5-1.9 6.8Zm2.7-1.3a15 15 0 0 0 1.2-5.5h3a8 8 0 0 1-4.2 5.5Z"/>',
  clock:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6Zm-1.1 3v5.4l4.3 2.6 1.1-1.8-3.3-2V7.2h-2.1Z"/>',
  linkedin:
    '<path d="M6.5 8A1.5 1.5 0 1 0 6.5 5a1.5 1.5 0 0 0 0 3ZM5 10a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8Zm6 9h1a1 1 0 0 0 1-1v-4.5c0-1.5 3-2.5 3-.5V18a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-6c0-2-1.5-3-3.5-3S13 10.5 13 10.5V10a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1Zm9-18a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3h16Zm1 3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4Z"/>',
  github:
    '<path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7 0-.7 0-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.1 4 18.1 4.3 18.1 4.3c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z"/>',
  // Chaîne (deux maillons) pour les autres profils (Malt, GitLab, portfolio de plateforme…).
  link: '<path d="M3.7 12a5.1 5.1 0 0 1 5.1-5.1h3.4v2.2H8.8a2.9 2.9 0 0 0 0 5.8h3.4v2.2H8.8A5.1 5.1 0 0 1 3.7 12Zm6.2 1.1h4.2v-2.2H9.9v2.2Zm6.2-6.2h-3.4v2.2h3.4a2.9 2.9 0 1 1 0 5.8h-3.4v2.2h3.4a5.1 5.1 0 0 0 0-10.2Z"/>',
};

const PROFILS = /linkedin|github|gitlab|malt|behance|dribbble|stackoverflow|codeur|free-?work/;
const TELEPHONE = /^\D*(\+?\d[\d\s().-]{7,})\D*$/;
const DISPONIBILITE = /disponib|immédiat|immediat|availab/;

function estProfil(texte: string): boolean {
  return PROFILS.test(texte.toLowerCase());
}

/** Adresse / lieu : tout ce qui n'est ni un moyen de contact ni un profil. */
function estAdresse(texte: string): boolean {
  if (estProfil(texte)) return false;
  const t = texte.toLowerCase();
  if (/@/.test(t) && !/https?:/.test(t)) return false;
  if (DISPONIBILITE.test(t)) return false;
  if (TELEPHONE.test(texte)) return false;
  if (/portfolio|https?:|\.[a-z]{2,6}\b\/?$/.test(t)) return false;
  return true;
}

function icone(texte: string): string {
  const t = texte.toLowerCase();
  let nom = 'pin';
  if (/linkedin/.test(t)) nom = 'linkedin';
  else if (/github/.test(t)) nom = 'github';
  else if (PROFILS.test(t)) nom = 'link';
  else if (/@/.test(t) && !/https?:/.test(t)) nom = 'mail';
  else if (DISPONIBILITE.test(t)) nom = 'clock';
  else if (TELEPHONE.test(texte)) nom = 'phone';
  else if (/https?:|portfolio|\.[a-z]{2,6}\b/.test(t)) nom = 'globe';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[nom]}</svg>`;
}

const enLigne = (texte: string): string => marked.parseInline(texte) as string;

/** Intitulé d'une expérience : « 01/2019 – aujourd'hui · Lyon » ou « … | Lyon ». */
function metaPoste(titre: string): string {
  const parts = titre
    .split(/\s+[·|]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `<div class="job-meta">${parts.map((p) => `<span>${enLigne(p)}</span>`).join('')}</div>`;
}

function rendreJeton(t: Token): string {
  if (t.type === 'paragraph') return `<p>${enLigne((t as Tokens.Paragraph).text)}</p>`;
  if (t.type === 'list') return `<ul>${(t as Tokens.List).items.map((it) => `<li>${enLigne(it.text)}</li>`).join('')}</ul>`;
  if (t.type === 'blockquote') {
    const lignes = ((t as Tokens.Blockquote).tokens ?? [])
      .filter((x) => x.type === 'paragraph')
      .map((x) => `<p>${enLigne((x as Tokens.Paragraph).text)}</p>`)
      .join('');
    return `<blockquote>${lignes}</blockquote>`;
  }
  if (t.type === 'space' || t.type === 'hr') return '';
  if (t.type === 'html') return t.raw;
  if (t.raw) return `<p>${enLigne(t.raw.trim())}</p>`;
  return '';
}

export interface OptionsHtml {
  /** Feuille de style, relative à l'HTML produit. */
  css: string;
  /** Photo, relative à l'HTML produit (absente : pas de photo). */
  portrait?: string | null;
  langue?: string;
}

/**
 * Structure attendue :
 * `# Prénom NOM`, titre en **gras**, sous-titre en *italique*, lignes de contact (séparées par « · »),
 * puis des sections `##` ; dans l'expérience, un poste = `### dates · lieu` suivi d'une ligne en gras (l'intitulé).
 */
export function cvEnHtml(markdown: string, o: OptionsHtml): string {
  const jetons = marked.lexer(markdown);
  const sortie: string[] = [];
  let i = 0;

  let nom = '';
  const h1 = jetons.find((t) => t.type === 'heading' && (t as Tokens.Heading).depth === 1) as Tokens.Heading | undefined;
  if (h1) {
    nom = enLigne(h1.text);
    i = jetons.indexOf(h1) + 1;
  }

  const entete: Token[] = [];
  while (i < jetons.length && !(jetons[i].type === 'heading' && (jetons[i] as Tokens.Heading).depth === 2)) {
    entete.push(jetons[i]);
    i += 1;
  }

  let titre = '';
  let sousTitre = '';
  const contacts: string[] = [];
  for (const t of entete) {
    if (t.type === 'paragraph') {
      const lignes = (t as Tokens.Paragraph).text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const ligne of lignes) {
        const estSous = /^\*\(.+\)\*$/.test(ligne) || /^[*_][^*_].*[*_]$/.test(ligne);
        if (!titre && /^\*\*/.test(ligne) && !/·/.test(ligne)) titre = enLigne(ligne.replace(/^\*\*|\*\*$/g, ''));
        else if (!sousTitre && estSous) sousTitre = enLigne(ligne.replace(/^\*|\*$/g, ''));
        else contacts.push(...ligne.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean));
      }
    } else if (t.type === 'list') {
      contacts.push(...(t as Tokens.List).items.map((it) => it.text.trim()));
    }
  }

  const elements = contacts.map((brut) => {
    // « **E-mail :** valeur » : la valeur reste, le libellé choisit l'icône.
    const libelle = brut.match(/^\*\*([^*]+?)\s*:\*\*\s*(.+)$/);
    const valeur = libelle ? libelle[2].trim() : brut;
    const indice = libelle ? `${libelle[1]} ${valeur}` : valeur;
    const genre = estProfil(indice) ? 'profil' : estAdresse(indice) ? 'adresse' : 'principal';
    return { genre, html: `<li>${icone(indice)}<span>${enLigne(valeur)}</span></li>` };
  });
  const groupe = (genre: string, classe: string) => {
    const items = elements.filter((c) => c.genre === genre).map((c) => c.html);
    return items.length ? `<ul class="contacts${classe ? ` ${classe}` : ''}">\n${items.join('\n')}\n</ul>` : '';
  };
  const blocContacts = [groupe('principal', ''), groupe('adresse', 'contacts-address'), groupe('profil', 'contacts-profiles')]
    .filter(Boolean)
    .join('\n');

  sortie.push(`<header class="cv-header">
<div class="cv-id">
${nom ? `<h1>${nom}</h1>` : ''}
${titre ? `<div class="headline">${titre}</div>` : ''}
${sousTitre ? `<div class="subline">${sousTitre}</div>` : ''}
${blocContacts}
</div>
${o.portrait ? `<img class="portrait" src="${o.portrait}" alt="">` : ''}
</header>`);

  let section: { titre: string; deuxColonnes: boolean; corps: string[] } | null = null;
  let poste: { meta: string; corps: string[] } | null = null;
  const fermerPoste = () => {
    if (poste && section) section.corps.push(`<div class="job">${poste.meta}<div class="job-body">${poste.corps.join('\n')}</div></div>`);
    poste = null;
  };
  const fermerSection = () => {
    if (section) sortie.push(`<section class="${section.deuxColonnes ? 'two-col' : ''}"><h2>${section.titre}</h2>\n${section.corps.join('\n')}</section>`);
    section = null;
  };

  for (; i < jetons.length; i += 1) {
    const t = jetons[i];
    // Saut de page manuel (<!-- saut-de-page --> ou un div break-after) : il ferme le poste et la section
    // en cours, sinon il resterait enfermé dans le dernier poste, sans effet.
    if (t.type === 'html' && /saut-de-page|break-after/i.test(t.raw)) {
      fermerPoste();
      fermerSection();
      sortie.push('<div class="saut-de-page" style="break-after: page"></div>');
      continue;
    }
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 2) {
      fermerPoste();
      fermerSection();
      const texte = (t as Tokens.Heading).text;
      section = { titre: enLigne(texte), deuxColonnes: SECTIONS_DEUX_COLONNES.test(texte), corps: [] };
      continue;
    }
    if (t.type === 'heading' && (t as Tokens.Heading).depth === 3) {
      fermerPoste();
      poste = { meta: metaPoste((t as Tokens.Heading).text), corps: [] };
      continue;
    }
    const html = rendreJeton(t);
    if (!html) continue;
    const p = poste as { meta: string; corps: string[] } | null;
    const s = section as { corps: string[] } | null;
    if (p) p.corps.push(p.corps.length === 0 && /^<p><strong>/.test(html) ? html.replace(/^<p>/, '<p class="job-role">') : html);
    else if (s) s.corps.push(html);
    else sortie.push(html);
  }
  fermerPoste();
  fermerSection();

  return `<!DOCTYPE html>
<html lang="${o.langue ?? 'fr'}">
<head>
<meta charset="utf-8">
<title>CV</title>
<link rel="stylesheet" href="${o.css}">
</head>
<body>
${sortie.join('\n')}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Navigateur et PDF

const NAVIGATEURS_WINDOWS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const NAVIGATEURS_MAC = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const HEADLESS = join(process.env.HOME ?? '', '.cache', 'chrome-headless');
const HEADLESS_SHELL = join(HEADLESS, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
const NAVIGATEURS_LINUX = [
  HEADLESS_SHELL,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
];

/** Premier Chrome / Edge / Chromium trouvé (POSTULER_JUSTE_NAVIGATEUR pour l'imposer), ou null. */
export function trouverNavigateur(env: NodeJS.ProcessEnv = process.env): string | null {
  const impose = variable(env, 'NAVIGATEUR');
  if (impose) return existsSync(impose) ? impose : null;
  const liste =
    process.platform === 'win32'
      ? [
          ...NAVIGATEURS_WINDOWS,
          ...(env.LOCALAPPDATA ? [join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')] : []),
        ]
      : process.platform === 'darwin'
        ? NAVIGATEURS_MAC
        : NAVIGATEURS_LINUX;
  return liste.find((p) => existsSync(p)) ?? null;
}

function urlFichier(chemin: string): string {
  const p = chemin.replace(/\\/g, '/');
  return p.startsWith('//') ? `file:${encodeURI(p)}` : `file:///${encodeURI(p.replace(/^\/+/, ''))}`;
}

export function compterPages(pdf: string): number {
  const texte = readFileSync(pdf).toString('latin1');
  return texte.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

export function cheminPortrait(dossierGabarit: string): string | null {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    if (existsSync(join(dossierGabarit, `portrait.${ext}`))) return `portrait.${ext}`;
  }
  return null;
}

function portraitRelatif(gabarit: string): string | null {
  const p = cheminPortrait(gabarit);
  return p ? `../${p}` : null;
}

export interface ResultatCv {
  markdown: string;
  html: string;
  pdf: string;
  pages: number;
  /** Image PNG des pages réelles du PDF (option capture), pour un contrôle visuel sans visionneuse PDF. */
  capture?: string;
}

/** Génère le PDF d'un CV Markdown avec le gabarit donné (dossier contenant gabarit.css). */
export function genererCv(markdown: string, dossierGabarit: string, navigateur: string, o: { capture?: boolean } = {}): ResultatCv {
  const md = resolve(markdown);
  if (!existsSync(md)) throw Object.assign(new Error(`CV introuvable : ${md}`), { utilisateur: true });
  const gabarit = resolve(dossierGabarit);
  if (!existsSync(join(gabarit, 'gabarit.css'))) {
    throw Object.assign(new Error(`Gabarit incomplet : ${join(gabarit, 'gabarit.css')} manquant`), { utilisateur: true });
  }
  const nom = basename(md).replace(/\.md$/i, '');
  const apercu = join(gabarit, 'apercu');
  mkdirSync(apercu, { recursive: true });
  const html = join(apercu, `${nom}.html`);
  const pdf = join(dirname(md), `${nom}.pdf`);
  writeFileSync(html, cvEnHtml(readFileSync(md, 'utf8'), { css: '../gabarit.css', portrait: portraitRelatif(gabarit) }), 'utf8');
  execFileSync(
    navigateur,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=4000',
      `--print-to-pdf=${pdf}`,
      urlFichier(html),
    ],
    {
      stdio: 'pipe',
      env: navigateur === HEADLESS_SHELL ? { ...process.env, LD_LIBRARY_PATH: join(HEADLESS, 'lib') } : process.env,
    },
  );
  const pages = compterPages(pdf);
  const resultat: ResultatCv = { markdown: md, html, pdf, pages };
  if (o.capture) {
    // Vraies pages du PDF (rendues par pdf.js), et non le rendu HTML écran : les sauts de page sont ceux du PDF.
    const png = join(apercu, `${nom}.png`);
    capturerPages(pdf, png, navigateur, {
      pages,
      env: navigateur === HEADLESS_SHELL ? { ...process.env, LD_LIBRARY_PATH: join(HEADLESS, 'lib') } : process.env,
    });
    resultat.capture = png;
  }
  return resultat;
}

// ---------------------------------------------------------------------------------------------
// Gabarits livrés et choix du gabarit de l'espace

export const DOSSIER_GABARITS = join(RACINE_APP, 'gabarits', 'cv');

/** Gabarits livrés avec l'application : nom du dossier et première phrase de l'en-tête de gabarit.css. */
export function listerGabarits(): { nom: string; description: string }[] {
  return readdirSync(DOSSIER_GABARITS)
    .filter((n) => existsSync(join(DOSSIER_GABARITS, n, 'gabarit.css')))
    .map((nom) => {
      const css = readFileSync(join(DOSSIER_GABARITS, nom, 'gabarit.css'), 'utf8');
      const entete = css.match(/\/\*([\s\S]*?)\*\//)?.[1] ?? '';
      const phrase = entete.replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0] ?? '';
      return { nom, description: phrase };
    });
}

/**
 * Installe un gabarit livré dans <espace>/cv/gabarit. L'ancien est renommé cv/gabarit-<AAAAMMJJ-HHMMSS>
 * (rien n'est perdu) ; la photo (portrait.*) est reprise dans le nouveau.
 */
export function choisirGabarit(espace: string, nom: string): { dossier: string; ancien: string | null } {
  const source = join(DOSSIER_GABARITS, nom);
  if (!/^[\w-]+$/.test(nom) || !existsSync(join(source, 'gabarit.css'))) {
    const noms = listerGabarits().map((g) => g.nom).join(', ');
    throw Object.assign(new Error(`Gabarit inconnu : ${nom} (disponibles : ${noms})`), { utilisateur: true });
  }
  const cible = join(espace, 'cv', 'gabarit');
  let ancien: string | null = null;
  if (existsSync(cible)) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    ancien = join(espace, 'cv', `gabarit-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`);
    renameSync(cible, ancien);
  }
  cpSync(source, cible, { recursive: true });
  const portrait = ancien ? cheminPortrait(ancien) : null;
  if (ancien && portrait) cpSync(join(ancien, portrait), join(cible, portrait));
  return { dossier: cible, ancien };
}
