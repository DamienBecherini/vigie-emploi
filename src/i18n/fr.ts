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
  init <dossier> [--port 4410] [--nom-mcp vigie-emploi] [--gabarit sobre|moderne|compact] [--langue fr|en]
                        Crée un espace de travail (modèle, gabarit de CV, grille d'exemple, config, .mcp.json)
                        et affiche le prompt de démarrage à donner à l'IA ; --langue : langue de l'interface,
                        de la CLI et du suivi (fr par défaut)
  compter <fichier>     Nombre de caractères de chaque message à copier-coller du fichier (blocs entre
                        « ──── début … » et « ──── fin … »), ou du fichier entier s'il n'en a pas
  gabarits              Gabarits de CV livrés (sobre, moderne, compact…)
  gabarit <nom>         Installe ce gabarit dans cv/gabarit de l'espace (l'ancien est gardé à côté)
  cv <cv.md>… [--gabarit <dossier>] [--capture]
                        CV Markdown -> PDF A4 à côté du .md, avec le nombre de pages (cible : 2).
                        Gabarit : --gabarit, sinon cv/gabarit/ de l'espace, sinon celui de l'application ;
                        --capture : image PNG du rendu dans <gabarit>/apercu/ (contrôle visuel)
  ingest [--keep] [--no-fetch] [--emails <dossier>]
                        Lit les .eml de la boîte de réception, ajoute les nouvelles offres,
                        puis supprime les e-mails traités (sauf --keep)
  import-historique     Reprend candidatures/_lots/*.json, _ecartees.md et _SUIVI.md s'ils existent (idempotent)
  list [filtres]        Liste paginée des offres
      --statut a,b  --note-min N  --note-max N  --sans-note  --source s1,s2  --tag t
      --depuis AAAA-MM-JJ  --jusqua AAAA-MM-JJ (date de réception)  --texte "mots"
      --contrat CDI  --teletravail remote  --candidatures  --page N  --taille N
      --tri note|recue_le|publiee_le|titre|entreprise|…  --ordre asc|desc
      --tri recue_le:desc,note:desc  (plusieurs niveaux : date, puis note à date égale)
  show <id>             Détail d'une offre (notes, statuts, tags, candidature)
  a-lire [--limite N] [--complet]
                        Offres à traiter sans note, avec l'URL à lire (ou la description déjà extraite)
  noter <id> --json '{"criteres": {"technique": {"note": 8, "justification": "…"}, …}, "entrees": {…}, "bloquants": [], "colle": "…"}'
  noter --fichier lot.json [--essai]
                        Enregistre des notes (format des lots). Avec « criteres », la note est calculée avec la
                        grille (voir « grille ») ; sans, c'est une note globale (ancienne grille).
                        --essai : calcule et affiche sans rien enregistrer
  grille [--consignes] [--json]
                        Grille de notation courante : critères, poids, barèmes, règles, inventaire, exemples
  grille --historique | --version N | --restaurer N [--resume "…"] | --init
  grille --modifier '{"poids": {"technique": 40}, …}' --resume "…" [--essai]
                        Changement partiel (poids, seuil, baremes, regles, inventaire) ; recalcule les notes
  renoter               Recalcule toutes les notes à critères avec la grille courante
  statut <id> <statut> [--commentaire "…"]
                        Statuts : {statuses}
  tag <id> +ajout -retrait
  lien <id> <url|->       Enregistre (ou efface avec -) le lien de l'offre
  candidater <id>       Passe l'offre en « go » et affiche tout ce qu'il faut pour préparer la candidature
  candidature <id> [--dossier d] [--cv f] [--canal c] [--envoyee-le JJ/MM/AAAA] [--message m]
                   [--prochaine-action "…"]
                        Enregistre la candidature (option vide "" pour effacer un champ) ;
                        avec --envoyee-le, l'offre passe en « envoyee »
  prochaine-action <id> "texte"
                        Prochaine action de la candidature ("" ou - pour l'effacer)
  evenement <id> --type {types} [--le "JJ/MM/AAAA HH:MM"] --resume "…"
                   [--sens envoye|recu] [--canal c] [--interlocuteurs "…"] [--details "…"]
                   [--montant 3000 --unite "€ HT"] [--jours 6] [--fichier candidatures/x/devis.md]…
                   [--fait | --no-fait]
                        Ajoute un événement au journal de la candidature ; daté dans le futur (et pas fait),
                        c'est une échéance. --le par défaut : maintenant ; « demain », « +3 » acceptés
  journal <id>          Journal de la candidature (échéances d'abord, puis du plus récent au plus ancien)
  echeances [--jours 7] Échéances en retard et à venir sur N jours
  fait <evenement_id> [--no-fait]
                        Marque une échéance comme faite (--no-fait : la rouvrir)
  fichiers <id>         Fichiers du dossier de candidature (chemins à citer dans --fichier)
  stats                 Candidatures par étape (envoyée, réponse, entretien, proposition), délai de réponse
  generer-suivi [--sortie <fichier>] [--remplacer]
                        Génère le suivi des candidatures depuis la base : par défaut
                        candidatures/_SUIVI.genere.md (aperçu) ; --remplacer écrit candidatures/_SUIVI.md
  serve [--port 4410] [--inactivite <minutes>]
                        Lance le tableau de bord (http://localhost:4410) ; --inactivite : s'arrête seul après ce temps sans visite
  mcp                   Serveur MCP (transport stdio) pour piloter vigie-emploi depuis une IA ; sans dossier
                        configuré : ~/ma-recherche, créé au besoin par l'outil initialiser_espace

Options générales
  --data <dossier>      Dossier de données (sinon VIGIE_EMPLOI_DATA ou vigie-emploi.config.json)
  --config <fichier>    Fichier de configuration
  --json                Sortie JSON (toutes les commandes)

Langue : clé « langue » de vigie-emploi.config.json (fr ou en) ou variable VIGIE_EMPLOI_LANGUAGE.
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
  'cli.ingest.suite': 'Suite : vigie-emploi a-lire',

  // CLI : import-historique
  'cli.import.batches': 'Lots : {files} fichier(s), {inputs} entrée(s), {offers} offre(s) créée(s), {scores} note(s).',
  'cli.import.register':
    'Registre : {lines} ligne(s), {offers} offre(s) dont {created} créée(s) ({withoutLink} sans lien), {statuses} statut(s), {scores} note(s), {corrected} entreprise(s) corrigée(s).',
  'cli.import.trackerIgnore': 'Suivi : non relu ({reason}).',
  'cli.import.tracker': 'Suivi : {lines} ligne(s), {offers} offre(s) créée(s), {applications} candidature(s), {statuses} statut(s).',
  'cli.import.journals':
    'Journaux : {folders} dossier(s), {lines} ligne(s) datée(s), {created} événement(s) créé(s), {existing} déjà en base, {removed} retiré(s), {deadlines} échéance(s) ; types : {types}.',
  'cli.import.attached': "  dossier rattaché à l'offre #{offer} : {folder}",
  'cli.import.withoutOffer': '  dossier sans offre en base : {folder}',
  'cli.import.withoutTracker': '  dossier sans suivi daté : {folder}',
  'cli.import.untyped': 'Lignes de journal non typées, reprises en note ({n}) :',
  'cli.import.withoutDate': 'Lignes de journal sans date, non reprises ({n}) :',
  'cli.import.merge': '  doublon fusionné : #{duplicate} → #{offer} ({company})',
  'cli.import.unrecognized': 'Lignes non reconnues ({n}) :',
  'cli.import.linksNotRecognized': 'Liens non reconnus ({n}) :',

  // CLI : list, a-lire, noter
  'cli.list.headers': 'id|note|statut|source|reçue|entreprise|titre',
  'cli.list.footer': 'Page {page}/{pages} · {total} offre(s)',
  'cli.toRead.none': 'Aucune offre à lire.',
  'cli.toRead.description': 'description extraite',
  'cli.toRead.browser': 'à lire dans le navigateur',
  'cli.toRead.human': 'page protégée : demander le texte',
  'cli.toRead.withoutUrl': '(sans URL)',
  'cli.toRead.total': '{n} offre(s) à traiter. Détail JSON (descriptions comprises) : vigie-emploi a-lire --json',
  'cli.score.expected': "noter : --json '{...}' ou --fichier lot.json attendu",
  'cli.score.oneSingle': 'noter <id> : une seule note attendue',

  // CLI : grille
  'cli.rubric.copied': "Grille d'exemple copiée dans {path} (version 1) : à adapter.",
  'cli.rubric.exists': 'Une grille existe déjà : {path}',
  'cli.rubric.version': 'Version {version} : {summary}',
  'cli.rubric.summaryExpected': 'grille --modifier : --resume "…" attendu (ou --essai pour un aperçu)',
  'cli.grille.jsonInvalide': 'grille --modifier : JSON invalide ({message})',
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
  'cli.application.option': 'candidature : au moins une option attendue (--dossier, --canal…)',
  'cli.nextAction.expected': 'prochaine-action : texte attendu ("" ou - pour effacer)',
  'cli.nextAction.none': '(aucune prochaine action)',

  // CLI: events and deadlines
  'cli.event.typeExpected': 'evenement : --type attendu ({types})',
  'cli.event.summaryExpected': 'evenement : --resume "…" attendu',
  'cli.event.added': "Événement #{id} ajouté à l'offre #{offer} : {at} {type}{deadline} — {summary}",
  'cli.event.deadline': ' (échéance)',
  'cli.deadlines.offer': 'offre #{id}',
  'cli.deadlines.overdue': 'En retard ({n}) :',
  'cli.deadlines.upcoming': "À venir jusqu'au {date} ({n}) :",
  'cli.done.done': 'Événement #{id} fait : {summary}',
  'cli.done.reopened': 'Événement #{id} rouvert (à faire) : {summary}',

  // CLI : fichiers, stats, suivi
  'cli.files.withoutFolder': '#{id} : pas de dossier de candidature (vigie-emploi candidature {id} --dossier candidatures/…)',
  'cli.files.absent': '#{id} : dossier {folder} absent du dossier de données',
  'cli.files.title': '{folder} ({n} fichier(s)) :',
  'cli.files.ko': 'Ko',
  'cli.stats.steps': 'Envoyées : {sent} · réponse : {replies} · entretien : {interviews} · proposition : {proposals}',
  'cli.stats.notEnough': 'Délai avant première réponse : pas assez de données datées.',
  'cli.stats.timeout': 'Délai moyen avant la première réponse : {days} j (sur {n} candidature(s)).',
  'cli.tracker.summary': '{file} : {inProgress} en cours, {noFollowUp} envoyée(s) sans suite, {closes} close(s).',

  // CLI : init
  'cli.init.usage': 'Usage : vigie-emploi init <dossier> [--port 4410] [--nom-mcp vigie-emploi] [--langue fr|en]',
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
  'cli.count.usage': 'Usage : vigie-emploi compter <fichier>',
  'cli.count.line': '{characters} caractères  {words} mots  « {start}… »',
  'cli.templates.choose': "Choisir : vigie-emploi gabarit <nom> (depuis l'espace de travail ; l'ancien gabarit est gardé à côté).",
  'cli.template.usage': 'Usage : vigie-emploi gabarit <nom> (liste : vigie-emploi gabarits)',
  'cli.template.installed': 'Gabarit « {name} » installé dans {folder}{old}.',
  'cli.template.old': ' (ancien gabarit gardé dans {folder})',
  'cli.template.regenerate': 'Régénérer les CV pour voir le résultat : vigie-emploi cv "cv/<nom>.md" --capture',
  'cli.cv.usage': 'Usage : vigie-emploi cv <cv.md>… [--gabarit <dossier>] [--capture]',
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
    '> (tableau de bord, CLI ou outils MCP), puis `vigie-emploi generer-suivi`. Une ligne par offre ; le détail est dans le dossier de chaque offre.',
  'tracker.inProgress': 'En cours',
  'tracker.noFollowUp': 'Envoyées sans suite',
  'tracker.closes': 'Closes',
  'tracker.headers': '| Offre | Type | Canal | Envoyé | Statut | Prochaine action | Dossier |',
  'tracker.headersCloses': '| Offre | Issue |',
  'tracker.estimations': "Les dates « ≈ » sont des estimations, pas une trace d'envoi. Les corriger si tu retrouves la vraie date.",
  'tracker.footer':
    'Offres vues, écartées ou mises de côté : dans la base (tableau de bord `vigie-emploi serve`, ou `vigie-emploi list --statut ecartee`).',
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
  'core.filesList': 'fichiers : liste de chemins attendue',
  'core.typeEventUnknown': "Type d'événement inconnu : {type} ({types})",
  'core.directionUnknown': 'Sens inconnu : {direction} (envoye ou recu)',
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
    'Note à critères sans grille de notation : créer profil/grille.json dans le dossier de données (vigie-emploi grille --init)',
  'core.scoreIgnored': 'Champ « note » ({score}) ignoré : note calculée avec la grille v{version} = {calculee}',
  'core.rawScoreIgnored': 'Champ « note_brute » ignoré : remplacé par la moyenne pondérée',
  'core.batchUnreadable': 'Lot illisible : tableau JSON attendu',
  'core.noneScore': 'Aucune note à enregistrer',
  'core.step.reread': "Relire l'offre ({url}) et la note enregistrée",
  'core.step.instructions': 'Appliquer les consignes de candidature du dossier de données (CLAUDE.md, AGENTS.md ou équivalent)',
  'core.step.folder': "Créer le dossier {folder} avec l'annonce, le fit, les écarts et les messages",
  'core.step.save':
    'Enregistrer la candidature (dossier, CV, canal, prochaine action) : enregistrer_candidature ou vigie-emploi candidature {id} --dossier {folder}',
  'core.step.send': "Après l'envoi : enregistrer la date d'envoi (envoyee_le), l'offre passe en « envoyee »",
  'core.rubricUnreadable': 'Grille illisible ({path}) : {message}',
  'core.rubricObject': 'Grille illisible ({path}) : objet JSON attendu',
  'core.versionNotFound': 'Version {version} de la grille introuvable',
  'core.summaryChange': 'Résumé du changement attendu',
  'core.rubricModifiedFile': 'Modifiée dans le fichier grille.json',
  'core.rubricInitial': 'Version initiale (fichier grille.json)',
  'core.notOfRubric': 'Pas de grille de notation : créer {path} (modèle : exemples/grille.json, ou « vigie-emploi grille --init »)',
  'core.noneChange': 'Aucun changement par rapport à la version courante',
  'core.backVersion': 'Retour à la version {version}',
  'core.rubric.computationExpected': 'critère {id} : « calcul » attendu ({computations})',
  'core.rubric.computationReserved': 'critère {id} : « calcul » réservé aux critères calculés',
  'core.rubric.targetHigh': 'la cible haute doit dépasser le plancher',
  'core.rubric.targetHighFullRemote': 'la cible haute doit dépasser le plancher full remote',
  'core.rubric.targetLow': 'la cible basse dépasse la cible haute',
  'core.rubric.valueCap': 'règle {id} : « valeur » attendue pour un plafond',
  'core.rubric.criterionThreshold': 'règle {id} : « critere » et « seuil » attendus',
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
  'core.change.newRule': 'Nouvelle règle {id} : « libelle » et « effet » attendus',
  'core.change.ruleUnknown': 'Règle inconnue : {id}',
  'core.change.technologyMissing': "Technologie absente de l'inventaire : {technology}",
  'core.change.exampleAbsent': 'Exemple absent de la grille : {title} (exemples : {list})',
  'core.change.examplesHomonyms': "Plusieurs exemples s'intitulent « {title} » : préciser { titre, entreprise }",
  'core.instructions.scoreFinale':
    "Ne donne pas la note finale : l'application la calcule (moyenne pondérée, règles bloquantes, arrondi au demi-point). Un champ « note » fourni avec « criteres » est ignoré.",
  'core.instructions.criteria': 'Note de 0 à 10, avec une justification courte, chacun de ces critères (champ « criteres ») : {list}.',
  'core.instructions.computed': p('Ne note pas {list} : il est calculé depuis le barème. ', 'Ne note pas {list} : ils sont calculés depuis le barème. '),
  'core.instructions.inputs':
    'Remplis « entrees » quand l’offre les donne : jours_sur_site (0 = full remote, 5 = sur site), salaire_min / salaire_max en euros et unite (an, mois, jour, heure). ' +
    'Sinon l’application les déduit des champs télétravail et rémunération de l’offre ; inconnus, ils valent la valeur neutre avec un drapeau.',
  'core.instructions.blockers': "Signale dans « bloquants » les identifiants des règles qui s'appliquent à l'offre (actives : {list}).",
  'core.instructions.technique':
    'Critère technique : compare les compétences demandées à l’inventaire (niveaux fort / moyen / léger / zéro) et liste les écarts dans la justification et dans « ecarts ».',
  'core.instructions.examples': 'Cale tes sous-notes sur les exemples de référence de la grille. Remplis aussi « colle », « ecarts » et « lu ».',
  'core.instructions.threshold': 'Seuil « à regarder » : {threshold}. Liste à l’utilisateur les offres notées au-dessus, avec la décomposition.',
  'core.rubric.identifier': 'identifiant attendu : minuscules, chiffres, « - » ou « _ », 40 caractères au plus',
  'core.rubric.score10': 'note de 0 à 10',
  'core.rubric.sixValues': 'six valeurs attendues : 0 à 5 jours sur site',
  'core.rubric.afterChange': 'après changement',
  'core.penaltiesIgnored': 'Champ « penalites » ignoré : les règles bloquantes passent par « bloquants »',
  'core.import': 'apply (reprise après « {status} »)',
  'core.sentAt': 'envoyée le {date}',
  'core.ingest.box': 'Boîte de réception introuvable : {folder}',
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
  'core.access.isOneFolder': '{path} est un dossier : utiliser lister_fichiers',
  'core.access.tooBigText': "Fichier trop gros pour être lu d'un coup : {path} ({size} octets)",
  'core.access.tooBig': 'Fichier trop gros : {path} ({size} octets)',
  'core.access.extension': 'Extension non autorisée en écriture : {ext} (autorisées : {list})',
  'core.access.withoutExtension': '(aucune)',
  'core.access.tooLong': 'Contenu trop long',
  'core.access.exists': '{path} existe déjà (creer_seulement) : choisir un autre nom (suffixe « V2 ») ou remplacer en connaissance de cause',
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
    'Dossier de données non configuré : définir VIGIE_EMPLOI_DATA, passer --data <dossier> ou créer {file} avec "dossierDonnees" (voir vigie-emploi.config.example.json).',
  'core.config.notFound': 'Fichier de configuration introuvable : {path}',
  'core.config.language': 'Langue inconnue : {language} ({languages} ; VIGIE_EMPLOI_LANGUAGE ou "langue" de {file})',

  // Plural example (used by the tests of the mechanism)
  'common.offers': p('{n} offre', '{n} offres'),
} satisfies Record<string, MessageText>;

export type KeyServer = keyof typeof fr;
