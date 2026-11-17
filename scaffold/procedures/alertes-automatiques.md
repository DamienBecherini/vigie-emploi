# Automatiser l'arrivée des alertes dans `emails/`

But : que chaque alerte d'offre reçue (LinkedIn, Indeed, Glassdoor, Hellowork, Free-Work, Welcome to the Jungle…) soit enregistrée toute seule en fichier `.eml` dans le dossier `emails/` de l'espace. L'utilisateur n'a plus qu'à demander de « traiter les e-mails ».

Demande d'abord quelle messagerie il utilise, puis guide-le pas à pas pour celle-là seulement, une étape à la fois, en vérifiant avec lui que chaque étape a marché.

## Thunderbird (recommandé)

Thunderbird ne sait pas enregistrer un message en fichier depuis un filtre ; l'extension gratuite **FiltaQuilla** ajoute cette action.

1. **Installer FiltaQuilla** : menu **Outils → Modules complémentaires et thèmes**, chercher « FiltaQuilla », installer.
2. **Activer l'action** : Modules complémentaires → FiltaQuilla → **Options** ; dans la liste des actions, cocher **« Save Message as File »** (désactivée par défaut : sans ça, elle n'apparaît pas dans les filtres).
3. **Créer le filtre** : menu **Outils → Filtres de messages**, choisir le compte qui reçoit les alertes, **Nouveau**, nom « Alertes offres ».
   - **« Remplir une des conditions suivantes »**, une condition par site : **Expéditeur → contient → adresse d'envoi des alertes** (l'utilisateur la relève en ouvrant une alerte reçue).
   - Actions : 1. **Save Message as File** → le dossier `emails/` de l'espace (chemin complet à lui donner) ; 2. *(facultatif)* **Déplacer le message vers** un sous-dossier, par exemple « Alertes traitées ».
   - Laisser le filtre s'appliquer à la **relève du courrier**.
4. **Alertes déjà reçues** : sélectionner le filtre, puis **Exécuter maintenant** sur la boîte de réception.
5. **Vérifier** : lister `emails/` ; des fichiers `.eml` doivent y être.

Les libellés exacts peuvent varier un peu selon la version de Thunderbird ou de l'extension : si l'utilisateur ne trouve pas un menu, demande-lui ce qu'il voit.

## Gmail, Outlook.com, Yahoo ou autre messagerie web

Ces messageries ne savent pas enregistrer un message dans un dossier de l'ordinateur. Le plus simple : **ajouter le même compte dans Thunderbird** (gratuit, l'assistant de configuration fait tout), seulement pour ce filtre, puis suivre la section Thunderbird. La messagerie web reste utilisable comme avant.

## Outlook (application de bureau)

Les règles d'Outlook n'enregistrent pas un message en fichier sans macro. Proposer, dans l'ordre : ajouter le compte dans Thunderbird (section ci-dessus) ; à défaut, glisser les alertes à la main depuis Outlook vers `emails/` (Outlook les enregistre en `.msg`, que l'application ne lit pas : passer par « Enregistrer sous » au format `.eml` quand il est proposé, sinon Thunderbird).

## Sans automatisation

Glisser-déposer les alertes de la messagerie vers `emails/` reste possible à tout moment ; une fois par jour suffit.
