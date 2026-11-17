# Nouveautés

## 0.6.0 — novembre 2026 (première version publique)

Première version publiée : tout ce qui suit est nouveau pour qui l'installe.

### Alertes d'offres

- **Relève intégrée de la boîte mail (IMAP)** : l'application relève elle-même le dossier où un filtre de la messagerie range les alertes d'offres, sous Windows, macOS et Linux, sans logiciel de messagerie. Lecture seule (messages marqués comme lus au plus, rien de supprimé ni de déplacé), chaque message relevé une fois, première relève limitée aux 14 derniers jours.
- Mot de passe de la boîte gardé par le système, jamais dans l'espace de travail : DPAPI sous Windows, trousseau de macOS, Secret Service sous Linux (à défaut, un fichier lisible par l'utilisateur seul) ; `VIGIE_EMPLOI_MAIL_PASSWORD` pour les scripts et l'extension Claude Desktop.
- Messageries reconnues d'après l'adresse : Gmail, Yahoo, iCloud (mot de passe d'application) ; Orange, Free, SFR, La Poste, GMX (mot de passe habituel). Outlook.com et Microsoft 365 ne sont pas encore gérés (Microsoft impose sa propre connexion) : faire suivre les alertes vers une autre boîte en attendant.
- `vigie-emploi mail setup|status|fetch|forget` ; `ingest` relève d'abord la boîte (`--no-mail` pour s'en passer) ; l'outil MCP `ingest_emails` dit ce qui a été relevé, ou pourquoi la boîte ne l'a pas été.
- Tableau de bord : panneau « Boîte mail » (connexion, liste des dossiers, relève immédiate, oubli) et bouton « Relever la boîte mail ».
- Les `.eml` déposés dans `emails/` (à la main, par Thunderbird et FiltaQuilla, ou par toute autre règle) restent lus.

### Installation

- `init` sans dossier crée `~/vigie-emploi` (`~` compris aussi sous PowerShell) ; l'extension Claude Desktop et le serveur MCP prennent le même dossier par défaut.
- Un seul prompt à coller dans Claude Code installe l'application et lance le démarrage dans la même session.
- Extension Claude Desktop (`.mcpb`) : un clic, ni terminal ni Node à installer.

### Le reste

- Tri des offres par l'IA avec une grille de notation transparente et réglable : critères pondérés, barèmes télétravail et rémunération, règles bloquantes, inventaire de compétences, exemples de référence, versions et restauration ; l'application calcule la note, l'IA ne note que les critères.
- Candidatures, journal et échéances ; suivi généré (`candidatures/_SUIVI.md`) ; statistiques.
- CV en Markdown → PDF A4 de deux pages, trois gabarits (`plain`, `modern`, `compact`).
- Tableau de bord web, CLI à sortie JSON stable, serveur MCP (33 outils, 4 prompts) utilisable sans accès aux fichiers (Claude Desktop).
- Français et anglais partout (interface, CLI, textes MCP montrés à l'utilisateur, consignes de l'IA, modèle de l'espace).
- Tests sous Linux, Windows et macOS (GitHub Actions).
