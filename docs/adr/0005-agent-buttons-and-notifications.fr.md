# ADR 0005 — Boutons « agent » et notifications poussées

[English](0005-agent-buttons-and-notifications.md) · **Français**

Date : 12/11/2026 · Statut : accepté

## Contexte

Le tri des e-mails et la préparation des candidatures se font en dialogue avec un agent (Claude Code) dans un terminal : l'utilisateur tape « traite les e-mails », l'agent ingère, lit, note, puis attend son « go ». L'utilisateur veut lancer ces travaux depuis le tableau de bord, au moment où il y a quelque chose à faire, et voir les offres changer pendant que l'agent travaille, sans recharger la page.

Deux options pour le lancement :

1. Le serveur exécute l'agent en arrière-plan (`claude -p`) et affiche sa progression.
2. Le serveur ouvre un terminal où l'agent démarre avec la bonne commande ; la conversation continue dans ce terminal.

## Décisions

1. **Option 2 : ouvrir un terminal.** Le flux se termine par une décision de l'utilisateur (« go », messages à reprendre, envois annoncés) : il lui faut la conversation. Un agent en arrière-plan n'aurait personne pour accepter une permission (il faudrait tout autoriser d'avance), se brancherait mal sur l'extension Chrome dont la lecture des offres a besoin, et demanderait de gérer progression, erreurs et annulation dans l'application. L'application reste sans appel à un modèle : elle tape la commande à la place de l'utilisateur.
2. **Travail en attente** (`GET /api/travail`, `src/api/travail.ts`) : nombre de `.eml` dans la boîte de réception, offres en `go` dont le dossier de candidature n'existe pas (pas de candidature, dossier vide ou absent du disque). L'interface montre un bouton par travail, au-dessus des filtres, seulement s'il y en a.
3. **Lancement** (`POST /api/travail/traiter-emails` et `/preparer-go`) : actions en liste fermée, invite fixe (`/traiter-emails`, `/preparer-go` : commandes que le dossier de données doit fournir à l'agent). Commande du terminal réglable (`terminal` dans la configuration, `{dossier}` et `{invite}` remplacés) ; par défaut sous Windows : `wt.exe -d <données> claude <invite>` ; ailleurs, une erreur explicite qui donne la commande à taper. Le bouton se désactive quelques secondes après un lancement (double clic).
4. **Écritures d'une autre origine refusées.** La vérification de l'hôte (`localhost`) ne protège pas d'un formulaire posté par une page tierce : toute requête d'écriture dont l'en-tête `Origin` n'est pas local, ou marquée `Sec-Fetch-Site: cross-site`, est refusée (403). Le lancement exige en plus `Content-Type: application/json` (impossible depuis un formulaire sans requête préalable CORS). La CLI, le MCP et les tests n'envoient pas d'`Origin` : inchangés.
5. **Notifications poussées plutôt qu'interrogation périodique** (`GET /api/flux`, Server-Sent Events, `src/api/diffusion.ts`) :
   - la base est écrite par d'autres processus (CLI, serveur MCP de l'agent, git) : le serveur surveille le dossier de la base (`fs.watch`, base et journal), regroupe une rafale d'écritures (300 ms), puis compare `PRAGMA data_version`, qui ne change que si une autre connexion a validé une écriture ; il émet `base` seulement dans ce cas ;
   - ses propres écritures (API) ne changent pas `data_version` pour sa connexion : le serveur émet `base` après chaque requête d'écriture réussie (utile aux autres onglets) ;
   - la boîte de réception est surveillée de la même façon : `emails` avec le nombre de `.eml` quand il change ;
   - l'interface recharge toutes ses requêtes sur `base`, l'état du travail sur `emails`, et tout après une reconnexion (des modifications ont pu être manquées pendant la coupure).
6. **Arrêt automatique inchangé** : le flux, comme le contrôle de santé, ne compte pas comme activité ; un commentaire est envoyé toutes les 25 s pour garder la connexion ouverte.

## Conséquences

- Pendant un tri dans le terminal, les offres changent de statut à l'écran au fil des enregistrements de l'agent ; le bouton « Traiter » disparaît quand l'ingestion supprime les e-mails.
- Hors Windows, les boutons demandent de régler `terminal` (ex. `["gnome-terminal", "--working-directory={dossier}", "--", "claude", "{invite}"]`).
- `fs.watch` dépend du système de fichiers : sur un partage réseau, les notifications peuvent manquer ; le bouton « Rafraîchir » reste là.
