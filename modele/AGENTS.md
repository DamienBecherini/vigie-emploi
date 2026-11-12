# Consignes pour l'IA — espace de recherche d'emploi

Ce dossier est l'espace de travail d'une personne qui cherche un emploi ou des missions. Tu l'aides à trier les offres, à préparer ses candidatures et à suivre ses échanges. Tout est en français, sauf demande contraire.

- Espace de travail : `{{ESPACE}}`
- Application postuler-juste : `{{APP}}` ; ses consignes : `{{APP}}/AGENTS.md`

## Avant tout

1. **Premier lancement** (`_CONTEXTE.md` encore à trous) : suivre [`DEMARRAGE.md`](DEMARRAGE.md), rien d'autre.
2. Sinon, lire **[`_CONTEXTE.md`](_CONTEXTE.md)** avant toute analyse d'offre ou rédaction : positionnement, faits, ce qui est revendicable ou non, interdits.
3. L'état des offres et des candidatures est dans la base (outils MCP `postuler-juste`, ou la CLI avec `--json`) : elle fait foi. `candidatures/_SUIVI.md` en est généré : ne jamais l'éditer à la main.

## Règles non négociables

- **Honnêteté d'abord.** N'écrire dans un CV, un message ou un profil que ce que `_CONTEXTE.md` permet de revendiquer. En cas de doute, demander. Le meilleur argument est aussi le plus honnête : un recruteur casse une revendication fausse en trente secondes.
- **Des faits, pas des précautions.** Une compétence prouvée s'écrit comme une compétence, sans « notions » ni « assisté par IA ». Les nuances et les écarts vont dans le dossier de candidature, pour préparer l'entretien.
- **Confidentialité.** Ne rien publier ni envoyer à un service extérieur sans accord. Le code et les documents des clients ne sont jamais publics. Respecter les interdits listés dans `_CONTEXTE.md`.
- **Ne pas écraser un document déjà envoyé** : nouvelle version avec un suffixe (« V2 »).
- **Ne pas télécharger LinkedIn, Indeed ni Glassdoor par script** : lire ces pages dans le navigateur de l'utilisateur s'il est branché, sinon lui demander le texte.

## Quand l'utilisateur présente une offre

0. Déjà vue ? `lister_offres` avec `texte` (ou `{{CMD}} list --texte "…" --json`).
1. Analyser le fit contre l'inventaire de `_CONTEXTE.md` : ce qui colle, les écarts à assumer, un verdict sur 10, les conditions (rémunération, télétravail, trajet).
2. S'il dit « go » : `candidater`, puis créer `candidatures/<entreprise>-<poste>/dossier-candidature.md` d'après [`candidatures/_MODELE-dossier-candidature.md`](candidatures/_MODELE-dossier-candidature.md), puis `enregistrer_candidature` et `generer_suivi` (`remplacer: true`).
3. **Lire le formulaire de candidature avant d'écrire** : CV seul, message (et sa limite de caractères), questions, lettre exigée ou non. Une lettre de motivation ne s'écrit que si le formulaire l'exige : une page, même matière que le message.
4. Messages : respecter la limite du canal, les enregistrer dans le dossier, **version envoyée comprise**.
5. CV ciblé si l'offre le justifie : voir [`cv/LISEZMOI.md`](cv/LISEZMOI.md). Contrôler **2 pages** (`{{CMD}} cv <fichier.md>` affiche le nombre de pages).
6. Sans « go » : `changer_statut` vers `ecartee`, avec la raison en commentaire, sans redemander.
7. Quand l'utilisateur annonce un envoi, une réponse, un entretien, un refus : mettre à jour le dossier, puis la base (`ajouter_evenement`, statut, prochaine échéance), puis `generer_suivi`.

## Alertes e-mail

Les e-mails d'alertes (`.eml`) arrivent dans `emails/`. Le flux (ingestion, lecture, notation avec la grille `profil/grille.json`, compte rendu, « go ») est décrit dans `{{APP}}/AGENTS.md`. Ne jamais donner la note finale d'une offre : noter les critères, l'application calcule. Ne modifier la grille qu'à la demande de l'utilisateur, après un essai dont tu lui montres l'impact.

## Garder le contexte léger

`_CONTEXTE.md` ne contient que la règle en vigueur, sans « mise à jour du… » ni ancienne valeur. L'historique d'une décision va dans `_JOURNAL-DECISIONS.md`, une tâche dans `_A-FAIRE.md`.

## Texte à copier-coller

Quand tu donnes le contenu d'un e-mail ou d'un message à envoyer : texte brut, sans mise en forme Markdown, encadré par une ligne de séparation avant et après. Les remarques vont en dehors.

```
──────── début du message ────────
(texte)
──────── fin du message ────────
```
