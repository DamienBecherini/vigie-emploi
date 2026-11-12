// Textes anglais de la CLI, de l'API, du suivi généré et de l'initialisation (mêmes clés que fr.ts).
import type { CleServeur } from './fr.ts';
import type { Pluriel, Texte } from './outil.ts';

const p = (one: string, other: string): Pluriel => ({ one, other });

export const en: Record<CleServeur, Texte> = {
  'cli.aide': `postuler-juste — job offers, scores and applications (local SQLite database)

Usage: postuler-juste <command> [options]

Command and option names, statuses and event types stay in French (they are typed by the AI):
for example « list --statut envoyee », « evenement 12 --type entretien ».

Commands
  init <folder> [--port 4410] [--nom-mcp postuler-juste] [--gabarit sobre|moderne|compact] [--langue fr|en]
                        Creates a workspace (templates, résumé template, sample grid, config, .mcp.json)
                        and prints the starting prompt to give the AI; --langue: language of the dashboard,
                        the CLI and the tracking file (fr by default)
  compter <file>        Character count of each copy-paste message in the file (blocks between
                        « ──── début … » and « ──── fin … »), or of the whole file if it has none
  gabarits              Bundled résumé templates (sobre, moderne, compact…)
  gabarit <name>        Installs this template in the workspace's cv/gabarit (the old one is kept next to it)
  cv <cv.md>… [--gabarit <folder>] [--capture]
                        Markdown résumé -> A4 PDF next to the .md, with the page count (target: 2).
                        Template: --gabarit, else the workspace's cv/gabarit/, else the application's;
                        --capture: PNG image of the rendering in <template>/apercu/ (visual check)
  ingest [--keep] [--no-fetch] [--emails <folder>]
                        Reads the .eml files of the inbox, adds the new offers,
                        then deletes the processed e-mails (unless --keep)
  import-historique     Imports candidatures/_lots/*.json, _ecartees.md and _SUIVI.md if they exist (idempotent)
  list [filters]        Paginated list of offers
      --statut a,b  --note-min N  --note-max N  --sans-note  --source s1,s2  --tag t
      --depuis YYYY-MM-DD  --jusqua YYYY-MM-DD (date received)  --texte "words"
      --contrat CDI  --teletravail remote  --candidatures  --page N  --taille N
      --tri note|recue_le|publiee_le|titre|entreprise|…  --ordre asc|desc
      --tri recue_le:desc,note:desc  (several levels: date, then score for equal dates)
  show <id>             Offer details (scores, statuses, tags, application)
  a-lire [--limite N] [--complet]
                        Offers to process without a score, with the URL to read (or the description already extracted)
  noter <id> --json '{"criteres": {"technique": {"note": 8, "justification": "…"}, …}, "entrees": {…}, "bloquants": [], "colle": "…"}'
  noter --fichier lot.json [--essai]
                        Records scores (batch format). With « criteres », the score is computed with the
                        grid (see « grille »); without, it is an overall score (old grid).
                        --essai: computes and prints without saving anything
  grille [--consignes] [--json]
                        Current scoring grid: criteria, weights, scales, rules, inventory, examples
  grille --historique | --version N | --restaurer N [--resume "…"] | --init
  grille --modifier '{"poids": {"technique": 40}, …}' --resume "…" [--essai]
                        Partial change (poids, seuil, baremes, regles, inventaire); recomputes the scores
  renoter               Recomputes all criterion-based scores with the current grid
  statut <id> <status> [--commentaire "…"]
                        Statuses: {statuts}
  tag <id> +add -remove
  lien <id> <url|->       Records (or clears with -) the offer link
  candidater <id>       Moves the offer to « go » and prints everything needed to prepare the application
  candidature <id> [--dossier d] [--cv f] [--canal c] [--envoyee-le DD/MM/YYYY] [--message m]
                   [--prochaine-action "…"]
                        Records the application (empty option "" clears a field);
                        with --envoyee-le, the offer moves to « envoyee »
  prochaine-action <id> "text"
                        Next action of the application ("" or - to clear it)
  evenement <id> --type {types} [--le "DD/MM/YYYY HH:MM"] --resume "…"
                   [--sens envoye|recu] [--canal c] [--interlocuteurs "…"] [--details "…"]
                   [--montant 3000 --unite "€"] [--jours 6] [--fichier candidatures/x/quote.md]…
                   [--fait | --no-fait]
                        Adds an event to the application journal; dated in the future (and not done),
                        it is a deadline. --le defaults to now; « demain » (tomorrow), « +3 » accepted
  journal <id>          Application journal (deadlines first, then newest to oldest)
  echeances [--jours 7] Overdue deadlines and those due within N days
  fait <event_id> [--no-fait]
                        Marks a deadline as done (--no-fait: reopen it)
  fichiers <id>         Files of the application folder (paths to quote in --fichier)
  stats                 Applications by stage (sent, reply, interview, offer), reply delay
  generer-suivi [--sortie <file>] [--remplacer]
                        Generates the application tracking file from the database: by default
                        candidatures/_SUIVI.genere.md (preview); --remplacer writes candidatures/_SUIVI.md
  serve [--port 4410] [--inactivite <minutes>]
                        Starts the dashboard (http://localhost:4410); --inactivite: stops by itself after that idle time
  mcp                   MCP server (stdio transport) to drive postuler-juste from an AI; without a configured
                        folder: ~/ma-recherche, created if needed by the initialiser_espace tool

General options
  --data <folder>       Data folder (else POSTULER_JUSTE_DATA or postuler-juste.config.json)
  --config <file>       Configuration file
  --json                JSON output (all commands)

Language: « langue » key of postuler-juste.config.json (fr or en) or POSTULER_JUSTE_LANGUE variable.
`,

  'cli.erreur': 'Error: {message}',
  'cli.commandeInconnue': 'Unknown command: {commande}',
  'cli.invalide': 'Invalid {nom}: {valeur}',
  'cli.offreIntrouvable': 'Offer {id} not found',
  'cli.statutInconnu': 'Unknown status: {statut}',
  'cli.statutAttendu': 'Status expected among: {statuts}',
  'cli.aucun': 'none',

  'cli.detail.statut': 'Status: {statut} · Score: {note} · Source: {source} ({id_site})',
  'cli.detail.url': 'URL: {url}',
  'cli.detail.teletravail': 'remote work: {valeur}',
  'cli.detail.dates': 'Received {recue} · published {publiee}',
  'cli.detail.stack': 'Stack: {stack}',
  'cli.detail.tags': 'Tags: {tags}',
  'cli.detail.noteGrille': 'Score {note} (grid v{version}, exact {exacte}) on {le}',
  'cli.detail.noteAncienne': 'Score {note} (old grid; raw {brute}{penalites}) on {le}',
  'cli.detail.penalites': ', penalties: {penalites}',
  'cli.detail.colle': 'What fits: {texte}',
  'cli.detail.ecarts': 'Gaps: {texte}',
  'cli.detail.candidature': 'Application: {infos}',
  'cli.detail.envoyeeLe': 'sent on {date}',
  'cli.detail.prochaineAction': 'Next action: {texte}',
  'cli.detail.journal': 'Journal:',
  'cli.detail.historique': 'Status history:',
  'cli.detail.description': 'Description:',

  'cli.decomp.neutre': '(neutral) ',
  'cli.decomp.main': '(manual) ',
  'cli.decomp.moyenne': 'Weighted average',
  'cli.decomp.regle': 'Rule: {libelle} → {effet}{sansEffet}',
  'cli.decomp.plafond': 'cap {valeur}',
  'cli.decomp.sansEffet': ' (no effect)',
  'cli.decomp.ignoree': 'Rule ignored (unknown or disabled): {regle}',
  'cli.decomp.note': 'Score: {exacte} → {note}',
  'cli.impact.resume': '{recalculees} criterion-based offer(s) recomputed, {changees} change score.',
  'cli.impact.montent': 'Now above the threshold {seuil} ({n}):',
  'cli.impact.descendent': 'Back below the threshold {seuil} ({n}):',

  'cli.journal.enRetard': 'OVERDUE',
  'cli.journal.aFaire': 'to do',
  'cli.journal.vide': '  (empty journal)',

  'cli.ingest.resume':
    '{fichiers} e-mail(s), {offres} offer(s): {nouvelles} new ({avecDescription} with a description, {aLire} to read in the browser), {doublons} duplicate(s), {ecartees} discarded on the title.',
  'cli.ingest.conserves': 'E-mails kept (--keep).',
  'cli.ingest.supprimes': '{n} e-mail(s) deleted.',
  'cli.ingest.ecartee': '  discarded #{id} {titre} ({motif})',
  'cli.ingest.erreur': '  error {fichier}: {message}',
  'cli.ingest.sansOffre': '  no offer recognised, e-mail kept: {fichier}',
  'cli.ingest.accuse': '  application acknowledgement (not an alert): {sujet}{suite}',
  'cli.ingest.offreAbsente': ' → offer not in the database',
  'cli.ingest.suite': 'Next: postuler-juste a-lire',

  'cli.import.lots': 'Batches: {fichiers} file(s), {entrees} item(s), {offres} offer(s) created, {notes} score(s).',
  'cli.import.registre':
    'Register: {lignes} line(s), {offres} offer(s) including {creees} created ({sansLien} without a link), {statuts} status(es), {notes} score(s), {corrigees} company name(s) corrected.',
  'cli.import.suiviIgnore': 'Tracking file: not read ({raison}).',
  'cli.import.suivi': 'Tracking file: {lignes} line(s), {offres} offer(s) created, {candidatures} application(s), {statuts} status(es).',
  'cli.import.journaux':
    'Journals: {dossiers} folder(s), {lignes} dated line(s), {crees} event(s) created, {existants} already in the database, {retires} removed, {echeances} deadline(s); types: {types}.',
  'cli.import.rattache': '  folder linked to offer #{offre}: {dossier}',
  'cli.import.sansOffre': '  folder without an offer in the database: {dossier}',
  'cli.import.sansSuivi': '  folder without dated tracking: {dossier}',
  'cli.import.nonTypees': 'Untyped journal lines, imported as notes ({n}):',
  'cli.import.sansDate': 'Journal lines without a date, not imported ({n}):',
  'cli.import.fusion': '  duplicate merged: #{doublon} → #{offre} ({entreprise})',
  'cli.import.nonReconnues': 'Unrecognised lines ({n}):',
  'cli.import.liensNonReconnus': 'Unrecognised links ({n}):',

  'cli.list.entetes': 'id|score|status|source|received|company|title',
  'cli.list.pied': 'Page {page}/{pages} · {total} offer(s)',
  'cli.aLire.aucune': 'No offer to read.',
  'cli.aLire.description': 'description extracted',
  'cli.aLire.navigateur': 'to read in the browser',
  'cli.aLire.humain': 'protected page: ask for the text',
  'cli.aLire.sansUrl': '(no URL)',
  'cli.aLire.total': '{n} offer(s) to process. JSON details (descriptions included): postuler-juste a-lire --json',
  'cli.noter.attendu': "noter: --json '{...}' or --fichier lot.json expected",
  'cli.noter.uneSeule': 'noter <id>: a single score expected',

  'cli.grille.copiee': 'Sample grid copied to {chemin} (version 1): adapt it.',
  'cli.grille.existe': 'A grid already exists: {chemin}',
  'cli.grille.version': 'Version {version}: {resume}',
  'cli.grille.resumeAttendu': 'grille --modifier: --resume "…" expected (or --essai for a preview)',
  'cli.grille.jsonInvalide': 'grille --modifier: invalid JSON ({message})',
  'cli.grille.enregistree': 'Version {version} saved.',
  'cli.grille.essai': 'Trial: nothing is saved.',
  'cli.grille.titre': '{nom} — version {version} of {le} ({auteur}): {resume}',
  'cli.grille.fichier': 'File: {chemin} · “worth a look” threshold: {seuil}',
  'cli.grille.criteres': 'Criteria (normalised weights):',
  'cli.grille.ia': 'AI',
  'cli.grille.calcul': 'computed',
  'cli.grille.teletravail': 'Remote work (0 to 5 days on site): {jours}; unknown {inconnu}',
  'cli.grille.remuneration':
    'Pay ({reference}): salary floor {plancher}, target {basse}-{haute} K€; day rate floor {tjm}{fullRemote}, target {tjmBasse}-{tjmHaute} €; unknown {inconnue}',
  'cli.grille.fullRemote': ' ({valeur} fully remote)',
  'cli.grille.regles': 'Blocking rules:',
  'cli.grille.inventaire': 'Inventory:',
  'cli.grille.exemples': 'Reference examples:',
  'cli.grille.consignes': 'Instructions for the AI:',
  'cli.renoter': 'Grid v{version}.',

  'cli.tag.prefixe': 'tag: prefix each tag with + or - ({tags})',
  'cli.tag.aucun': '(no tag)',
  'cli.lien.attendu': 'lien: URL expected (or - to clear)',
  'cli.lien.aucun': '(no link)',
  'cli.candidater.dossier': 'Suggested folder: {dossier}',
  'cli.candidature.option': 'candidature: at least one option expected (--dossier, --canal…)',
  'cli.prochaineAction.attendu': 'prochaine-action: text expected ("" or - to clear)',
  'cli.prochaineAction.aucune': '(no next action)',

  'cli.evenement.typeAttendu': 'evenement: --type expected ({types})',
  'cli.evenement.resumeAttendu': 'evenement: --resume "…" expected',
  'cli.evenement.ajoute': 'Event #{id} added to offer #{offre}: {le} {type}{echeance} — {resume}',
  'cli.evenement.echeance': ' (deadline)',
  'cli.echeances.offre': 'offer #{id}',
  'cli.echeances.enRetard': 'Overdue ({n}):',
  'cli.echeances.aVenir': 'Upcoming until {date} ({n}):',
  'cli.fait.fait': 'Event #{id} done: {resume}',
  'cli.fait.rouvert': 'Event #{id} reopened (to do): {resume}',

  'cli.fichiers.sansDossier': '#{id}: no application folder (postuler-juste candidature {id} --dossier candidatures/…)',
  'cli.fichiers.absent': '#{id}: folder {dossier} missing from the data folder',
  'cli.fichiers.titre': '{dossier} ({n} file(s)):',
  'cli.fichiers.ko': 'KB',
  'cli.stats.etapes': 'Sent: {envoyees} · reply: {reponses} · interview: {entretiens} · offer: {propositions}',
  'cli.stats.pasAssez': 'Delay before the first reply: not enough dated data.',
  'cli.stats.delai': 'Average delay before the first reply: {jours} d (over {n} application(s)).',
  'cli.suivi.resume': '{fichier}: {enCours} in progress, {sansSuite} sent without reply, {closes} closed.',

  'cli.init.usage': 'Usage: postuler-juste init <folder> [--port 4410] [--nom-mcp postuler-juste] [--langue fr|en]',
  'cli.init.cree': 'Workspace created: {dossier}',
  'cli.init.config': '  configuration: {config} (port {port}, language {langue})',
  'cli.init.mcp': '  MCP server “{nom}”: {mcp}',
  'cli.init.navigateur': '  browser for PDFs: {navigateur}',
  'cli.init.commande': 'Application command, from the workspace: {commande}',
  'cli.init.etapes': 'Next steps:',
  'cli.init.etape1': '  1. Drop your résumé and the PDF export of your LinkedIn profile into {dossier}/a-deposer/',
  'cli.init.etape2': '  2. Open your AI in {dossier} (Claude Code: cd into the folder then “claude”, and accept the MCP server)',
  'cli.init.etape3': '  3. Paste this prompt:',

  'cli.compter.usage': 'Usage: postuler-juste compter <file>',
  'cli.compter.ligne': '{caracteres} characters  {mots} words  “{debut}…”',
  'cli.gabarits.choisir': 'Choose: postuler-juste gabarit <name> (from the workspace; the old template is kept next to it).',
  'cli.gabarit.usage': 'Usage: postuler-juste gabarit <name> (list: postuler-juste gabarits)',
  'cli.gabarit.installe': 'Template “{nom}” installed in {dossier}{ancien}.',
  'cli.gabarit.ancien': ' (old template kept in {dossier})',
  'cli.gabarit.regenerer': 'Regenerate the résumés to see the result: postuler-juste cv "cv/<name>.md" --capture',
  'cli.cv.usage': 'Usage: postuler-juste cv <cv.md>… [--gabarit <folder>] [--capture]',
  'cli.cv.sansNavigateur': 'No Chrome, Edge or Chromium found (set its path in POSTULER_JUSTE_NAVIGATEUR)',
  'cli.cv.pages': 'page(s)',
  'cli.cv.depasse': '  <-- MORE THAN 2 PAGES',

  'serveur.demarre': 'Dashboard: http://localhost:{port}/  (data: {dossier})',
  'serveur.arreter': 'Ctrl+C to stop.',
  'serveur.portUtilise': 'Port {port} is already in use: the dashboard is probably already running at http://localhost:{port}/',
  'serveur.autrePort': 'Otherwise, choose another port: postuler-juste serve --port {suivant}',
  'serveur.inactivite': 'No activity for {minutes} min: stopping the dashboard.',
  'api.hoteRefuse': 'Host refused',
  'api.origineRefusee': 'Origin refused',
  'api.actionInconnue': 'Unknown action',
  'api.jsonAttendu': 'JSON request expected',
  'api.offreIntrouvable': 'Offer not found',
  'api.statutInconnu': 'Unknown status',
  'api.champTexte': 'Field {champ}: text expected',
  'api.cheminMalEncode': 'Badly encoded path',
  'api.routeInconnue': 'Unknown route',
  'api.nonCompilee': 'Dashboard not built: run “npm run build” in the postuler-juste folder.',
  'api.sansTerminal':
    'No terminal configured for this platform: add "terminal" to postuler-juste.config.json, or run “claude {invite}” in {dossier}.',
  'api.terminalImpossible': 'Cannot open the terminal ({programme}): {message}',

  'suivi.titre': '# Application tracking',
  'suivi.quand': '{date} at {heure}',
  'suivi.avertissement1': '> **File generated by postuler-juste on {quand}: do not edit by hand.** Changes are made in the database',
  'suivi.avertissement2':
    '> (dashboard, CLI or MCP tools), then `postuler-juste generer-suivi`. One line per offer; the details are in each offer’s folder.',
  'suivi.enCours': 'In progress',
  'suivi.sansSuite': 'Sent without reply',
  'suivi.closes': 'Closed',
  'suivi.entetes': '| Offer | Type | Channel | Sent | Status | Next action | Folder |',
  'suivi.entetesCloses': '| Offer | Outcome |',
  'suivi.estimations': 'Dates marked “≈” are estimates, not a record of sending. Correct them if you find the real date.',
  'suivi.pied':
    'Offers seen, discarded or set aside: in the database (dashboard `postuler-juste serve`, or `postuler-juste list --statut ecartee`).',
  'suivi.aEnvoyer': '**To send** — GO',
  'suivi.teletravail': 'remote {valeur}',
  'suivi.dossier': 'folder',
  'suivi.enRetard': ' (overdue)',
  'suivi.heure': '{h}:{m}',

  'init.invite':
    'You are going to help me with my job search. Please talk to me in English. My workspace is {espace}. Read {espace}/AGENTS.md then {espace}/DEMARRAGE.md, and follow the onboarding: first check which tools you have, read what I dropped into a-deposer/, then ask me your questions, a few at a time.',
  'init.dossierAttendu': 'Folder to create expected: postuler-juste init <folder>',
  'init.pasUnDossier': '{dossier} exists and is not a folder',
  'init.nonVide': 'The folder {dossier} is not empty: choose a new or empty folder',
  'init.nomMcpInvalide': 'Invalid MCP server name: {nom} (letters, digits, - and _)',
  'init.gabaritInconnu': 'Unknown template: {gabarit} (available: {liste})',
  'init.langueInconnue': 'Unknown language: {langue} ({langues})',
  'init.npx':
    'Started by npx: the MCP server and the instructions use “{commande}” (pinned version). On first launch, npx downloads it (connection needed), then keeps it in its cache. For a fixed path, install with “npm install -g postuler-juste” instead, then run init again.',
  'init.nonCompile': 'Dashboard not built: run “npm run build” in {app} before “postuler-juste serve”.',
  'init.sansNavigateur':
    'No Chrome, Edge or Chromium found: generating PDF résumés will not work. Install Chrome or Edge, or set the browser path in POSTULER_JUSTE_NAVIGATEUR.',
  'init.modeleFrancais': 'The AI instructions (workspace templates) are in French for now; an English version will come later. Your AI can still talk to you in English.',

  // ---------------------------------------------------------------------------------------------
  // Core (src/core, ingestion, CV): errors and messages returned to the CLI, the API and the MCP server
  'core.ou': ' or ',
  'core.ni': ' or ',
  'core.aucun': 'none',
  'core.aucune': 'none',
  'core.plafond': 'cap {valeur}',
  'core.sansUrl': 'no URL',
  'core.dateFormat': 'Invalid date: "{texte}" (expected DD/MM/YYYY, DD/MM/YYYY HH:MM or YYYY-MM-DD)',
  'core.dateInvalide': 'Invalid date: "{texte}"',
  'core.heureInvalide': 'Invalid time: "{texte}"',
  'core.texteAttendu': '{nom}: text expected',
  'core.nombreAttendu': '{nom}: number expected ({valeur})',
  'core.cheminVide': 'Empty file path',
  'core.cheminAbsolu': 'Absolute path refused: {chemin} (expected a path relative to the data folder)',
  'core.cheminInvalide': 'Invalid path: {chemin}',
  'core.cheminRefuse': 'Path refused: {chemin}',
  'core.fichiersListe': 'fichiers: a list of paths is expected',
  'core.typeEvenementInconnu': 'Unknown event type: {type} ({types})',
  'core.sensInconnu': 'Unknown direction: {sens} (envoye or recu)',
  'core.evenementIntrouvable': 'Event {id} not found',
  'core.joursInvalide': 'Invalid number of days: {jours}',
  'core.offreIntrouvable': 'Job ad {id} not found',
  'core.resumeEvenement': 'An event summary is required',
  'core.accesRefuse': 'Access denied: {chemin}',
  'core.fichierIntrouvable': 'File not found: {chemin}',
  'core.pasUnFichier': 'Not a file: {chemin}',
  'core.lienInvalide': 'Invalid link (http:// or https:// expected): {lien}',
  'core.statutInconnu': 'Unknown status: {statut}',
  'core.noteInvalide': 'Invalid score: {note}',
  'core.noteEchelle': 'Score outside the 0-10 scale: {note}',
  'core.fusionImpossible': 'Cannot merge: job ad {cible} or {doublon} not found',
  'core.entreeSansId': 'Entry with neither "id" nor "url"',
  'core.sansGrille': 'Criteria-based score without a scoring grid: create profil/grille.json in the data folder (postuler-juste grille --init)',
  'core.noteIgnoree': '"note" field ({note}) ignored: score calculated with grid v{version} = {calculee}',
  'core.noteBruteIgnoree': '"note_brute" field ignored: replaced by the weighted average',
  'core.lotIllisible': 'Unreadable batch: JSON array expected',
  'core.aucuneNote': 'No score to record',
  'core.etape.relire': 'Reread the job ad ({url}) and the recorded score',
  'core.etape.consignes': 'Apply the application instructions in the data folder (CLAUDE.md, AGENTS.md or equivalent)',
  'core.etape.dossier': 'Create the folder {dossier} with the ad, the fit, the gaps and the messages',
  'core.etape.enregistrer':
    'Record the application (folder, CV, channel, next action): enregistrer_candidature or postuler-juste candidature {id} --dossier {dossier}',
  'core.etape.envoi': 'Once it is sent: record the date sent (envoyee_le); the job ad moves to "envoyee" (sent)',
  'core.grilleIllisible': 'Unreadable grid ({chemin}): {message}',
  'core.grilleObjet': 'Unreadable grid ({chemin}): JSON object expected',
  'core.versionIntrouvable': 'Grid version {version} not found',
  'core.resumeChangement': 'A summary of the change is required',
  'core.grilleModifieeFichier': 'Changed in the grille.json file',
  'core.grilleInitiale': 'Initial version (grille.json file)',
  'core.pasDeGrille': 'No scoring grid: create {chemin} (template: exemples/grille.en.json, or "postuler-juste grille --init")',
  'core.aucunChangement': 'No change compared with the current version',
  'core.retourVersion': 'Back to version {version}',
  'core.grille.calculAttendu': 'criterion {id}: "calcul" expected ({calculs})',
  'core.grille.calculReserve': 'criterion {id}: "calcul" is reserved for calculated criteria',
  'core.grille.cibleHaute': 'the high target must be above the floor',
  'core.grille.cibleHauteFullRemote': 'the high target must be above the fully remote floor',
  'core.grille.cibleBasse': 'the low target is above the high target',
  'core.grille.valeurPlafond': 'rule {id}: "valeur" expected for a cap',
  'core.grille.critereSeuil': 'rule {id}: "critere" and "seuil" expected',
  'core.grille.sousNote': 'sub-score from 0 to 10 expected: {valeur}',
  'core.grille.criteresMax': '{n} criteria at most',
  'core.grille.critereDouble': 'duplicate criterion: {id}',
  'core.grille.regleDouble': 'duplicate rule: {id}',
  'core.grille.baremeDouble': 'scale {calcul} used by two criteria',
  'core.grille.unPoids': 'at least one criterion must have a weight',
  'core.grille.exempleCritere': 'example "{titre}": unknown AI criterion {critere}',
  'core.grille.exempleRegle': 'example "{titre}": unknown rule {regle}',
  'core.grille.invalide': 'Invalid grid ({origine}): {message}',
  'core.calc.rythmeInconnu': 'On-site pattern unknown: neutral value',
  'core.calc.fullRemote': 'Fully remote',
  'core.calc.joursSurSite': p('{n} day on site per week', '{n} days on site per week'),
  'core.calc.remunerationInconnue': 'Pay not published: neutral value',
  'core.calc.uniteSalaire': 'K a year',
  'core.calc.uniteTjm': ' a day',
  'core.calc.milieu': 'middle of the range',
  'core.calc.sousPlancher': 'below the floor of {plancher}',
  'core.calc.cibleHaute': 'at or above the high target ({cible})',
  'core.calc.entre': 'between the floor of {plancher} and the high target of {cible}',
  'core.calc.plancherFullRemote': ' (fully remote floor)',
  'core.saisie.invalide': 'Invalid criteria-based score: {message}',
  'core.saisie.critereInconnu': 'Unknown criterion: {id} (criteria scored by the AI: {liste})',
  'core.saisie.critereCalcule': 'The criterion {id} is calculated by the application: do not score it; provide {champs} instead if the job ad gives them',
  'core.saisie.regleInconnue': 'Unknown blocking rule: {id} (rules: {liste})',
  'core.changement.invalide': 'Invalid change: {message}',
  'core.changement.critereInconnuListe': 'Unknown criterion: {id} (criteria: {liste})',
  'core.changement.critereInconnu': 'Unknown criterion: {id}',
  'core.changement.nouvelleRegle': 'New rule {id}: "libelle" and "effet" expected',
  'core.changement.regleInconnue': 'Unknown rule: {id}',
  'core.changement.technoAbsente': 'Technology not in the inventory: {techno}',
  'core.changement.exempleAbsent': 'Example not in the grid: {titre} (examples: {liste})',
  'core.changement.exemplesHomonymes': 'Several examples are called "{titre}": specify { titre, entreprise }',
  'core.consignes.noteFinale':
    'Do not give the final score: the application calculates it (weighted average, blocking rules, rounded to the nearest half point). A "note" field supplied with "criteres" is ignored.',
  'core.consignes.criteres': 'Score each of these criteria from 0 to 10, with a short justification ("criteres" field): {liste}.',
  'core.consignes.calcules': p('Do not score {liste}: it is calculated from the scale. ', 'Do not score {liste}: they are calculated from the scale. '),
  'core.consignes.entrees':
    'Fill in "entrees" when the job ad gives them: jours_sur_site (days on site: 0 = fully remote, 5 = fully on site), salaire_min / salaire_max as plain amounts in the grid\'s currency, and unite (an = per year, mois = per month, jour = per day, heure = per hour). ' +
    'Otherwise the application infers them from the job ad\'s remote work and pay fields; when unknown, they take the neutral value with a flag.',
  'core.consignes.bloquants': 'List in "bloquants" the ids of the rules that apply to the job ad (active rules: {liste}).',
  'core.consignes.technique':
    'Technical criterion: compare the skills asked for with the inventory (levels fort / moyen / leger / zero = strong / medium / light / none) and list the gaps in the justification and in "ecarts".',
  'core.consignes.exemples': 'Calibrate your sub-scores on the grid\'s reference examples. Also fill in "colle" (what matches), "ecarts" (gaps) and "lu" (read).',
  'core.consignes.seuil': '"Worth a look" threshold: {seuil}. List for the user the job ads scored above it, with the breakdown.',
  'core.ingest.boite': 'Inbox not found: {dossier}',
  'core.ingest.revue': 'Seen again on {date} in a {source} alert: status unchanged',
  'core.ingest.sansJsonLd': 'No JSON-LD JobPosting on the page',
  'core.ingest.lectureImpossible': 'could not read the page: {message}',
  'core.ingest.employeurRefuse': 'employer refused: {motif}',
  'core.ingest.intituleExclu': 'title excluded: {motif}',
  'core.ingest.email': 'e-mail: {sujet}',
  'core.ingest.toujoursPresent': 'file still present after deletion',
  'core.ingest.nonSupprime': 'e-mail read but not deleted: {message}',
  'core.acces.cheminCache': 'Path refused: {chemin} (no ".." and no hidden file or folder)',
  'core.acces.data': "Access denied: {chemin} (data/ holds the database; use the application's tools)",
  'core.acces.horsEspace': 'Path outside the workspace refused: {chemin} (expected a path relative to the workspace)',
  'core.acces.sort': 'Access denied: {chemin} (leads outside the workspace)',
  'core.acces.dossierIntrouvable': 'Folder not found: {chemin}',
  'core.acces.pasUnDossier': 'Not a folder: {chemin}',
  'core.acces.estUnDossier': '{chemin} is a folder: use lister_fichiers',
  'core.acces.tropGrosTexte': 'File too large to read in one go: {chemin} ({taille} bytes)',
  'core.acces.tropGros': 'File too large: {chemin} ({taille} bytes)',
  'core.acces.extension': 'Extension not allowed for writing: {ext} (allowed: {liste})',
  'core.acces.sansExtension': '(none)',
  'core.acces.tropLong': 'Content too long',
  'core.acces.existe': '{chemin} already exists (creer_seulement): choose another name (suffix "V2") or replace it knowingly',
  'core.acces.deplacerFichier': 'Only files can be moved: {chemin}',
  'core.acces.destination': 'The destination already exists: {chemin} (nothing is overwritten)',
  'core.cv.introuvable': 'CV not found: {chemin}',
  'core.cv.gabaritIncomplet': 'Incomplete template: {chemin} is missing',
  'core.cv.gabaritInconnu': 'Unknown template: {nom} (available: {liste})',
  'core.pages.pdfVide': 'Empty PDF',
  'core.pages.sautMalPlace':
    'Page {page} is only {pc}% full although another page follows: badly placed page break (unbreakable block too high, forced break); tighten or move content to fill the page.',
  'core.pages.derniereVide':
    'Last page ({page}) is {pc}% full: a lot of empty space; add true content that is useful for the job ad, or condense to fit on one page fewer.',
  'core.pages.derniereRemarque':
    'Note: last page ({page}) is {pc}% full, leaving about {vide}% of the page empty; acceptable, but there is room for something useful for the job ad if anything is missing.',
  'core.pages.pourcent': '{pc}%',
  'core.config.nonConfigure':
    'Data folder not configured: set POSTULER_JUSTE_DATA, pass --data <folder> or create {fichier} with "dossierDonnees" (see postuler-juste.config.example.json).',
  'core.config.introuvable': 'Configuration file not found: {chemin}',
  'core.config.langue': 'Unknown language: {langue} ({langues}; POSTULER_JUSTE_LANGUE or "langue" in {fichier})',

  'commun.offres': p('{n} offer', '{n} offers'),
};
