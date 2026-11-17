# Procédure : traiter les e-mails d'alertes

Déclencheurs : « traite les e-mails », « regarde les nouvelles offres », bouton « Traiter les e-mails » du tableau de bord.
Référence de l'application : `{{DOC_APP}}`. Cette fiche fige l'ordre et les pièges connus.

Outils : le serveur MCP de l'application (`ingest_emails`, `offers_to_read`, `rubric`, `score_batch`, `change_status`, `list_offers`, `read_offer`), sinon la CLI `{{CMD}} <commande> --json`. Sans accès aux fichiers : `read_file` pour `_CONTEXTE.md` (voir `AGENTS.md`). Lire la sortie JSON directement, sans la faire passer par un autre programme.

## 0. Navigateur

Un navigateur connecté (Claude in Chrome ou équivalent) permet de lire les offres LinkedIn, Indeed et Glassdoor. Si tu n'en vois pas, regarde d'abord `_CONTEXTE.md` (section 9) : si l'utilisateur a dit en avoir un, demande-lui de l'activer dans cette conversation (Claude Desktop : menu des outils) ; s'il n'a jamais été question, propose-le une fois. S'il n'est pas disponible : le dire tout de suite à l'utilisateur, traiter d'abord les offres dont la description est déjà en base, puis lui demander le texte des autres (ou de relancer avec le navigateur).

## 1. Ingérer

`ingest_emails`. Donner en une phrase : nouvelles offres, doublons, écartées sur l'intitulé, à lire. Puis transmettre à l'utilisateur ce que dit `to_tell` : **les `.eml` traités ont été supprimés de `emails/`** (il doit le savoir), et chaque erreur d'ingestion (`errors` : description non lue, page sans données « JSON-LD », lien illisible…), avec l'offre concernée ; une description non lue n'empêche pas de lire l'offre dans le navigateur.

**Accusés de réception de candidature** (`confirmations` du résultat : « Confirmation de votre candidature », « votre candidature a été envoyée »…) : ce ne sont pas des offres. Pour chacun, vérifier que la candidature est enregistrée comme envoyée (`known_offers`) ; sinon le signaler à l'utilisateur et l'enregistrer avec lui (`save_application` avec `sent_at`). Ne jamais les présenter comme de nouvelles offres. **E-mails non supprimés** (erreur « e-mail lu mais non supprimé ») : le signaler, ils reviendraient au lot suivant.

## 2. Inventaire du lot

`offers_to_read` renvoie un résumé par pages de 25 (id, intitulé, entreprise, lieu, `reading`, `length_description`) ; `remaining` > 0 : demander la page suivante (`page`). `reading` vaut `description` (texte déjà en base), `browser` (ouvrir l'URL) ou `human` (demander le texte). Ensuite, lire **offre par offre** avec `read_offer` (id) et noter par paquets. En CLI : `{{CMD}} to-read --json`.

## 3. Écarter sur l'intitulé

Sans lecture, ce qui est clairement hors cible au regard de `_CONTEXTE.md` (métier, technologie principale au niveau zéro, pays, stage…). `change_status` → `dismissed`, commentaire : `Écartée sur l'intitulé (lot du JJ/MM) : <raison>`.

## 4. Noter

1. `rubric` d'abord : critères, barèmes, règles, inventaire, exemples.
2. Pour chaque offre lue : sous-notes des critères `ai` avec justification courte, `inputs` (jours sur site, salaire ou TJM et son unité), `blockers` (règles de la grille), `fit`, `gaps`, `read: true`. **Ne jamais donner la note finale** : l'application la calcule.
3. Un seul `score_batch` par paquet d'offres.
4. Une offre mise à 0 par une règle bloquante passe ensuite en `dismissed`, avec la règle en commentaire.

## 5. Lire dans le navigateur

Un onglet à soi, quelques offres à la fois, la description seule (pas toute la page). Pièges connus :

- **LinkedIn** : lisible connecté ; un chargement par script est refusé. Offre « candidatures non acceptées » ou page introuvable : `dismissed` (« offre fermée »), sans la présenter.
- **Indeed** : préférer l'URL directe `https://fr.indeed.com/viewjob?jk=…` ; le lien de suivi de l'e-mail déclenche une vérification anti-robot.
- **Glassdoor** : attendre le chargement, garder le texte à partir de « Description ». Page de vérification « human » : ne pas la contourner, demander à l'utilisateur.
- **Hellowork, Free-Work** : la description est normalement déjà en base.
- Doublon d'une offre déjà en base : `dismissed` (« doublon de #id »).

Fermer l'onglet à la fin, puis `score_batch` pour ces offres.

## 6. Rendre compte

Tableau des offres au-dessus du seuil de la grille, meilleures d'abord : note, n°, entreprise, intitulé, lieu, rémunération, pourquoi, points à vérifier, **lien complet**. Signaler les notes trompeuses (une offre qui monte seulement grâce au télétravail, par exemple). Une ligne pour celles juste en dessous.

Finir par : « Dis-moi sur quelles offres tu dis go ; les autres passeront en écartées. » Sur sa réponse : les offres sans go passent en `dismissed` (raison en commentaire), puis proposer de préparer les candidatures (procédure `prepare-go`).

Si l'espace est versionné avec git : commit de la base (`data/vigie-emploi.sqlite`) avec un message « Lot du JJ/MM : N offres, X écartées, Y notées ».
