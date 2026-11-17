// French texts of the CLI, the API, the generated tracker and the initialization (reference language).
// Every key added here must also be added to en.ts (otherwise the compilation fails).
import type { Plural, MessageText } from './tool.ts';

const p = (one: string, other: string): Plural => ({ one, other });

export const fr = {
  // ---------------------------------------------------------------------------------------------
  // CLI: help (command and option names are English identifiers in both languages)
  'cli.help': `vigie-emploi — offres, notes et candidatures (base SQLite locale)

Usage : vigie-emploi <commande> [options]

Commandes
  init [dossier] [--port 4410] [--mcp-name vigie-emploi] [--template plain|modern|compact] [--language fr|en]
                        Crée un espace de travail (~/vigie-emploi sans dossier donné ; modèle, gabarit de CV, grille d'exemple, config, .mcp.json)
                        et affiche le prompt de démarrage à donner à l'IA ; --language : langue de l'interface,
                        de la CLI et du suivi (fr par défaut)
  count <fichier>       Nombre de caractères de chaque message à copier-coller du fichier (blocs entre
                        « ──── début … » et « ──── fin … »), ou du fichier entier s'il n'en a pas
  templates             Gabarits de CV livrés (plain, modern, compact…)
  template <nom>        Installe ce gabarit dans cv/gabarit de l'espace (l'ancien est gardé à côté)
  cv <cv.md>… [--template <dossier>] [--capture]
                        CV Markdown -> PDF A4 à côté du .md, avec le nombre de pages (cible : 2).
                        Gabarit : --template, sinon cv/gabarit/ de l'espace, sinon celui de l'application ;
                        --capture : image PNG du rendu dans <gabarit>/apercu/ (contrôle visuel)
  ingest [--keep] [--no-fetch] [--no-mail] [--emails <dossier>]
                        Lit les .eml de la boîte de réception, ajoute les nouvelles offres,
                        puis supprime les e-mails traités (sauf --keep) ; relève d'abord la boîte mail si elle
                        est configurée (--no-mail : ne pas la relever)
  mail [setup|status|fetch|forget]
                        Boîte mail lue en IMAP (dossier où un filtre range les alertes d'offres) : setup
                        demande l'adresse, le mot de passe (gardé dans le trousseau du système, jamais dans
                        l'espace) et le dossier ; options --address, --host, --port, --insecure, --folder,
                        --since-days 14, --no-mark-seen, --password-stdin. fetch : relève sans ingérer
  import-history        Reprend candidatures/_lots/*.json, _ecartees.md et _SUIVI.md s'ils existent (idempotent)
  list [filtres]        Liste paginée des offres
      --status a,b  --score-min N  --score-max N  --unscored  --source s1,s2  --tag t
      --from AAAA-MM-JJ  --until AAAA-MM-JJ (date de réception)  --text "mots"
      --contract CDI  --remote remote  --applications  --page N  --size N
      --sort score|received_at|published_at|title|company|…  --order asc|desc
      --sort received_at:desc,score:desc  (plusieurs niveaux : date, puis note à date égale)
  show <id>             Détail d'une offre (notes, statuts, tags, candidature)
  to-read [--limit N] [--full]
                        Offres à traiter sans note, avec l'URL à lire (ou la description déjà extraite)
  score <id> --json '{"criteria": {"technique": {"score": 8, "justification": "…"}, …}, "inputs": {…}, "blockers": [], "fit": "…"}'
  score --file lot.json [--dry-run]
                        Enregistre des notes (format des lots). Avec « criteria », la note est calculée avec la
                        grille (voir « rubric ») ; sans, c'est une note globale (ancienne grille).
                        --dry-run : calcule et affiche sans rien enregistrer
  rubric [--instructions] [--json]
                        Grille de notation courante : critères, poids, barèmes, règles, inventaire, exemples
  rubric --history | --version N | --restore N [--summary "…"] | --init
  rubric --update '{"weight": {"technique": 40}, …}' --summary "…" [--dry-run]
                        Changement partiel (weight, threshold, scales, rules, inventory) ; recalcule les notes
  rescore               Recalcule toutes les notes à critères avec la grille courante
  status <id> <status> [--comment "…"]
                        Statuts : {statuses}
  tag <id> +ajout -retrait
  link <id> <url|->     Enregistre (ou efface avec -) le lien de l'offre
  apply <id>            Passe l'offre en « go » et affiche tout ce qu'il faut pour préparer la candidature
  application <id> [--folder d] [--cv f] [--channel c] [--sent-at JJ/MM/AAAA] [--message m]
                   [--next-action "…"]
                        Enregistre la candidature (option vide "" pour effacer un champ) ;
                        avec --sent-at, l'offre passe en « sent »
  next-action <id> "texte"
                        Prochaine action de la candidature ("" ou - pour l'effacer)
  event <id> --type {types} [--at "JJ/MM/AAAA HH:MM"] --summary "…"
                   [--direction sent|received] [--channel c] [--contacts "…"] [--details "…"]
                   [--amount 3000 --unit "€ HT"] [--days 6] [--file candidatures/x/devis.md]…
                   [--done | --no-done]
                        Ajoute un événement au journal de la candidature ; daté dans le futur (et pas fait),
                        c'est une échéance. --at par défaut : maintenant ; « demain », « +3 » acceptés
  journal <id>          Journal de la candidature (échéances d'abord, puis du plus récent au plus ancien)
  deadlines [--days 7]  Échéances en retard et à venir sur N jours
  done <event_id> [--no-done]
                        Marque une échéance comme faite (--no-done : la rouvrir)
  files <id>            Fichiers du dossier de candidature (chemins à citer dans --file)
  stats                 Candidatures par étape (envoyée, réponse, entretien, proposition), délai de réponse
  generate-tracker [--output <fichier>] [--replace]
                        Génère le suivi des candidatures depuis la base : par défaut
                        candidatures/_SUIVI.genere.md (aperçu) ; --replace écrit candidatures/_SUIVI.md
  serve [--port 4410] [--idle <minutes>]
                        Lance le tableau de bord (http://localhost:4410) ; --idle : s'arrête seul après ce temps sans visite
  mcp                   Serveur MCP (transport stdio) pour piloter vigie-emploi depuis une IA ; sans dossier
                        configuré : ~/vigie-emploi, créé au besoin par l'outil initialize_workspace

Options générales
  --data <dossier>      Dossier de données (sinon VIGIE_EMPLOI_DATA ou vigie-emploi.config.json)
  --config <fichier>    Fichier de configuration
  --json                Sortie JSON (toutes les commandes)

Langue : clé « language » de vigie-emploi.config.json (fr ou en) ou variable VIGIE_EMPLOI_LANGUAGE.
`,

  // CLI: general messages
  'cli.error': 'Erreur : {message}',
  'cli.commandUnknown': 'Commande inconnue : {command}',
  'cli.invalid': '{name} invalide : {value}',
  'cli.offerNotFound': 'Offre {id} introuvable',
  'cli.statusUnknown': 'Statut inconnu : {status}',
  'cli.statusExpected': 'Statut attendu parmi : {statuses}',
  'cli.none': 'aucun',

  // CLI: detail of an offer
  'cli.detail.status': 'Statut : {status} · Note : {score} · Source : {source} ({site_id})',
  'cli.detail.url': 'URL : {url}',
  'cli.detail.remote': 'télétravail : {value}',
  'cli.detail.dates': 'Reçue le {received} · publiée le {published}',
  'cli.detail.stack': 'Stack : {stack}',
  'cli.detail.tags': 'Tags : {tags}',
  'cli.detail.scoreRubric': 'Note {score} (grille v{version}, exacte {exact}) le {at}',
  'cli.detail.scoreOld': 'Note {score} (ancienne grille ; brute {raw}{penalties}) le {at}',
  'cli.detail.penalties': ', pénalités : {penalties}',
  'cli.detail.fit': 'Ce qui colle : {text}',
  'cli.detail.gaps': 'Écarts : {text}',
  'cli.detail.application': 'Candidature : {info}',
  'cli.detail.sentAt': 'envoyée le {date}',
  'cli.detail.nextAction': 'Prochaine action : {text}',
  'cli.detail.journal': 'Journal :',
  'cli.detail.history': 'Historique des statuts :',
  'cli.detail.description': 'Description :',

  // CLI: breakdown of a score and impact of a rubric change
  'cli.breakdown.neutral': '(neutre) ',
  'cli.breakdown.main': '(main) ',
  'cli.breakdown.average': 'Moyenne pondérée',
  'cli.breakdown.rule': 'Règle : {label} → {effect}{withoutEffect}',
  'cli.breakdown.cap': 'plafond {value}',
  'cli.breakdown.withoutEffect': ' (sans effet)',
  'cli.breakdown.ignored': 'Règle ignorée (inconnue ou désactivée) : {rule}',
  'cli.breakdown.score': 'Note : {exact} → {score}',
  'cli.impact.summary': '{recalculated} offre(s) à critères recalculée(s), {changed} changent de note.',
  'cli.impact.rising': 'Passent au-dessus du seuil {threshold} ({n}) :',
  'cli.impact.falling': 'Repassent sous le seuil {threshold} ({n}) :',

  // CLI : journal
  'cli.journal.overdue': 'EN RETARD',
  'cli.journal.toDo': 'à faire',
  'cli.journal.empty': '  (journal vide)',

  // CLI : ingest
  'cli.ingest.summary':
    "{files} e-mail(s), {offers} offre(s) : {added} nouvelle(s) ({withDescription} avec description, {toRead} à lire dans le navigateur), {duplicates} doublon(s), {dismissed} écartée(s) sur l'intitulé.",
  'cli.ingest.kept': 'E-mails conservés (--keep).',
  'cli.ingest.deleted': '{n} e-mail(s) supprimé(s).',
  'cli.ingest.dismissed': '  écartée #{id} {title} ({pattern})',
  'cli.ingest.error': '  erreur {file} : {message}',
  'cli.ingest.withoutOffer': '  aucune offre reconnue, e-mail conservé : {file}',
  'cli.ingest.acknowledgment': '  accusé de candidature (pas une alerte) : {subject}{suite}',
  'cli.ingest.offerMissing': ' → offre absente de la base',
  'cli.ingest.suite': 'Suite : vigie-emploi to-read',
  'cli.ingest.mail': 'Boîte mail : {n} e-mail(s) relevé(s) dans « {folder} ».',
  'cli.ingest.mailMore': 'Boîte mail : d’autres messages attendent, ils viendront à la prochaine ingestion.',
  'cli.ingest.mailError': 'Boîte mail non relevée : {message}',
  'cli.mail.notTty': 'Saisie du mot de passe impossible hors d’un terminal : utilisez --password-stdin.',
  'cli.mail.cancelled': 'Annulé.',
  'cli.mail.noConfigFile': 'Pas de fichier vigie-emploi.config.json : créez d’abord l’espace (vigie-emploi init).',
  'cli.mail.askAddress': 'Adresse e-mail :',
  'cli.mail.addressRequired': 'Adresse e-mail obligatoire (--address).',
  'cli.mail.oauth':
    '{name} n’accepte plus les mots de passe en IMAP (connexion Microsoft obligatoire), ce n’est pas encore géré. En attendant : transférez vos alertes vers une autre boîte, ou déposez les e-mails dans emails/.',
  'cli.mail.askHost': 'Serveur IMAP (ex. imap.exemple.fr) :',
  'cli.mail.hostRequired': 'Serveur IMAP obligatoire (--host).',
  'cli.mail.provider': '{name} : {host}, port {port}.',
  'cli.mail.appPassword':
    '{name} demande un « mot de passe d’application » (16 caractères), pas le mot de passe du compte. Il se crée ici, la validation en deux étapes doit être active : {help}',
  'cli.mail.askPassword': 'Mot de passe (rien ne s’affiche pendant la frappe) :',
  'cli.mail.passwordRequired': 'Mot de passe vide.',
  'cli.mail.folders': 'Dossiers de la boîte :',
  'cli.mail.askFolder': 'Dossier des alertes (numéro ou nom) :',
  'cli.mail.folderRequired': 'Dossier obligatoire (--folder).',
  'cli.mail.folderUnknown': 'Dossier « {folder} » absent de la boîte. Dossiers : {folders}',
  'cli.mail.saved':
    'Boîte enregistrée : dossier « {folder} » relevé à chaque ingestion (réglages dans {file}, mot de passe : {backend}). Pensez au filtre de votre messagerie qui range les alertes d’offres dans ce dossier.',
  'cli.mail.notConfigured': 'Aucune boîte mail configurée (vigie-emploi mail setup).',
  'cli.mail.status': 'Boîte : {user} sur {host}:{port}, dossier « {folder} »\nMot de passe : {password}\nDernière relève : {fetched}',
  'cli.mail.passwordYes': 'enregistré ({backend})',
  'cli.mail.passwordNo': 'absent (vigie-emploi mail setup)',
  'cli.mail.never': 'jamais',
  'cli.mail.fetched': '{n} e-mail(s) relevé(s) dans « {folder} », déposé(s) dans {inbox}. Suite : vigie-emploi ingest',
  'cli.mail.more': 'D’autres messages attendent : relancez la relève.',
  'cli.mail.forgotten': 'Boîte mail oubliée : réglages et mot de passe supprimés (les messages restent dans la boîte).',
  'cli.mail.subUnknown': 'Sous-commande inconnue « {sub} » : setup, status, fetch ou forget.',

  // CLI : import-history
  'cli.import.batches': 'Lots : {files} fichier(s), {inputs} entrée(s), {offers} offre(s) créée(s), {scores} note(s).',
  'cli.import.register':
    'Registre : {lines} ligne(s), {offers} offre(s) dont {created} créée(s) ({withoutLink} sans lien), {statuses} statut(s), {scores} note(s), {corrected} entreprise(s) corrigée(s).',
  'cli.import.trackerIgnore': 'Suivi : non relu ({reason}).',
  'cli.import.tracker': 'Suivi : {lines} ligne(s), {offers} offre(s) créée(s), {applications} candidature(s), {statuses} statut(s).',
  'cli.import.journals':
    'Journaux : {folders} dossier(s), {lines} ligne(s) datée(s), {created} événement(s) créé(s), {existing} déjà en base, {duplicate} déjà saisi(s) à la main, {removed} retiré(s), {deadlines} échéance(s) ; types : {types}.',
  'cli.import.attached': "  dossier rattaché à l'offre #{offer} : {folder}",
  'cli.import.withoutOffer': '  dossier sans offre en base : {folder}',
  'cli.import.withoutTracker': '  dossier sans suivi daté : {folder}',
  'cli.import.untyped': 'Lignes de journal non typées, reprises en note ({n}) :',
  'cli.import.withoutDate': 'Lignes de journal sans date, non reprises ({n}) :',
  'cli.import.merge': '  doublon fusionné : #{duplicate} → #{offer} ({company})',
  'cli.import.unrecognized': 'Lignes non reconnues ({n}) :',
  'cli.import.linksNotRecognized': 'Liens non reconnus ({n}) :',

  // CLI : list, to-read, score
  'cli.list.headers': 'id|note|statut|source|reçue|entreprise|titre',
  'cli.list.footer': 'Page {page}/{pages} · {total} offre(s)',
  'cli.toRead.none': 'Aucune offre à lire.',
  'cli.toRead.description': 'description extraite',
  'cli.toRead.browser': 'à lire dans le navigateur',
  'cli.toRead.human': 'page protégée : demander le texte',
  'cli.toRead.withoutUrl': '(sans URL)',
  'cli.toRead.total': '{n} offre(s) à traiter. Détail JSON (descriptions comprises) : vigie-emploi to-read --json',
  'cli.score.expected': "score : --json '{...}' ou --file lot.json attendu",
  'cli.score.oneSingle': 'score <id> : une seule note attendue',

  // CLI : grille
  'cli.rubric.copied': "Grille d'exemple copiée dans {path} (version 1) : à adapter.",
  'cli.rubric.exists': 'Une grille existe déjà : {path}',
  'cli.rubric.version': 'Version {version} : {summary}',
  'cli.rubric.summaryExpected': 'rubric --update : --summary "…" attendu (ou --dry-run pour un aperçu)',
  'cli.rubric.jsonInvalid': 'rubric --update : JSON invalide ({message})',
  'cli.rubric.saved': 'Version {version} enregistrée.',
  'cli.rubric.dry_run': 'Essai : rien n’est enregistré.',
  'cli.rubric.title': '{name} — version {version} du {at} ({author}) : {summary}',
  'cli.rubric.file': 'Fichier : {path} · seuil « à regarder » : {threshold}',
  'cli.rubric.criteria': 'Critères (poids normalisés) :',
  'cli.rubric.ai': 'IA',
  'cli.rubric.computation': 'calcul',
  'cli.rubric.remote': 'Télétravail (0 à 5 j sur site) : {days} ; inconnu {unknown}',
  'cli.rubric.compensation':
    'Rémunération ({reference}) : salaire plancher {floor}, cible {low}-{high} K€ ; TJM plancher {daily_rate}{fullRemote}, cible {tjmLow}-{tjmHigh} € ; inconnue {unknown}',
  'cli.rubric.fullRemote': ' ({value} en full remote)',
  'cli.rubric.rules': 'Règles bloquantes :',
  'cli.rubric.inventory': 'Inventaire :',
  'cli.rubric.examples': 'Exemples de référence :',
  'cli.rubric.instructions': "Consignes pour l'IA :",
  'cli.rescore': 'Grille v{version}.',

  // CLI : statut, tag, lien, candidature
  'cli.tag.prefix': 'tag : préfixer chaque tag par + ou - ({tags})',
  'cli.tag.none': '(aucun tag)',
  'cli.link.expected': 'lien : URL attendue (ou - pour effacer)',
  'cli.link.none': '(aucun lien)',
  'cli.apply.folder': 'Dossier suggéré : {folder}',
  'cli.application.option': 'application : au moins une option attendue (--folder, --channel…)',
  'cli.nextAction.expected': 'next-action : texte attendu ("" ou - pour effacer)',
  'cli.nextAction.none': '(aucune prochaine action)',

  // CLI: events and deadlines
  'cli.event.typeExpected': 'event : --type attendu ({types})',
  'cli.event.summaryExpected': 'event : --summary "…" attendu',
  'cli.event.added': "Événement #{id} ajouté à l'offre #{offer} : {at} {type}{deadline} — {summary}",
  'cli.event.deadline': ' (échéance)',
  'cli.deadlines.offer': 'offre #{id}',
  'cli.deadlines.overdue': 'En retard ({n}) :',
  'cli.deadlines.upcoming': "À venir jusqu'au {date} ({n}) :",
  'cli.done.done': 'Événement #{id} fait : {summary}',
  'cli.done.reopened': 'Événement #{id} rouvert (à faire) : {summary}',

  // CLI : fichiers, stats, suivi
  'cli.files.withoutFolder': '#{id} : pas de dossier de candidature (vigie-emploi application {id} --folder candidatures/…)',
  'cli.files.absent': '#{id} : dossier {folder} absent du dossier de données',
  'cli.files.title': '{folder} ({n} fichier(s)) :',
  'cli.files.ko': 'Ko',
  'cli.stats.steps': 'Envoyées : {sent} · réponse : {replies} · entretien : {interviews} · proposition : {proposals}',
  'cli.stats.notEnough': 'Délai avant première réponse : pas assez de données datées.',
  'cli.stats.timeout': 'Délai moyen avant la première réponse : {days} j (sur {n} candidature(s)).',
  'cli.tracker.summary': '{file} : {inProgress} en cours, {noFollowUp} envoyée(s) sans suite, {closes} close(s).',

  // CLI : init
  'cli.init.usage': 'Usage : vigie-emploi init [dossier, ~/vigie-emploi par défaut] [--port 4410] [--mcp-name vigie-emploi] [--language fr|en]',
  'cli.init.created': 'Espace de travail créé : {folder}',
  'cli.init.config': '  configuration : {config} (port {port}, langue {language})',
  'cli.init.mcp': '  serveur MCP « {name} » : {mcp}',
  'cli.init.browser': '  navigateur pour les PDF : {browser}',
  'cli.init.command': "Commande de l'application, depuis l'espace : {command}",
  'cli.init.steps': 'Étapes suivantes :',
  'cli.init.step1': "  1. Dépose ton CV et l'export PDF de ton profil LinkedIn dans {folder}/a-deposer/",
  'cli.init.step2': '  2. Ouvre ton IA dans {folder} (Claude Code : cd dans le dossier puis « claude », et accepte le serveur MCP)',
  'cli.init.step3': '  3. Colle-lui ce prompt :',

  // CLI : compter, gabarits, cv
  'cli.count.usage': 'Usage : vigie-emploi count <fichier>',
  'cli.count.line': '{characters} caractères  {words} mots  « {start}… »',
  'cli.templates.choose': "Choisir : vigie-emploi template <nom> (depuis l'espace de travail ; l'ancien gabarit est gardé à côté).",
  'cli.template.usage': 'Usage : vigie-emploi template <nom> (liste : vigie-emploi templates)',
  'cli.template.installed': 'Gabarit « {name} » installé dans {folder}{old}.',
  'cli.template.old': ' (ancien gabarit gardé dans {folder})',
  'cli.template.regenerate': 'Régénérer les CV pour voir le résultat : vigie-emploi cv "cv/<nom>.md" --capture',
  'cli.cv.usage': 'Usage : vigie-emploi cv <cv.md>… [--template <dossier>] [--capture]',
  'cli.cv.withoutBrowser': 'Aucun Chrome, Edge ou Chromium trouvé (indiquer son chemin dans VIGIE_EMPLOI_BROWSER)',
  'cli.cv.pages': 'page(s)',
  'cli.cv.exceeded': '  <-- DÉPASSE 2 PAGES',
  'cli.cv.fill': 'remplissage : {rate}',
  'cli.rubric.examplesBeforeAfter': 'Exemples de référence (avant → après) :',
  'cli.rubric.new': 'nouveau',

  // ---------------------------------------------------------------------------------------------
  // Serveur HTTP (tableau de bord)
  'server.started': 'Tableau de bord : http://localhost:{port}/  (données : {folder})',
  'server.stop': 'Ctrl+C pour arrêter.',
  'server.portUsed': 'Le port {port} est déjà utilisé : le tableau de bord tourne sans doute déjà sur http://localhost:{port}/',
  'server.otherPort': 'Sinon, choisissez un autre port : vigie-emploi serve --port {suivant}',
  'server.idle': 'Aucune activité depuis {minutes} min : arrêt du tableau de bord.',
  'api.hostRefused': 'Hôte refusé',
  'api.originRefused': 'Origine refusée',
  'api.actionUnknown': 'Action inconnue',
  'api.remoteMachine': 'Ouverture du dossier possible seulement sur la machine où tourne vigie-emploi',
  'api.withoutFolder': 'Pas de dossier de candidature pour cette offre',
  'api.openingImpossible': 'Impossible d’ouvrir le dossier ({program}) : {message}',
  'api.jsonExpected': 'Requête JSON attendue',
  'api.offerNotFound': 'Offre introuvable',
  'api.statusUnknown': 'Statut inconnu',
  'api.fieldText': 'Champ {field} : texte attendu',
  'api.pathBadlyEncode': 'Chemin mal encodé',
  'api.routeUnknown': 'Route inconnue',
  'api.notCompiled': 'Interface non compilée : lancer « npm run build » dans le dossier de vigie-emploi.',
  'api.withoutTerminal':
    'Pas de terminal configuré pour cette plateforme : ajouter "terminal" dans vigie-emploi.config.json, ou lancer « claude {prompt} » dans {folder}.',
  'api.terminalImpossible': "Impossible d'ouvrir le terminal ({program}) : {message}",

  // ---------------------------------------------------------------------------------------------
  // Generated tracker (_SUIVI.md)
  'tracker.title': '# Suivi des candidatures',
  'tracker.when': '{date} à {hour}',
  'tracker.warning1': '> **Fichier généré par vigie-emploi le {when} : ne pas éditer à la main.** Les changements se font dans la base',
  'tracker.warning2':
    '> (tableau de bord, CLI ou outils MCP), puis `vigie-emploi generate-tracker`. Une ligne par offre ; le détail est dans le dossier de chaque offre.',
  'tracker.inProgress': 'En cours',
  'tracker.noFollowUp': 'Envoyées sans suite',
  'tracker.closes': 'Closes',
  'tracker.headers': '| Offre | Type | Canal | Envoyé | Statut | Prochaine action | Dossier |',
  'tracker.headersCloses': '| Offre | Issue |',
  'tracker.estimations': "Les dates « ≈ » sont des estimations, pas une trace d'envoi. Les corriger si tu retrouves la vraie date.",
  'tracker.footer':
    'Offres vues, écartées ou mises de côté : dans la base (tableau de bord `vigie-emploi serve`, ou `vigie-emploi list --status dismissed`).',
  'tracker.toSend': '**À envoyer** — GO',
  'tracker.remote': 'télétravail {value}',
  'tracker.folder': 'dossier',
  'tracker.overdue': ' (en retard)',
  'tracker.hour': '{h} h {m}',

  // ---------------------------------------------------------------------------------------------
  // Initialisation d'un espace
  'init.prompt':
    "Tu vas m'aider dans ma recherche d'emploi. Mon espace de travail est {workspace}. Lis {workspace}/AGENTS.md puis {workspace}/DEMARRAGE.md, et suis le démarrage : vérifie d'abord de quels outils tu disposes, lis ce que j'ai déposé dans a-deposer/, puis pose-moi tes questions, quelques-unes à la fois.",
  'init.folderExpected': 'Dossier à créer attendu : vigie-emploi init <dossier>',
  'init.notOneFolder': "{folder} existe et n'est pas un dossier",
  'init.notEmpty': "Le dossier {folder} n'est pas vide : choisir un dossier neuf ou vide",
  'init.nameMcpInvalid': 'Nom de serveur MCP invalide : {name} (lettres, chiffres, - et _)',
  'init.templateUnknown': 'Gabarit inconnu : {template} (disponibles : {list})',
  'init.languageUnknown': 'Langue inconnue : {language} ({languages})',
  'init.npx':
    'Lancé par npx : le serveur MCP et les consignes utilisent « {command} » (version figée). Au premier lancement, npx la télécharge (connexion nécessaire), puis la garde en cache. Pour un chemin fixe, installer plutôt avec « npm install -g vigie-emploi » puis relancer init.',
  'init.notCompile': 'Tableau de bord non compilé : lancer « npm run build » dans {app} avant « vigie-emploi serve ».',
  'init.withoutBrowser':
    'Aucun Chrome, Edge ou Chromium trouvé : la génération des CV en PDF ne marchera pas. Installer Chrome ou Edge, ou indiquer le chemin du navigateur dans VIGIE_EMPLOI_BROWSER.',
  'init.scaffoldFrench': "Les consignes de l'IA (modèle de l'espace) sont en français pour l'instant ; leur version anglaise viendra plus tard.",

  // ---------------------------------------------------------------------------------------------
  // Core (src/core, ingestion, CV): errors and messages returned to the CLI, the API and the MCP server
  'core.or': ' ou ',
  'core.ni': ' ni ',
  'core.none': 'aucun',
  'core.noneFeminine': 'aucune',
  'core.cap': 'plafond {value}',
  'core.withoutUrl': 'sans URL',
  'core.dateFormat': 'Date invalide : « {text} » (JJ/MM/AAAA, JJ/MM/AAAA HH:MM ou AAAA-MM-JJ attendu)',
  'core.dateInvalid': 'Date invalide : « {text} »',
  'core.hourInvalid': 'Heure invalide : « {text} »',
  // Score flags: the saved message is in French (rubric.ts); these texts are used for the other languages.
  'flag.remoteUnknown': 'Télétravail inconnu (valeur neutre) : à vérifier',
  'flag.compensationUnknown': 'Rémunération inconnue (valeur neutre) : à demander',
  'flag.subFloor': 'Rémunération sous le plancher{value} : à signaler',
  'flag.criterionMissing': '{label} : pas de sous-note (valeur neutre 5)',
  'core.textExpected': '{name} : texte attendu',
  'core.numberExpected': '{name} : nombre attendu ({value})',
  'core.pathEmpty': 'Chemin de fichier vide',
  'core.pathAbsolute': 'Chemin absolu refusé : {path} (chemin relatif au dossier de données attendu)',
  'core.pathInvalid': 'Chemin invalide : {path}',
  'core.pathRefused': 'Chemin refusé : {path}',
  'core.filesList': 'files : liste de chemins attendue',
  'core.typeEventUnknown': "Type d'événement inconnu : {type} ({types})",
  'core.directionUnknown': 'Sens inconnu : {direction} (sent ou received)',
  'core.eventNotFound': 'Événement {id} introuvable',
  'core.daysInvalid': 'Nombre de jours invalide : {days}',
  'core.offerNotFound': 'Offre {id} introuvable',
  'core.summaryEvent': "Résumé de l'événement attendu",
  'core.accessRefused': 'Accès refusé : {path}',
  'core.fileNotFound': 'Fichier introuvable : {path}',
  'core.notOneFile': 'Pas un fichier : {path}',
  'core.notOneFolder': 'Pas un dossier : {path}',
  'core.linkInvalid': 'Lien invalide (http:// ou https:// attendu) : {link}',
  'core.statusUnknown': 'Statut inconnu : {status}',
  'core.scoreInvalid': 'Note invalide : {score}',
  'core.scoreScale': "Note hors de l'échelle 0-10 : {score}",
  'core.mergeImpossible': 'Fusion impossible : offre {target} ou {duplicate} introuvable',
  'core.inputWithoutId': 'Entrée sans "id" ni "url"',
  'core.withoutRubric':
    'Note à critères sans grille de notation : créer profil/grille.json dans le dossier de données (vigie-emploi rubric --init)',
  'core.scoreIgnored': 'Champ « score » ({score}) ignoré : note calculée avec la grille v{version} = {calculee}',
  'core.rawScoreIgnored': 'Champ « raw_score » ignoré : remplacé par la moyenne pondérée',
  'core.batchUnreadable': 'Lot illisible : tableau JSON attendu',
  'core.noneScore': 'Aucune note à enregistrer',
  'core.step.reread': "Relire l'offre ({url}) et la note enregistrée",
  'core.step.instructions': 'Appliquer les consignes de candidature du dossier de données (CLAUDE.md, AGENTS.md ou équivalent)',
  'core.step.folder': "Créer le dossier {folder} avec l'annonce, le fit, les écarts et les messages",
  'core.step.save':
    'Enregistrer la candidature (dossier, CV, canal, prochaine action) : save_application ou vigie-emploi application {id} --folder {folder}',
  'core.step.send': "Après l'envoi : enregistrer la date d'envoi (sent_at), l'offre passe en « sent »",
  'core.rubricUnreadable': 'Grille illisible ({path}) : {message}',
  'core.rubricObject': 'Grille illisible ({path}) : objet JSON attendu',
  'core.versionNotFound': 'Version {version} de la grille introuvable',
  'core.summaryChange': 'Résumé du changement attendu',
  'core.rubricModifiedFile': 'Modifiée dans le fichier grille.json',
  'core.rubricInitial': 'Version initiale (fichier grille.json)',
  'core.notOfRubric': 'Pas de grille de notation : créer {path} (modèle : examples/rubric.json, ou « vigie-emploi rubric --init »)',
  'core.noneChange': 'Aucun changement par rapport à la version courante',
  'core.backVersion': 'Retour à la version {version}',
  'core.rubric.computationExpected': 'critère {id} : « computation » attendu ({computations})',
  'core.rubric.computationReserved': 'critère {id} : « computation » réservé aux critères calculés',
  'core.rubric.targetHigh': 'la cible haute doit dépasser le plancher',
  'core.rubric.targetHighFullRemote': 'la cible haute doit dépasser le plancher full remote',
  'core.rubric.targetLow': 'la cible basse dépasse la cible haute',
  'core.rubric.valueCap': 'règle {id} : « value » attendue pour un plafond',
  'core.rubric.criterionThreshold': 'règle {id} : « criterion » et « threshold » attendus',
  'core.rubric.subScore': 'sous-note de 0 à 10 attendue : {value}',
  'core.rubric.criteriaMax': '{n} critères au plus',
  'core.rubric.criterionDouble': 'critère en double : {id}',
  'core.rubric.ruleDouble': 'règle en double : {id}',
  'core.rubric.scaleDouble': 'barème {computation} utilisé par deux critères',
  'core.rubric.oneWeight': 'au moins un critère doit avoir un poids',
  'core.rubric.exampleCriterion': 'exemple « {title} » : critère IA inconnu {criterion}',
  'core.rubric.exampleRule': 'exemple « {title} » : règle inconnue {rule}',
  'core.rubric.invalid': 'Grille invalide ({origin}) : {message}',
  'core.calc.paceUnknown': 'Rythme sur site inconnu : valeur neutre',
  'core.calc.fullRemote': 'Full remote',
  'core.calc.onsiteDays': '{n} j sur site par semaine',
  'core.calc.compensationUnknown': 'Rémunération non publiée : valeur neutre',
  'core.calc.unitSalary': ' K€/an',
  'core.calc.unitTjm': ' €/j',
  'core.calc.middle': 'milieu de la fourchette',
  'core.calc.subFloor': 'sous le plancher de {floor}',
  'core.calc.targetHigh': 'au niveau de la cible haute ({target}) ou au-delà',
  'core.calc.between': 'entre le plancher {floor} et la cible haute {target}',
  'core.calc.floorFullRemote': ' (plancher full remote)',
  'core.input.invalid': 'Note à critères invalide : {message}',
  'core.input.criterionUnknown': "Critère inconnu : {id} (critères notés par l'IA : {list})",
  'core.input.criterionComputed':
    "Le critère {id} est calculé par l'application : ne pas le noter, fournir plutôt {fields} si l'offre les donne",
  'core.input.ruleUnknown': 'Règle bloquante inconnue : {id} (règles : {list})',
  'core.change.invalid': 'Changement invalide : {message}',
  'core.change.criterionUnknownList': 'Critère inconnu : {id} (critères : {list})',
  'core.change.criterionUnknown': 'Critère inconnu : {id}',
  'core.change.newRule': 'Nouvelle règle {id} : « label » et « effect » attendus',
  'core.change.ruleUnknown': 'Règle inconnue : {id}',
  'core.change.technologyMissing': "Technologie absente de l'inventaire : {technology}",
  'core.change.exampleAbsent': 'Exemple absent de la grille : {title} (exemples : {list})',
  'core.change.examplesHomonyms': "Plusieurs exemples s'intitulent « {title} » : préciser { title, company }",
  'core.instructions.scoreFinale':
    "Ne donne pas la note finale : l'application la calcule (moyenne pondérée, règles bloquantes, arrondi au demi-point). Un champ « score » fourni avec « criteria » est ignoré.",
  'core.instructions.criteria': 'Note de 0 à 10, avec une justification courte, chacun de ces critères (champ « criteria ») : {list}.',
  'core.instructions.computed': p('Ne note pas {list} : il est calculé depuis le barème. ', 'Ne note pas {list} : ils sont calculés depuis le barème. '),
  'core.instructions.inputs':
    'Remplis « inputs » quand l’offre les donne : onsite_days (0 = full remote, 5 = sur site), salary_min / salary_max en euros et unit (year, month, day, hour). ' +
    'Sinon l’application les déduit des champs télétravail et rémunération de l’offre ; inconnus, ils valent la valeur neutre avec un drapeau.',
  'core.instructions.blockers': "Signale dans « blockers » les identifiants des règles qui s'appliquent à l'offre (actives : {list}).",
  'core.instructions.technique':
    'Critère technique : compare les compétences demandées à l’inventaire (niveaux strong / medium / light / zero) et liste les écarts dans la justification et dans « gaps ».',
  'core.instructions.examples': 'Cale tes sous-notes sur les exemples de référence de la grille. Remplis aussi « fit », « gaps » et « read ».',
  'core.instructions.threshold': 'Seuil « à regarder » : {threshold}. Liste à l’utilisateur les offres notées au-dessus, avec la décomposition.',
  'core.rubric.identifier': 'identifiant attendu : minuscules, chiffres, « - » ou « _ », 40 caractères au plus',
  'core.rubric.score10': 'note de 0 à 10',
  'core.rubric.sixValues': 'six valeurs attendues : 0 à 5 jours sur site',
  'core.rubric.afterChange': 'après changement',
  'core.penaltiesIgnored': 'Champ « penalties » ignoré : les règles bloquantes passent par « blockers »',
  'core.import': 'apply (reprise après « {status} »)',
  'core.sentAt': 'envoyée le {date}',
  'core.ingest.box': 'Boîte de réception introuvable : {folder}',
  'core.mail.error.no-password': 'aucun mot de passe enregistré pour cette boîte (réglages du tableau de bord, ou vigie-emploi mail setup).',
  'core.mail.error.authentication':
    'connexion refusée par {host} (adresse ou mot de passe). Gmail, Yahoo, iCloud : il faut un mot de passe d’application, pas celui du compte. Détail : {message}',
  'core.mail.error.folder': 'dossier « {folder} » introuvable dans la boîte (renommé ou supprimé ?). Détail : {message}',
  'core.mail.error.connection': 'serveur {host} injoignable (adresse du serveur, réseau). Détail : {message}',
  'core.mail.error.other': 'erreur IMAP : {message}',
  'core.mail.backend.environment': 'variable VIGIE_EMPLOI_MAIL_PASSWORD',
  'core.mail.backend.dpapi': 'chiffré pour votre session Windows',
  'core.mail.backend.keychain': 'trousseau macOS',
  'core.mail.backend.secret-service': 'trousseau du système',
  'core.mail.backend.file': 'fichier lisible par vous seul (pas de trousseau disponible)',
  'core.ingest.seen': 'Revue le {date} dans une alerte {source} : statut inchangé',
  'core.ingest.withoutJsonLd': 'JSON-LD JobPosting absent de la page',
  'core.ingest.readingImpossible': 'lecture impossible : {message}',
  'core.ingest.employerRefused': 'employeur refusé : {pattern}',
  'core.ingest.titleExcluded': 'intitulé exclu : {pattern}',
  'core.ingest.email': 'e-mail : {subject}',
  'core.ingest.alwaysPresent': 'fichier toujours présent après suppression',
  'core.ingest.notDeleted': 'e-mail lu mais non supprimé : {message}',
  'core.access.pathCache': 'Chemin refusé : {path} (ni « .. » ni fichier ou dossier caché)',
  'core.access.data': "Accès refusé : {path} (data/ contient la base ; passer par les outils de l'application)",
  'core.access.outWorkspace': "Chemin hors de l'espace refusé : {path} (chemin relatif à l'espace attendu)",
  'core.access.sort': "Accès refusé : {path} (sort de l'espace)",
  'core.access.folderNotFound': 'Dossier introuvable : {path}',
  'core.access.notOneFolder': 'Pas un dossier : {path}',
  'core.access.isOneFolder': '{path} est un dossier : utiliser list_files',
  'core.access.tooBigText': "Fichier trop gros pour être lu d'un coup : {path} ({size} octets)",
  'core.access.tooBig': 'Fichier trop gros : {path} ({size} octets)',
  'core.access.extension': 'Extension non autorisée en écriture : {ext} (autorisées : {list})',
  'core.access.withoutExtension': '(aucune)',
  'core.access.tooLong': 'Contenu trop long',
  'core.access.exists': '{path} existe déjà (create_only) : choisir un autre nom (suffixe « V2 ») ou remplacer en connaissance de cause',
  'core.access.moveFile': 'Seuls les fichiers se déplacent : {path}',
  'core.access.destination': "La destination existe déjà : {path} (rien n'est écrasé)",
  'core.cv.notFound': 'CV introuvable : {path}',
  'core.cv.templateIncomplete': 'Gabarit incomplet : {path} manquant',
  'core.cv.templateUnknown': 'Gabarit inconnu : {name} (disponibles : {list})',
  'core.pages.pdfEmpty': 'PDF vide',
  'core.pages.jumpBadlyPlaced':
    "Page {page} remplie à {pc} % seulement alors qu'une page suit : saut de page mal placé (bloc insécable trop haut, saut forcé) ; resserrer ou déplacer le contenu pour remplir la page.",
  'core.pages.lastEmpty':
    "Dernière page ({page}) remplie à {pc} % : beaucoup de vide ; étoffer avec du contenu vrai et utile à l'offre, ou condenser pour tenir en une page de moins.",
  'core.pages.lastRemark':
    "Remarque : dernière page ({page}) remplie à {pc} %, il reste environ {empty} % de page vide ; acceptable, mais de la place pour un élément utile à l'offre s'il en manque.",
  'core.pages.percent': '{pc} %',
  'core.config.notConfigure':
    'Dossier de données non configuré : définir VIGIE_EMPLOI_DATA, passer --data <dossier> ou créer {file} avec "dataDir" (voir vigie-emploi.config.example.json).',
  'core.config.notFound': 'Fichier de configuration introuvable : {path}',
  'core.config.language': 'Langue inconnue : {language} ({languages} ; VIGIE_EMPLOI_LANGUAGE ou "language" de {file})',

  // Plural example (used by the tests of the mechanism)
  'common.offers': p('{n} offre', '{n} offres'),
} satisfies Record<string, MessageText>;

export type KeyServer = keyof typeof fr;
