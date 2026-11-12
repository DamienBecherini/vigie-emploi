# Ma recherche d'emploi

Espace de travail créé par **postuler-juste** : une IA (Claude Code, Cursor, Codex…) t'y aide à trier les offres, à préparer des candidatures honnêtes et à suivre tes échanges.

## Pour commencer

1. Glisse ton CV et l'export PDF de ton profil LinkedIn dans [`a-deposer/`](a-deposer/).
2. Ouvre ton IA dans ce dossier et colle-lui le prompt de démarrage affiché à l'installation, ou simplement : « Lis AGENTS.md et DEMARRAGE.md, puis lance le démarrage. »
3. Réponds à ses questions : elle remplit ton contexte, ta grille de notation des offres et un premier CV, que tu valides.

## Ce qu'il y a ici

| Chemin | Rôle |
|---|---|
| `_CONTEXTE.md` | Ce que l'IA sait de toi : positionnement, faits, ce que tu peux revendiquer ou non. Point d'entrée de l'IA. |
| `_A-FAIRE.md`, `_JOURNAL-DECISIONS.md` | Tâches en attente, historique des décisions. |
| `AGENTS.md` (et `CLAUDE.md`) | Consignes de travail de l'IA. |
| `a-deposer/` | Tes documents de départ (CV, export LinkedIn…). |
| `profil/grille.json` | Ta grille de notation des offres (critères, poids, plancher de rémunération…). |
| `cv/` | Tes CV en Markdown et leurs PDF ; `cv/gabarit/` = la mise en page. |
| `candidatures/` | Un dossier par offre (annonce, fit, messages, suivi) et `_SUIVI.md`, généré. |
| `emails/` | Les e-mails d'alertes d'offres (`.eml`) à trier. |
| `profils-publics/` | L'état de tes profils publics (LinkedIn, Malt…). |
| `messages/` | Trames de messages : candidature, mission freelance, recruteur, relance, remerciement. |
| `procedures/` | Les procédures que suit l'IA (tri des e-mails, préparation des candidatures, CV ciblé). |
| `data/` | La base des offres et candidatures. |

## Commandes utiles

La commande de l'application (à lancer depuis ce dossier) :

```
{{CMD}} serve      tableau de bord dans le navigateur
{{CMD}} cv "cv/<nom>.md"
                   CV en PDF (affiche le nombre de pages)
{{CMD}} ingest     lit les e-mails d'alertes de emails/
```

Conseil : versionne ce dossier avec git (`git init`), pour retrouver une ancienne version d'un CV ou d'un message.
