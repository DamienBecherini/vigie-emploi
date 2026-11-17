// Espace de démonstration (données fictives) pour les captures du README, en français ou en anglais :
//   node scripts/demo/demo.ts <dossier> fr|en [--port 4420]
// Le dossier est effacé puis recréé. Offres, notes, candidatures et journal sont les mêmes dans les deux langues ;
// seuls les textes changent. Les échéances sont datées par rapport au jour du lancement.
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ouvrirBase } from '../../src/db/base.ts';
import { enregistrerOffre } from '../../src/core/offres.ts';

const [dossierArg, langue = 'fr'] = process.argv.slice(2);
if (!dossierArg || !['fr', 'en'].includes(langue)) {
  console.error('Usage : node scripts/demo/demo.ts <dossier> fr|en [--port 4420]');
  process.exit(2);
}
const iPort = process.argv.indexOf('--port');
const port = iPort > 0 ? process.argv[iPort + 1] : '4420';
const dossier = resolve(dossierArg);
const fr = langue === 'fr';
const BIN = resolve(import.meta.dirname, '../../bin/vigie-emploi.js');
const cli = (...args: string[]) => execFileSync(process.execPath, [BIN, ...args, '--data', dossier], { stdio: 'pipe' });

/** Texte dans la langue de la démo. */
const t = (f: string, e: string) => (fr ? f : e);

rmSync(dossier, { recursive: true, force: true });
execFileSync(process.execPath, [BIN, 'init', dossier, '--port', port, '--langue', langue, '--json'], { stdio: 'pipe' });

// 1. Offres (ids 1 à 14 dans cet ordre)
type O = [source: string, titre: [string, string], entreprise: [string, string], lieu: [string, string], remuneration: [string, string] | null, teletravail: [string, string], recue: string];
const offres: O[] = [
  ['hellowork', ['Développeur WordPress H/F', 'WordPress Developer'], ['Atelier Numérique', 'Digital Workshop'], ['Lyon', 'Lyon'], ['45-50 K€', '€45k–50k'], ['hybride, 2 j sur site', 'hybrid, 2 days on site'], '2026-10-31'],
  ['hellowork', ['Stage développeur web H/F', 'Web Developer Internship'], ['Studio Exemple', 'Example Studio'], ['Nantes', 'Nantes'], null, ['sur site', 'on site'], '2026-10-31'],
  ['indeed', ['Développeur·se web full stack', 'Full Stack Web Developer'], ['Agence Horizon', 'Horizon Agency'], ['Bordeaux', 'Bordeaux'], ['42-48 K€', '€42k–48k'], ['3 j sur site', '3 days on site'], '2026-11-01'],
  ['linkedin', ['Développeur PHP / WordPress senior', 'Senior PHP / WordPress Developer'], ['Éditions Exemple', 'Example Publishing'], ['Paris', 'Paris'], ['52-58 K€', '€52k–58k'], ['1 j sur site', '1 day on site'], '2026-11-02'],
  ['linkedin', ['Ingénieur backend API & intégration', 'Backend Engineer, APIs & Integration'], ['Logistique Démo', 'Demo Logistics'], ['Lille', 'Lille'], ['50-60 K€', '€50k–60k'], ['2 j sur site', '2 days on site'], '2026-11-02'],
  ['linkedin', ['Développeur Java Spring', 'Java Spring Developer'], ['Banque Fictive', 'Fictional Bank'], ['La Défense', 'La Défense'], ['55-65 K€', '€55k–65k'], ['2 j sur site', '2 days on site'], '2026-11-02'],
  ['free-work', ['Développeur PHP freelance', 'Freelance PHP Developer'], ['Client final (via plateforme)', 'End client (via platform)'], ['Full remote', 'Fully remote'], ['430-450 €/j', '€430–450/day'], ['full remote', 'fully remote'], '2026-10-30'],
  ['glassdoor', ['Intégrateur API', 'API Integrator'], ['Intégrations & Cie', 'Integrations & Co'], ['Rennes', 'Rennes'], null, ['hybride', 'hybrid'], '2026-10-30'],
  ['linkedin', ['Lead développeur PHP / Symfony', 'Lead PHP / Symfony Developer'], ['Mutuelle Exemple', 'Example Health Insurance'], ['Paris', 'Paris'], ['60-70 K€', '€60k–70k'], ['2 j sur site', '2 days on site'], '2026-11-11'],
  ['indeed', ['Développeur Python / FastAPI', 'Python / FastAPI Developer'], ['Santé Connectée', 'Connected Health'], ['Toulouse', 'Toulouse'], ['48-55 K€', '€48k–55k'], ['full remote', 'fully remote'], '2026-11-11'],
  ['free-work', ['Mission DevOps Docker / CI', 'DevOps Contract, Docker / CI'], ['ESN Exemple', 'Example Consultancy'], ['Full remote', 'Fully remote'], ['450-480 €/j', '€450–480/day'], ['full remote', 'fully remote'], '2026-11-10'],
  ['hellowork', ['Développeur WordPress / WooCommerce', 'WordPress / WooCommerce Developer'], ['Boutique Démo', 'Demo Shop'], ['Grenoble', 'Grenoble'], ['40-45 K€', '€40k–45k'], ['1 j sur site', '1 day on site'], '2026-11-10'],
  ['linkedin', ['Ingénieur intégration API', 'API Integration Engineer'], ['Assurances Exemple', 'Example Insurance'], ['Nanterre', 'Nanterre'], ['55-62 K€', '€55k–62k'], ['2 j sur site', '2 days on site'], '2026-11-09'],
  ['glassdoor', ['Product engineer full stack', 'Full Stack Product Engineer'], ['Startup Fictive', 'Fictional Startup'], ['Paris', 'Paris'], ['50-58 K€', '€50k–58k'], ['2 j sur site', '2 days on site'], '2026-11-09'],
];
const db = ouvrirBase(join(dossier, 'data', 'vigie-emploi.sqlite'));
const i = fr ? 0 : 1;
offres.forEach(([source, titre, entreprise, lieu, rem, tele, recue], n) =>
  enregistrerOffre(db, source, `demo-${n + 1}`, {
    url_canonique: `https://exemple.test/demo-${n + 1}`,
    titre: titre[i], entreprise: entreprise[i], lieu: lieu[i], remuneration: rem?.[i], teletravail: tele[i], recue_le: recue,
  }, 'manuel'),
);
db.close();

// 2. Notes (critères de la grille d'exemple ; la note finale est calculée par l'application)
type C = [technique: number, role: number, interet: number, risque: number];
type N = [id: number, notes: C, justif: [string, string][], entrees: Record<string, unknown>, colle: [string, string], ecarts: [string, string], bloquants?: string[]];
const notes: N[] = [
  [4, [9, 8, 7, 8], [['PHP 8 et WordPress au niveau fort', 'PHP 8 and WordPress at a strong level'], ['Senior, autonomie', 'Senior, autonomous'], ['Produit éditorial', 'Editorial product'], ['Entreprise stable', 'Stable company']], { jours_sur_site: 1, salaire_min: 52000, salaire_max: 58000, unite: 'an' }, ['Cœur de métier PHP / WordPress, télétravail 4 j', 'Core PHP / WordPress skills, 4 days remote'], ['Aucun', 'None']],
  [5, [8, 7, 8, 7], [['API REST fort, Docker moyen', 'REST APIs strong, Docker medium'], ['Back-end confirmé', 'Experienced back end'], ['Intégration de SI', 'Systems integration'], ['Équipe en croissance', 'Growing team']], { jours_sur_site: 2, salaire_min: 50000, salaire_max: 60000, unite: 'an' }, ['API et intégration', 'APIs and integration'], ['Kubernetes demandé (zéro)', 'Kubernetes required (none)']],
  [7, [8, 7, 6, 6], [['PHP fort', 'PHP strong'], ['Mission freelance 6 mois', '6-month freelance contract'], ['Refonte classique', 'Standard redesign'], ['Client final inconnu', 'End client unknown']], { jours_sur_site: 0, salaire_min: 430, salaire_max: 450, unite: 'jour' }, ['Full remote, TJM dans la cible', 'Fully remote, day rate on target'], ['Client non nommé', 'Client not named']],
  [3, [6, 6, 5, 6], [['React moyen, PHP fort', 'React medium, PHP strong'], ['Full stack', 'Full stack'], ['Agence', 'Agency'], ['RAS', 'Nothing to report']], { jours_sur_site: 3, salaire_min: 42000, salaire_max: 48000, unite: 'an' }, ['Stack connue', 'Familiar stack'], ['3 jours sur site', '3 days on site']],
  [6, [1, 5, 3, 5], [['Java au niveau zéro', 'Java at level zero'], ['Confirmé', 'Experienced'], ['Banque, peu de produit', 'Bank, little product work'], ['RAS', 'Nothing to report']], { jours_sur_site: 2 }, ['', ''], ['Java / Spring', 'Java / Spring']],
  [2, [5, 1, 3, 5], [['Stack web', 'Web stack'], ['Stage', 'Internship'], ['Stage', 'Internship'], ['RAS', 'Nothing to report']], {}, ['', ''], ['Stage', 'Internship'], ['stage']],
  [9, [6, 8, 7, 7], [['PHP fort, Symfony léger', 'PHP strong, Symfony light'], ['Lead, encadrement', 'Lead, mentoring'], ['Mutuelle, produit interne', 'Insurer, in-house product'], ['Grand compte', 'Large company']], { jours_sur_site: 2, salaire_min: 60000, salaire_max: 70000, unite: 'an' }, ['PHP, rôle de lead', 'PHP, lead role'], ['Symfony au niveau léger', 'Symfony at a light level']],
  [10, [7, 7, 8, 6], [['Python moyen, API fort', 'Python medium, APIs strong'], ['Back-end confirmé', 'Experienced back end'], ['Santé, produit utile', 'Health, useful product'], ['Jeune entreprise', 'Young company']], { jours_sur_site: 0, salaire_min: 48000, salaire_max: 55000, unite: 'an' }, ['Full remote, API', 'Fully remote, APIs'], ['FastAPI demandé (projet perso seulement)', 'FastAPI required (side project only)']],
  [11, [8, 7, 6, 6], [['Docker et CI au niveau fort', 'Docker and CI at a strong level'], ['Mission autonome', 'Autonomous contract'], ['Industrialisation', 'Industrialisation'], ['Via ESN', 'Through a consultancy']], { jours_sur_site: 0, salaire_min: 450, salaire_max: 480, unite: 'jour' }, ['Full remote, TJM au-dessus de la cible basse', 'Fully remote, day rate above the low target'], ['Kubernetes souhaité', 'Kubernetes preferred']],
  [12, [9, 6, 6, 7], [['WordPress / WooCommerce fort', 'WordPress / WooCommerce strong'], ['Confirmé', 'Experienced'], ['E-commerce', 'E-commerce'], ['PME stable', 'Stable SME']], { jours_sur_site: 1, salaire_min: 40000, salaire_max: 45000, unite: 'an' }, ['Cœur de métier', 'Core skills'], ['Salaire sous la cible', 'Salary below target']],
  [13, [8, 7, 7, 8], [['API et intégration fort', 'APIs and integration strong'], ['Ingénieur confirmé', 'Experienced engineer'], ['Intégration de SI', 'Systems integration'], ['Grand compte', 'Large company']], { jours_sur_site: 2, salaire_min: 55000, salaire_max: 62000, unite: 'an' }, ['Intégration SI, API', 'Systems integration, APIs'], ['Aucun', 'None']],
  [14, [6, 7, 8, 5], [['TypeScript moyen', 'TypeScript medium'], ['Product engineer', 'Product engineer'], ['Produit SaaS', 'SaaS product'], ['Levée de fonds récente', 'Recently funded']], { jours_sur_site: 2, salaire_min: 50000, salaire_max: 58000, unite: 'an' }, ['Produit, full stack', 'Product, full stack'], ['React / Node au cœur du poste', 'React / Node at the core of the role']],
];
const ids = ['technique', 'role', 'interet', 'risque'];
const lot = {
  offres: notes.map(([id, c, j, entrees, colle, ecarts, bloquants = []]) => ({
    id,
    criteres: Object.fromEntries(ids.map((k, n) => [k, { note: c[n], justification: j[n][i] }])),
    entrees, bloquants, colle: colle[i], ecarts: ecarts[i], lu: true,
  })),
};
const fichierLot = join(dossier, 'demo-lot.json');
writeFileSync(fichierLot, JSON.stringify(lot, null, 2));
cli('noter', '--fichier', fichierLot);
rmSync(fichierLot);
cli('statut', '6', 'ecartee', '--commentaire', t('Java au niveau zéro', 'Java at level zero'));
cli('statut', '2', 'ecartee', '--commentaire', t('Règle bloquante : stage', 'Blocking rule: internship'));

// 3. Candidatures envoyées, réponses, entretiens, relances
const candidatures: [number, string, string, string][] = [
  [4, 'editions-exemple-php-wordpress', 'LinkedIn', '03/11/2026'],
  [5, 'logistique-demo-api', t("site de l'entreprise", 'company website'), '04/11/2026'],
  [13, 'assurances-exemple-integration', 'LinkedIn', '06/11/2026'],
  [11, 'esn-exemple-devops', 'Free-Work', '10/11/2026'],
  [12, 'boutique-demo-woocommerce', 'HelloWork', '05/11/2026'],
];
for (const [id, dossierCandidature, canal, le] of candidatures) {
  cli('candidater', String(id));
  cli('candidature', String(id), '--dossier', `candidatures/${dossierCandidature}`, '--canal', canal, '--envoyee-le', le);
}
const ev = (id: number, ...args: string[]) => cli('evenement', String(id), ...args);
ev(4, '--type', 'message', '--sens', 'recu', '--le', '06/11/2026 09:30', '--resume', t('Réponse de la responsable technique : entretien proposé', 'Reply from the technical lead: interview offered'));
cli('statut', '4', 'entretien');
ev(4, '--type', 'entretien', '--le', '+5', '--no-fait', '--resume', t('Entretien visio avec la responsable technique', 'Video interview with the technical lead'));
ev(11, '--type', 'message', '--sens', 'recu', '--le', '11/11/2026 16:00', '--resume', t("L'ESN transmet le dossier au client final", 'The consultancy forwards the application to the end client'));
ev(11, '--type', 'proposition', '--le', '11/11/2026 16:05', '--montant', '460', '--unite', t('€ HT/j', '€/day excl. VAT'), '--jours', '60', '--resume', t('Proposition : 460 € HT/j, 3 mois renouvelables', 'Offer: €460/day excl. VAT, 3 months, renewable'));
ev(11, '--type', 'entretien', '--le', '+3', '--no-fait', '--resume', t('Entretien avec le client final', 'Interview with the end client'));
ev(12, '--type', 'decision', '--sens', 'recu', '--le', '09/11/2026 10:00', '--resume', t('Refus : profil plus junior retenu', 'Rejected: a more junior profile was chosen'));
cli('statut', '12', 'refus');
ev(5, '--type', 'message', '--sens', 'envoye', '--le', '+1', '--no-fait', '--resume', t('Relancer Logistique Démo', 'Follow up with Demo Logistics'));
ev(13, '--type', 'message', '--sens', 'envoye', '--le', '+4', '--no-fait', '--resume', t('Relancer Assurances Exemple', 'Follow up with Example Insurance'));

// 4. Offres en « go », à préparer
cli('candidater', '7');
ev(7, '--type', 'note', '--le', '+2', '--no-fait', '--resume', t('Envoyer la proposition sur la plateforme', 'Send the proposal on the platform'));
cli('candidater', '10');
ev(10, '--type', 'note', '--le', '+6', '--no-fait', '--resume', t('Envoyer la candidature avec le CV ciblé', 'Send the application with the targeted résumé'));

console.log(`${t('démo prête', 'demo ready')} : ${dossier} (${langue}, port ${port})`);
