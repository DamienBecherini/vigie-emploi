// Textes français de la CLI, de l'API, du suivi généré et de l'initialisation (langue de référence).
// Toute clé ajoutée ici doit l'être aussi dans en.ts (sinon la compilation échoue).
import type { Pluriel, Texte } from './outil.ts';

const p = (one: string, other: string): Pluriel => ({ one, other });

export const fr = {
  // ---------------------------------------------------------------------------------------------
  // CLI : aide (les noms des commandes et des options restent en français dans les deux langues)
  'cli.aide': `postuler-juste — offres, notes et candidatures (base SQLite locale)

Usage : postuler-juste <commande> [options]

Commandes
  init <dossier> [--port 4410] [--nom-mcp postuler-juste] [--gabarit sobre|moderne|compact] [--langue fr|en]
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
                        Statuts : {statuts}
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
  mcp                   Serveur MCP (transport stdio) pour piloter postuler-juste depuis une IA ; sans dossier
                        configuré : ~/ma-recherche, créé au besoin par l'outil initialiser_espace

Options générales
  --data <dossier>      Dossier de données (sinon POSTULER_JUSTE_DATA ou postuler-juste.config.json)
  --config <fichier>    Fichier de configuration
  --json                Sortie JSON (toutes les commandes)

Langue : clé « langue » de postuler-juste.config.json (fr ou en) ou variable POSTULER_JUSTE_LANGUE.
`,

  // CLI : messages généraux
  'cli.erreur': 'Erreur : {message}',
  'cli.commandeInconnue': 'Commande inconnue : {commande}',
  'cli.invalide': '{nom} invalide : {valeur}',
  'cli.offreIntrouvable': 'Offre {id} introuvable',
  'cli.statutInconnu': 'Statut inconnu : {statut}',
  'cli.statutAttendu': 'Statut attendu parmi : {statuts}',
  'cli.aucun': 'aucun',

  // CLI : détail d'une offre
  'cli.detail.statut': 'Statut : {statut} · Note : {note} · Source : {source} ({id_site})',
  'cli.detail.url': 'URL : {url}',
  'cli.detail.teletravail': 'télétravail : {valeur}',
  'cli.detail.dates': 'Reçue le {recue} · publiée le {publiee}',
  'cli.detail.stack': 'Stack : {stack}',
  'cli.detail.tags': 'Tags : {tags}',
  'cli.detail.noteGrille': 'Note {note} (grille v{version}, exacte {exacte}) le {le}',
  'cli.detail.noteAncienne': 'Note {note} (ancienne grille ; brute {brute}{penalites}) le {le}',
  'cli.detail.penalites': ', pénalités : {penalites}',
  'cli.detail.colle': 'Ce qui colle : {texte}',
  'cli.detail.ecarts': 'Écarts : {texte}',
  'cli.detail.candidature': 'Candidature : {infos}',
  'cli.detail.envoyeeLe': 'envoyée le {date}',
  'cli.detail.prochaineAction': 'Prochaine action : {texte}',
  'cli.detail.journal': 'Journal :',
  'cli.detail.historique': 'Historique des statuts :',
  'cli.detail.description': 'Description :',

  // CLI : décomposition d'une note et impact d'un changement de grille
  'cli.decomp.neutre': '(neutre) ',
  'cli.decomp.main': '(main) ',
  'cli.decomp.moyenne': 'Moyenne pondérée',
  'cli.decomp.regle': 'Règle : {libelle} → {effet}{sansEffet}',
  'cli.decomp.plafond': 'plafond {valeur}',
  'cli.decomp.sansEffet': ' (sans effet)',
  'cli.decomp.ignoree': 'Règle ignorée (inconnue ou désactivée) : {regle}',
  'cli.decomp.note': 'Note : {exacte} → {note}',
  'cli.impact.resume': '{recalculees} offre(s) à critères recalculée(s), {changees} changent de note.',
  'cli.impact.montent': 'Passent au-dessus du seuil {seuil} ({n}) :',
  'cli.impact.descendent': 'Repassent sous le seuil {seuil} ({n}) :',

  // CLI : journal
  'cli.journal.enRetard': 'EN RETARD',
  'cli.journal.aFaire': 'à faire',
  'cli.journal.vide': '  (journal vide)',

  // CLI : ingest
  'cli.ingest.resume':
    "{fichiers} e-mail(s), {offres} offre(s) : {nouvelles} nouvelle(s) ({avecDescription} avec description, {aLire} à lire dans le navigateur), {doublons} doublon(s), {ecartees} écartée(s) sur l'intitulé.",
  'cli.ingest.conserves': 'E-mails conservés (--keep).',
  'cli.ingest.supprimes': '{n} e-mail(s) supprimé(s).',
  'cli.ingest.ecartee': '  écartée #{id} {titre} ({motif})',
  'cli.ingest.erreur': '  erreur {fichier} : {message}',
  'cli.ingest.sansOffre': '  aucune offre reconnue, e-mail conservé : {fichier}',
  'cli.ingest.accuse': '  accusé de candidature (pas une alerte) : {sujet}{suite}',
  'cli.ingest.offreAbsente': ' → offre absente de la base',
  'cli.ingest.suite': 'Suite : postuler-juste a-lire',

  // CLI : import-historique
  'cli.import.lots': 'Lots : {fichiers} fichier(s), {entrees} entrée(s), {offres} offre(s) créée(s), {notes} note(s).',
  'cli.import.registre':
    'Registre : {lignes} ligne(s), {offres} offre(s) dont {creees} créée(s) ({sansLien} sans lien), {statuts} statut(s), {notes} note(s), {corrigees} entreprise(s) corrigée(s).',
  'cli.import.suiviIgnore': 'Suivi : non relu ({raison}).',
  'cli.import.suivi': 'Suivi : {lignes} ligne(s), {offres} offre(s) créée(s), {candidatures} candidature(s), {statuts} statut(s).',
  'cli.import.journaux':
    'Journaux : {dossiers} dossier(s), {lignes} ligne(s) datée(s), {crees} événement(s) créé(s), {existants} déjà en base, {retires} retiré(s), {echeances} échéance(s) ; types : {types}.',
  'cli.import.rattache': "  dossier rattaché à l'offre #{offre} : {dossier}",
  'cli.import.sansOffre': '  dossier sans offre en base : {dossier}',
  'cli.import.sansSuivi': '  dossier sans suivi daté : {dossier}',
  'cli.import.nonTypees': 'Lignes de journal non typées, reprises en note ({n}) :',
  'cli.import.sansDate': 'Lignes de journal sans date, non reprises ({n}) :',
  'cli.import.fusion': '  doublon fusionné : #{doublon} → #{offre} ({entreprise})',
  'cli.import.nonReconnues': 'Lignes non reconnues ({n}) :',
  'cli.import.liensNonReconnus': 'Liens non reconnus ({n}) :',

  // CLI : list, a-lire, noter
  'cli.list.entetes': 'id|note|statut|source|reçue|entreprise|titre',
  'cli.list.pied': 'Page {page}/{pages} · {total} offre(s)',
  'cli.aLire.aucune': 'Aucune offre à lire.',
  'cli.aLire.description': 'description extraite',
  'cli.aLire.navigateur': 'à lire dans le navigateur',
  'cli.aLire.humain': 'page protégée : demander le texte',
  'cli.aLire.sansUrl': '(sans URL)',
  'cli.aLire.total': '{n} offre(s) à traiter. Détail JSON (descriptions comprises) : postuler-juste a-lire --json',
  'cli.noter.attendu': "noter : --json '{...}' ou --fichier lot.json attendu",
  'cli.noter.uneSeule': 'noter <id> : une seule note attendue',

  // CLI : grille
  'cli.grille.copiee': "Grille d'exemple copiée dans {chemin} (version 1) : à adapter.",
  'cli.grille.existe': 'Une grille existe déjà : {chemin}',
  'cli.grille.version': 'Version {version} : {resume}',
  'cli.grille.resumeAttendu': 'grille --modifier : --resume "…" attendu (ou --essai pour un aperçu)',
  'cli.grille.jsonInvalide': 'grille --modifier : JSON invalide ({message})',
  'cli.grille.enregistree': 'Version {version} enregistrée.',
  'cli.grille.essai': 'Essai : rien n’est enregistré.',
  'cli.grille.titre': '{nom} — version {version} du {le} ({auteur}) : {resume}',
  'cli.grille.fichier': 'Fichier : {chemin} · seuil « à regarder » : {seuil}',
  'cli.grille.criteres': 'Critères (poids normalisés) :',
  'cli.grille.ia': 'IA',
  'cli.grille.calcul': 'calcul',
  'cli.grille.teletravail': 'Télétravail (0 à 5 j sur site) : {jours} ; inconnu {inconnu}',
  'cli.grille.remuneration':
    'Rémunération ({reference}) : salaire plancher {plancher}, cible {basse}-{haute} K€ ; TJM plancher {tjm}{fullRemote}, cible {tjmBasse}-{tjmHaute} € ; inconnue {inconnue}',
  'cli.grille.fullRemote': ' ({valeur} en full remote)',
  'cli.grille.regles': 'Règles bloquantes :',
  'cli.grille.inventaire': 'Inventaire :',
  'cli.grille.exemples': 'Exemples de référence :',
  'cli.grille.consignes': "Consignes pour l'IA :",
  'cli.renoter': 'Grille v{version}.',

  // CLI : statut, tag, lien, candidature
  'cli.tag.prefixe': 'tag : préfixer chaque tag par + ou - ({tags})',
  'cli.tag.aucun': '(aucun tag)',
  'cli.lien.attendu': 'lien : URL attendue (ou - pour effacer)',
  'cli.lien.aucun': '(aucun lien)',
  'cli.candidater.dossier': 'Dossier suggéré : {dossier}',
  'cli.candidature.option': 'candidature : au moins une option attendue (--dossier, --canal…)',
  'cli.prochaineAction.attendu': 'prochaine-action : texte attendu ("" ou - pour effacer)',
  'cli.prochaineAction.aucune': '(aucune prochaine action)',

  // CLI : événements et échéances
  'cli.evenement.typeAttendu': 'evenement : --type attendu ({types})',
  'cli.evenement.resumeAttendu': 'evenement : --resume "…" attendu',
  'cli.evenement.ajoute': "Événement #{id} ajouté à l'offre #{offre} : {le} {type}{echeance} — {resume}",
  'cli.evenement.echeance': ' (échéance)',
  'cli.echeances.offre': 'offre #{id}',
  'cli.echeances.enRetard': 'En retard ({n}) :',
  'cli.echeances.aVenir': "À venir jusqu'au {date} ({n}) :",
  'cli.fait.fait': 'Événement #{id} fait : {resume}',
  'cli.fait.rouvert': 'Événement #{id} rouvert (à faire) : {resume}',

  // CLI : fichiers, stats, suivi
  'cli.fichiers.sansDossier': '#{id} : pas de dossier de candidature (postuler-juste candidature {id} --dossier candidatures/…)',
  'cli.fichiers.absent': '#{id} : dossier {dossier} absent du dossier de données',
  'cli.fichiers.titre': '{dossier} ({n} fichier(s)) :',
  'cli.fichiers.ko': 'Ko',
  'cli.stats.etapes': 'Envoyées : {envoyees} · réponse : {reponses} · entretien : {entretiens} · proposition : {propositions}',
  'cli.stats.pasAssez': 'Délai avant première réponse : pas assez de données datées.',
  'cli.stats.delai': 'Délai moyen avant la première réponse : {jours} j (sur {n} candidature(s)).',
  'cli.suivi.resume': '{fichier} : {enCours} en cours, {sansSuite} envoyée(s) sans suite, {closes} close(s).',

  // CLI : init
  'cli.init.usage': 'Usage : postuler-juste init <dossier> [--port 4410] [--nom-mcp postuler-juste] [--langue fr|en]',
  'cli.init.cree': 'Espace de travail créé : {dossier}',
  'cli.init.config': '  configuration : {config} (port {port}, langue {langue})',
  'cli.init.mcp': '  serveur MCP « {nom} » : {mcp}',
  'cli.init.navigateur': '  navigateur pour les PDF : {navigateur}',
  'cli.init.commande': "Commande de l'application, depuis l'espace : {commande}",
  'cli.init.etapes': 'Étapes suivantes :',
  'cli.init.etape1': "  1. Dépose ton CV et l'export PDF de ton profil LinkedIn dans {dossier}/a-deposer/",
  'cli.init.etape2': '  2. Ouvre ton IA dans {dossier} (Claude Code : cd dans le dossier puis « claude », et accepte le serveur MCP)',
  'cli.init.etape3': '  3. Colle-lui ce prompt :',

  // CLI : compter, gabarits, cv
  'cli.compter.usage': 'Usage : postuler-juste compter <fichier>',
  'cli.compter.ligne': '{caracteres} caractères  {mots} mots  « {debut}… »',
  'cli.gabarits.choisir': "Choisir : postuler-juste gabarit <nom> (depuis l'espace de travail ; l'ancien gabarit est gardé à côté).",
  'cli.gabarit.usage': 'Usage : postuler-juste gabarit <nom> (liste : postuler-juste gabarits)',
  'cli.gabarit.installe': 'Gabarit « {nom} » installé dans {dossier}{ancien}.',
  'cli.gabarit.ancien': ' (ancien gabarit gardé dans {dossier})',
  'cli.gabarit.regenerer': 'Régénérer les CV pour voir le résultat : postuler-juste cv "cv/<nom>.md" --capture',
  'cli.cv.usage': 'Usage : postuler-juste cv <cv.md>… [--gabarit <dossier>] [--capture]',
  'cli.cv.sansNavigateur': 'Aucun Chrome, Edge ou Chromium trouvé (indiquer son chemin dans POSTULER_JUSTE_NAVIGATEUR)',
  'cli.cv.pages': 'page(s)',
  'cli.cv.depasse': '  <-- DÉPASSE 2 PAGES',

  // ---------------------------------------------------------------------------------------------
  // Serveur HTTP (tableau de bord)
  'serveur.demarre': 'Tableau de bord : http://localhost:{port}/  (données : {dossier})',
  'serveur.arreter': 'Ctrl+C pour arrêter.',
  'serveur.portUtilise': 'Le port {port} est déjà utilisé : le tableau de bord tourne sans doute déjà sur http://localhost:{port}/',
  'serveur.autrePort': 'Sinon, choisissez un autre port : postuler-juste serve --port {suivant}',
  'serveur.inactivite': 'Aucune activité depuis {minutes} min : arrêt du tableau de bord.',
  'api.hoteRefuse': 'Hôte refusé',
  'api.origineRefusee': 'Origine refusée',
  'api.actionInconnue': 'Action inconnue',
  'api.jsonAttendu': 'Requête JSON attendue',
  'api.offreIntrouvable': 'Offre introuvable',
  'api.statutInconnu': 'Statut inconnu',
  'api.champTexte': 'Champ {champ} : texte attendu',
  'api.cheminMalEncode': 'Chemin mal encodé',
  'api.routeInconnue': 'Route inconnue',
  'api.nonCompilee': 'Interface non compilée : lancer « npm run build » dans le dossier de postuler-juste.',
  'api.sansTerminal':
    'Pas de terminal configuré pour cette plateforme : ajouter "terminal" dans postuler-juste.config.json, ou lancer « claude {invite} » dans {dossier}.',
  'api.terminalImpossible': "Impossible d'ouvrir le terminal ({programme}) : {message}",

  // ---------------------------------------------------------------------------------------------
  // Suivi généré (_SUIVI.md)
  'suivi.titre': '# Suivi des candidatures',
  'suivi.quand': '{date} à {heure}',
  'suivi.avertissement1': '> **Fichier généré par postuler-juste le {quand} : ne pas éditer à la main.** Les changements se font dans la base',
  'suivi.avertissement2':
    '> (tableau de bord, CLI ou outils MCP), puis `postuler-juste generer-suivi`. Une ligne par offre ; le détail est dans le dossier de chaque offre.',
  'suivi.enCours': 'En cours',
  'suivi.sansSuite': 'Envoyées sans suite',
  'suivi.closes': 'Closes',
  'suivi.entetes': '| Offre | Type | Canal | Envoyé | Statut | Prochaine action | Dossier |',
  'suivi.entetesCloses': '| Offre | Issue |',
  'suivi.estimations': "Les dates « ≈ » sont des estimations, pas une trace d'envoi. Les corriger si tu retrouves la vraie date.",
  'suivi.pied':
    'Offres vues, écartées ou mises de côté : dans la base (tableau de bord `postuler-juste serve`, ou `postuler-juste list --statut ecartee`).',
  'suivi.aEnvoyer': '**À envoyer** — GO',
  'suivi.teletravail': 'télétravail {valeur}',
  'suivi.dossier': 'dossier',
  'suivi.enRetard': ' (en retard)',
  'suivi.heure': '{h} h {m}',

  // ---------------------------------------------------------------------------------------------
  // Initialisation d'un espace
  'init.invite':
    "Tu vas m'aider dans ma recherche d'emploi. Mon espace de travail est {espace}. Lis {espace}/AGENTS.md puis {espace}/DEMARRAGE.md, et suis le démarrage : vérifie d'abord de quels outils tu disposes, lis ce que j'ai déposé dans a-deposer/, puis pose-moi tes questions, quelques-unes à la fois.",
  'init.dossierAttendu': 'Dossier à créer attendu : postuler-juste init <dossier>',
  'init.pasUnDossier': "{dossier} existe et n'est pas un dossier",
  'init.nonVide': "Le dossier {dossier} n'est pas vide : choisir un dossier neuf ou vide",
  'init.nomMcpInvalide': 'Nom de serveur MCP invalide : {nom} (lettres, chiffres, - et _)',
  'init.gabaritInconnu': 'Gabarit inconnu : {gabarit} (disponibles : {liste})',
  'init.langueInconnue': 'Langue inconnue : {langue} ({langues})',
  'init.npx':
    'Lancé par npx : le serveur MCP et les consignes utilisent « {commande} » (version figée). Au premier lancement, npx la télécharge (connexion nécessaire), puis la garde en cache. Pour un chemin fixe, installer plutôt avec « npm install -g postuler-juste » puis relancer init.',
  'init.nonCompile': 'Tableau de bord non compilé : lancer « npm run build » dans {app} avant « postuler-juste serve ».',
  'init.sansNavigateur':
    'Aucun Chrome, Edge ou Chromium trouvé : la génération des CV en PDF ne marchera pas. Installer Chrome ou Edge, ou indiquer le chemin du navigateur dans POSTULER_JUSTE_NAVIGATEUR.',
  'init.modeleFrancais': "Les consignes de l'IA (modèle de l'espace) sont en français pour l'instant ; leur version anglaise viendra plus tard.",

  // Exemple de pluriel (utilisé par les tests du mécanisme)
  'commun.offres': p('{n} offre', '{n} offres'),
} satisfies Record<string, Texte>;

export type CleServeur = keyof typeof fr;
