# Automatiser l'arrivée des alertes

But : que chaque alerte d'offre reçue (LinkedIn, Indeed, Glassdoor, Hellowork, Free-Work, Welcome to the Jungle…) arrive toute seule dans l'application. L'utilisateur n'a plus qu'à demander de « traiter les e-mails ».

Méthode recommandée : **l'application relève elle-même un dossier de sa boîte mail** (IMAP), sur Windows, macOS ou Linux, sans logiciel de messagerie. Elle ne fait que lire : rien n'est supprimé ni déplacé dans la boîte, les messages relevés sont seulement marqués comme lus. La relève a lieu à chaque ingestion (`ingest_emails`, `vigie-emploi ingest`) et depuis le tableau de bord.

Demande d'abord quelle messagerie il utilise (son adresse suffit : Gmail, Orange, Free, SFR, Yahoo, Outlook.com…), puis guide-le pas à pas, une étape à la fois, en vérifiant avec lui que chaque étape a marché.

**Ne demande jamais son mot de passe dans la conversation** : il le tape lui-même dans le tableau de bord ou dans le terminal, et l'application le confie au trousseau du système (jamais dans l'espace de travail).

## 1. Un dossier et un filtre dans sa messagerie

Dans sa messagerie web, il crée un dossier (un **libellé** dans Gmail), par exemple « Alertes emploi », et un **filtre** qui y range les alertes. Condition du filtre : **l'expéditeur** contient l'adresse d'envoi des alertes de chaque site (il la relève en ouvrant une alerte reçue).

- **Gmail** : ⚙ → Voir tous les paramètres → Filtres et adresses bloquées → Créer un filtre ; champ « De » : les adresses séparées par `OR` ; puis « Appliquer le libellé » (nouveau libellé « Alertes emploi ») et cocher « Appliquer également le filtre aux conversations correspondantes ». « Ignorer la boîte de réception » est facultatif.
- **Orange, Free, SFR, La Poste, Yahoo** : paramètres de la messagerie → « Filtres » ou « Règles » ; action « Déplacer vers le dossier » « Alertes emploi ».
- Les libellés exacts changent selon les versions : si l'utilisateur ne trouve pas un menu, demande-lui ce qu'il voit.

## 2. Le mot de passe à utiliser

- **Gmail, Yahoo, iCloud** : un **mot de passe d'application** (16 caractères), pas celui du compte. Il faut d'abord la validation en deux étapes. Gmail : https://myaccount.google.com/apppasswords (nom libre, par exemple « vigie-emploi »).
- **Orange, Free, SFR, La Poste, GMX** : le mot de passe habituel du compte.
- **Outlook.com, Hotmail, Live, Microsoft 365** : pas encore géré (Microsoft impose sa propre connexion). En attendant : une règle Outlook qui **transfère** les alertes vers une autre boîte (Gmail…) relevée par l'application, ou le glisser-déposer (plus bas).
- Autre messagerie : l'aide de son fournisseur donne le serveur IMAP (souvent `imap.<domaine>`, port 993).

## 3. Connecter la boîte

- **Tableau de bord** (le plus simple, et le seul moyen sans terminal) : `open_dashboard`, puis bouton **« Boîte mail »** en haut : adresse, mot de passe, « Se connecter et lister les dossiers », choix du dossier « Alertes emploi », « Enregistrer ».
- **Terminal** : `vigie-emploi mail setup` (questions posées une à une ; le mot de passe ne s'affiche pas pendant la frappe).

La première relève ne prend que les messages des 14 derniers jours.

## 4. Vérifier

Lance l'ingestion (`ingest_emails`) : son `to_tell` dit combien d'e-mails ont été relevés dans le dossier, ou pourquoi la boîte n'a pas pu l'être (mot de passe refusé, dossier introuvable, serveur injoignable). Relaie le message tel quel et aide à corriger.

## Autres façons

- **Thunderbird et FiltaQuilla** (si l'utilisateur utilise déjà Thunderbird) : un filtre avec l'action « Save Message as File » vers `emails/` (action à activer dans les options de FiltaQuilla) ; laisser le filtre s'appliquer à la relève du courrier.
- **Glisser-déposer** les alertes de la messagerie vers `emails/`, au format `.eml`, reste possible à tout moment ; une fois par jour suffit.
