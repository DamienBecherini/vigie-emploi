# Procédure : préparer les candidatures en « go »

Déclencheurs : « prépare mes candidatures », « prépare les go », bouton « Préparer les candidatures » du tableau de bord.

## 1. Trouver les offres

`lister_offres` avec `statuts: ["go"]`. Garder celles sans dossier (`fichiers_dossier` : `existe: false`). Les autres sont déjà prêtes : les rappeler à la fin si elles ne sont pas envoyées. Aucune : le dire et s'arrêter.

## 2. Avant de rédiger

- Lire **`_CONTEXTE.md` en entier** : faits, inventaire revendicable, interdits, confidentialité.
- Lire [`cv-cible.md`](cv-cible.md).
- Pour chaque offre : `lire_offre` (description, note, décomposition) ; ouvrir l'annonce **et le formulaire de candidature** si un navigateur est disponible ; **sinon, demander à l'utilisateur, avant de rédiger**, ce que le formulaire demande : CV seul, message et sa limite de caractères, questions, lettre exigée. Une « candidature facile » Glassdoor passe souvent par un formulaire Indeed qui accepte un message jusqu'à 4 000 caractères : en prévoir un.

## 3. Pour chaque offre

1. `candidater` (renvoie `dossier_suggere`).
2. Créer `candidatures/<entreprise>-<poste>/dossier-candidature.md` d'après `candidatures/_MODELE-dossier-candidature.md` : l'offre, ce qui colle (preuves), les écarts à assumer, les conditions, les questions, le formulaire, les messages (limite du canal respectée, longueur indiquée), le suivi.
3. CV ciblé si l'offre le justifie ([`cv-cible.md`](cv-cible.md)) ; sinon le CV de référence, **copié sous un nom qui ne cite aucune autre entreprise**.
4. Messages : partir de la trame adaptée de [`../messages/MODELES.md`](../messages/MODELES.md). Lettre de motivation seulement si le formulaire l'exige (trame 6).
5. Longueur de chaque message : `{{CMD}} compter <dossier-candidature.md>` ou l'outil `compter` (la vraie valeur, pas une estimation).
6. `enregistrer_candidature` : `dossier`, `cv` (le PDF), `canal`, `prochaine_action` (« Envoyer sur … »).

## 4. Fin

`generer_suivi` avec `remplacer: true`. Si l'espace est versionné : commit (un par offre ou un pour le lot).

Puis, pour chaque candidature à envoyer : où envoyer (URL complète), le dossier et le CV (chemins complets), les messages à copier au format « texte à copier-coller » d'`AGENTS.md`, et les pièges du formulaire (CV pré-rempli à remplacer, questions). Terminer par : « Dis-moi ce qui est envoyé : je passerai chaque offre en envoyée avec une relance. »
