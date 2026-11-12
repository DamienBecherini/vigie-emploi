# Procédure : traiter les e-mails d'alertes

Déclencheurs : « traite les e-mails », « regarde les nouvelles offres », bouton « Traiter les e-mails » du tableau de bord.
Référence de l'application : `{{APP}}/AGENTS.md`. Cette fiche fige l'ordre et les pièges connus.

Outils : le serveur MCP de l'application (`ingerer_emails`, `offres_a_lire`, `grille`, `noter_lot`, `changer_statut`, `lister_offres`, `lire_offre`), sinon la CLI `{{CMD}} <commande> --json`. Lire la sortie JSON directement, sans la faire passer par un autre programme.

## 0. Navigateur

Un navigateur connecté (Claude in Chrome ou équivalent) permet de lire les offres LinkedIn, Indeed et Glassdoor. S'il n'est pas disponible : le dire tout de suite à l'utilisateur, traiter d'abord les offres dont la description est déjà en base, puis lui demander le texte des autres (ou de relancer avec le navigateur).

## 1. Ingérer

`ingerer_emails` (les `.eml` traités sont supprimés). Donner en une phrase : nouvelles offres, doublons, écartées sur l'intitulé, à lire, erreurs.

## 2. Inventaire du lot

`offres_a_lire` : pour chaque offre, `lecture` vaut `description` (texte déjà en base), `navigateur` (ouvrir l'URL) ou `humain` (demander le texte). Si la sortie est trop longue, la lire par morceaux (`limite`).

## 3. Écarter sur l'intitulé

Sans lecture, ce qui est clairement hors cible au regard de `_CONTEXTE.md` (métier, technologie principale au niveau zéro, pays, stage…). `changer_statut` → `ecartee`, commentaire : `Écartée sur l'intitulé (lot du JJ/MM) : <raison>`.

## 4. Noter

1. `grille` d'abord : critères, barèmes, règles, inventaire, exemples.
2. Pour chaque offre lue : sous-notes des critères `ia` avec justification courte, `entrees` (jours sur site, salaire ou TJM et son unité), `bloquants` (règles de la grille), `colle`, `ecarts`, `lu: true`. **Ne jamais donner la note finale** : l'application la calcule.
3. Un seul `noter_lot` par paquet d'offres.

## 5. Lire dans le navigateur

Un onglet à soi, quelques offres à la fois, la description seule (pas toute la page). Pièges connus :

- **LinkedIn** : lisible connecté ; un chargement par script est refusé. Offre « candidatures non acceptées » ou page introuvable : `ecartee` (« offre fermée »), sans la présenter.
- **Indeed** : préférer l'URL directe `https://fr.indeed.com/viewjob?jk=…` ; le lien de suivi de l'e-mail déclenche une vérification anti-robot.
- **Glassdoor** : attendre le chargement, garder le texte à partir de « Description ». Page de vérification « humain » : ne pas la contourner, demander à l'utilisateur.
- **Hellowork, Free-Work** : la description est normalement déjà en base.
- Doublon d'une offre déjà en base : `ecartee` (« doublon de #id »).

Fermer l'onglet à la fin, puis `noter_lot` pour ces offres.

## 6. Rendre compte

Tableau des offres au-dessus du seuil de la grille, meilleures d'abord : note, n°, entreprise, intitulé, lieu, rémunération, pourquoi, points à vérifier, **lien complet**. Signaler les notes trompeuses (une offre qui monte seulement grâce au télétravail, par exemple). Une ligne pour celles juste en dessous.

Finir par : « Dis-moi sur quelles offres tu dis go ; les autres passeront en écartées. » Sur sa réponse : les offres sans go passent en `ecartee` (raison en commentaire), puis proposer de préparer les candidatures (procédure `preparer-go`).

Si l'espace est versionné avec git : commit de la base (`data/postuler-juste.sqlite`) avec un message « Lot du JJ/MM : N offres, X écartées, Y notées ».
