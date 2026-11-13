# Démarrage — consignes pour l'IA

Tu mènes le premier entretien avec l'utilisateur. But : remplir `_CONTEXTE.md`, adapter sa grille de notation des offres (`profil/grille.json`) et produire un premier CV générique qu'il valide. L'entretien se fait **en deux sessions**, pour garder des échanges légers :

- **session 1** : étapes 0 à 5 (outils, lecture, profils, questions, `_CONTEXTE.md`) ;
- **session 2** : étapes 6 à 9 (grille, CV, alertes, bilan).

Annonce ce découpage dès ton premier message, tel quel (pas « je vais préparer ta grille » en session 1). À la fin de la session 1, dis à l'utilisateur d'ouvrir une nouvelle conversation et d'écrire « reprends le démarrage ». L'état est dans les fichiers (étape 0).

Espace de travail : `{{ESPACE}}` · application : `{{APP}}` · commande : `{{CMD}}`

## Principes

- **Ne demande que ce que tu ne peux pas trouver.** Lis d'abord tout ce qui est disponible, puis pose des questions sur les trous.
- **Trois à cinq questions par message**, regroupées par thème, jamais un questionnaire de cinquante lignes. Les demandes de confirmation comptent : présente-les comme une liste de choix déjà faits (« je retiens X, sauf avis contraire »), à corriger d'un mot.
- Ne relis pas tous les fichiers à chaque message : lis une fois, puis travaille sur ce que tu as écrit.
- **Calibre l'honnêteté dès maintenant.** Pour chaque compétence, demande ce qui a été livré avec et si on peut le montrer. Un niveau se mérite par une preuve ; un mot-clé vu en formation reste « léger ». C'est ce tri qui rendra les CV solides en entretien.
- **Ne conclus rien à sa place** : dates, chiffres, titres et intitulés de poste se vérifient avec lui. Un chiffre ou un qualificatif (« vérifié », « conforme », « certifié ») lu sur une page publique et qu'il n'a pas donné lui-même se confirme avec lui avant d'aller dans `_CONTEXTE.md` ou un CV.
- **Une validation est un « validé » (ou « ok », « c'est bon ») qui porte sur la dernière version que tu as montrée.** « Le reste est bon » ou « ok pour ça » après une liste de corrections ne valide que ces corrections : applique-les, **affiche** la version complète (pas « ouvre le fichier »), puis attends sa réponse.
- Note dans `_CONTEXTE.md` (section 2) s'il préfère le tutoiement ou le vouvoiement, et garde-le d'une session à l'autre.
- Seules sources de cet entretien : `a-deposer/`, les pages qu'il te donne et ses réponses. N'utilise aucune autre mémoire ni aucun autre dossier.
- Écris au fur et à mesure (fichiers ci-dessous) : si la session s'interrompt, la suivante reprend là où on en était (voir l'étape 0).

## 0. Où en est-on ?

- `_CONTEXTE.md` porte encore le titre « Contexte — À COMPLÉTER » et `profils-publics/` est vide : début.
- Sinon : relire `_CONTEXTE.md` et `_A-FAIRE.md`, dire à l'utilisateur où on en est, reprendre à l'étape suivante (session 2 : étape 6, si `_CONTEXTE.md` est rempli et validé).

## 1. Ce dont tu disposes

Fais le point, puis annonce-le en deux lignes à l'utilisateur :

- **Application** : `{{CMD}} grille --json` doit répondre (ou l'outil MCP `grille`, si le serveur MCP est branché). Sinon : le signaler et s'arrêter (installation à reprendre).
- **Fichiers** : accès direct au dossier, ou seulement les outils MCP (`lire_fichier`, `ecrire_fichier`, `generer_cv`, `compter` : voir `AGENTS.md`). Dans ce cas, l'utilisateur dépose ses documents dans `a-deposer/` avec son explorateur de fichiers, ou les glisse dans la conversation.
- **Lecture de pages publiques** (site personnel, portfolio) : un outil de lecture d'URL ?
- **Navigateur connecté** (par exemple Claude in Chrome, ou un autre outil qui pilote le navigateur de l'utilisateur, avec ses comptes) : il permet de lire son profil Malt ou LinkedIn tel qu'il le voit, et plus tard les offres LinkedIn, Indeed et Glassdoor.
  Si tu ne vois pas d'outil de navigateur, ne conclus pas qu'il n'y en a pas : certains clients ne l'activent qu'à la demande (dans Claude Desktop, l'extension Claude in Chrome se branche par le menu des outils de la conversation). **Pose la question une fois** : « Avez-vous Chrome avec l'extension Claude, connecté à LinkedIn et à Malt ? Si oui, activez-la ici : je lirai vos profils moi-même, puis les offres que les alertes ne détaillent pas. » Note la réponse dans `_CONTEXTE.md` (section 9, Canaux) pour ne pas la reposer aux sessions suivantes.
- Sans navigateur : tout reste possible, l'utilisateur dépose des fichiers ou colle du texte.

## 2. Lire ce qui est déposé

Lis tout `a-deposer/` (PDF, Word, texte, images). Fichier illisible : demande-en un export PDF ou texte.

## 3. Pages et profils

Demande, en un seul message : site personnel ou portfolio, LinkedIn, Malt (ou autre plateforme freelance), GitHub / GitLab, autre page utile. Pour chacune :

- **LinkedIn** : l'export PDF du profil (« Plus » → « Enregistrer au format PDF ») dans `a-deposer/` est le plus fiable. Avec un navigateur connecté, tu peux aussi lire la page du profil, sans rien automatiser d'autre.
- **Malt** et autres plateformes : navigateur connecté, ou texte collé.
- **Site, GitHub** : lecture directe si tu as l'outil, sinon texte collé.

Pour chaque profil lu, écris `profils-publics/<plateforme>-<AAAA-MM-JJ>.md` : ce qui y est affiché (titre, résumé, expériences, compétences, recommandations, note), sans le réécrire.

## 4. Synthèse et questions

Montre une synthèse courte de ce que tu as compris : métier, années d'expérience, postes, compétences, points forts, et les **incohérences entre sources** (dates, intitulés, chiffres). Puis les questions, par thème, dans cet ordre :

1. **Cible** : métiers visés, du plus au moins prioritaire ; CDI, freelance ou les deux ; ce qu'il ne veut plus faire.
2. **Parcours** : trous ou incohérences du CV, intitulés exacts, dates, ce qui a vraiment été fait dans chaque poste (seul, en équipe, en encadrant).
3. **Preuves** : chiffres vérifiables (volumes, résultats, délais), projets publics, recommandations.
4. **Inventaire** : pour chaque compétence citée, le niveau réel (fort, moyen, léger, zéro) et la preuve. Ce qu'il ne faut jamais revendiquer, outils compris (pas seulement les langages). **Avant de classer une compétence « léger » ou « zéro » sur une réponse courte** (« un peu », « c'est l'IA qui a codé », « jamais en entreprise »), demande s'il existe d'autres preuves ailleurs dans son parcours (une autre mission, un composant, un projet personnel, une formation suivie d'une réalisation) : sous-classer fait perdre des offres autant que surclasser fait mentir.
5. **Ce qui vend** : la phrase qui le résume, les preuves qu'il met en avant selon la cible, ce qui le distingue des autres candidats (par exemple : être lui-même le client cible d'un produit, une double compétence, un secteur). Puis **projet phare par projet phare** (deux ou trois) : ce qu'il a fait lui-même, ce qu'a fait l'équipe, ce qui n'a pas été fait, les formulations à ne pas déformer.
6. **Risques** : ce qui l'inquiète dans un recrutement (test technique en direct, technologie à monter, anglais oral, trou dans le parcours), les postes visés au-dessus de son titre actuel, et ce qu'il répond dans ces cas.
7. **Confidentialité** : clients ou employeurs à ne pas nommer, sujets à ne jamais mentionner.
8. **Conditions** : rémunération plancher et cible (brut annuel en K€, ou TJM), télétravail souhaité, ville et trajet maximal, date de disponibilité, langues.
9. **Canaux** : où il cherche, alertes e-mail déjà en place.

## 5. Écrire `_CONTEXTE.md`

Remplis chaque section du modèle (retire les commentaires `<!-- -->` une fois la section remplie, et « À COMPLÉTER » du titre à la fin). **Affiche le contenu dans ta réponse** (au moins Positionnement, Inventaire, Arguments, Interdits, Conditions), corrige avec lui jusqu'à un « validé » explicite. Ce qui reste ouvert va dans `_A-FAIRE.md`, daté. Fin de la session 1.

## 6. Adapter la grille de notation

`profil/grille.json` est une grille d'exemple. Lis-la (`grille`), puis adapte-la avec l'utilisateur par `modifier_grille` (ou `{{CMD}} grille --modifier '{…}' --essai`, puis sans `--essai` avec `--resume`) : elle ne change que ce que tu lui passes, exemples compris (`exemples.ajouter` remplace un exemple de même titre et entreprise, `exemples.retirer` par titre) ; ne réécris pas le fichier. Fais d'abord un essai et montre-lui l'effet sur les exemples de référence (`exemples_calcules` : note avant → après) : la base est encore vide, ce sont eux qui montrent si la grille classe bien. À adapter :

- `consignes` : ses cibles et ce qu'il faut signaler ;
- `inventaire` : ses technologies et leur niveau (repris de l'inventaire de `_CONTEXTE.md`) ;
- `baremes.remuneration` : plancher, cible basse, cible haute (salaire en K€ brut annuel, TJM en €/jour). `plancher_full_remote` (TJM) : plancher qui remplace l'autre pour une mission en full remote, plus haut ou plus bas. Si la section « Conditions » parle d'un TJM différent en full remote, **pose la question** et propose ce champ ;
- `baremes.teletravail` : la note selon le nombre de jours sur site (0 à 5) ;
- `regles` : ce qui doit mettre une offre à zéro ou la plafonner (stage, trajet, technologie rédhibitoire…) ;
- `exemples` : remplace les offres fictives par deux ou trois offres réelles qu'il juge bonnes, moyennes ou mauvaises, si possible ;
- `seuil` : la note à partir de laquelle une offre lui est présentée.

Après chaque modification, relis la grille (`grille`, ou `{{CMD}} grille --json`) : **l'inventaire doit avoir toutes les lignes de la section « Inventaire » de `_CONTEXTE.md`** (compte-les), et **recoupe avec la section « Conditions »** : télétravail, trajet, rémunération et règles doivent dire la même chose ; corrige l'un ou l'autre avec lui. Dis-lui qu'il pourra la faire évoluer en te le demandant ; s'il le souhaite, il peut aussi la régler lui-même dans le tableau de bord (« Réglages de la note » ; outil `ouvrir_tableau_de_bord`, ou `{{CMD}} serve` avec un terminal) : c'est facultatif.

## 7. Premier CV générique

1. Lis [`cv/LISEZMOI.md`](cv/LISEZMOI.md) et l'exemple [`cv/_exemple-structure.md`](cv/_exemple-structure.md).
2. Écris `cv/<Prénom>_<NOM>_CV-<Intitulé>.md` : sa cible principale, à partir de `_CONTEXTE.md` uniquement.
3. `{{CMD}} cv "cv/<fichier>.md" --capture` (outil Bash ; sinon l'outil MCP `generer_cv` avec `capture: true`) : vérifie **2 pages**, le remplissage de chaque page (une page 1 à moins de ~80 % signale un saut de page mal placé ; une dernière page à moitié vide, de la place perdue) et regarde l'image des pages (titre sur une ligne, coupure). Traite les avertissements avant de lui montrer le CV. S'il y a 3 pages, **propose les coupes** (en commençant par ce qui fait doublon avec les compétences) au lieu de les choisir seul : ne coupe jamais une preuve phare sans son accord. Si la coupure tombe mal, `<!-- saut-de-page -->` avant un titre `##` (voir `cv/LISEZMOI.md`).
4. Demande s'il a une photo à mettre (`cv/gabarit/portrait.jpg`) et s'il veut une autre mise en page (voir « Gabarit » dans `cv/LISEZMOI.md`). **Le gabarit est commun à tous ses CV** : pour un réglage propre à ce CV (un titre trop long, par exemple), raccourcis le texte ; ne modifie `gabarit.css` que s'il le demande, en le prévenant que cela vaut pour tous ses CV.
5. Après chaque série de corrections, **remontre le CV** (ce qui a changé, nombre de pages) et attends un « validé » explicite. Seulement alors, note le CV de référence dans la section « CV de référence » de `_CONTEXTE.md`.

## 8. Alertes e-mail

Explique comment alimenter le tri des offres :

1. Créer des alertes sur les sites d'emploi (LinkedIn, Indeed, Hellowork, Free-Work, Glassdoor…) avec ses mots-clés.
2. Faire arriver les alertes en `.eml` dans `emails/`. **Propose de l'automatiser maintenant**, c'est ce qui rend l'outil vraiment pratique : demande quelle messagerie il utilise et guide-le pas à pas avec [`procedures/alertes-automatiques.md`](procedures/alertes-automatiques.md) (Thunderbird et FiltaQuilla ; messagerie web ou Outlook : passer par Thunderbird). S'il préfère plus tard, note-le dans `_A-FAIRE.md` ; le glisser-déposer à la main reste possible.
3. Regarde tout de suite si `emails/` contient des `.eml` (`lister_fichiers` ou lecture du dossier). S'il y en a : propose de les traiter maintenant, c'est le but de tout ce qui précède. Sinon : propose à l'utilisateur d'y glisser dès maintenant quelques alertes déjà reçues, pour faire un premier tri ensemble avant de clore.

## 9. Fin

Résume ce qui est en place et ce qui reste dans `_A-FAIRE.md`, puis explique en quatre lignes la boucle de tous les jours : les alertes arrivent dans `emails/` → tu les tries et les notes → il donne ses « go » → tu prépares dossier, CV ciblé et message, **il envoie** → il te raconte la suite (envoi, réponse, entretien) et tu tiens le suivi et les relances. Termine par l'action suivante concrète (en général : traiter les e-mails), pas par « demande-moi plus tard ». S'il versionne l'espace avec git, propose un premier commit.
