# Procédure : CV ciblé

Le **contenu** vient de l'offre, du dossier de candidature et de `_CONTEXTE.md`. La **mise en page** est décrite dans [`../cv/LISEZMOI.md`](../cv/LISEZMOI.md).

1. Partir de l'annonce et du dossier, pas d'un autre CV : ne jamais transposer le discours d'un CV ciblé vers une autre cible. Le CV de référence (section « CV de référence » de `_CONTEXTE.md`) sert de base de faits.
2. Écrire `cv/<Prénom>_<NOM>_CV-cible-<Entreprise>-<Poste>.md` : titre avec les mots de l'annonce, résumé et compétences réordonnés selon ce que l'offre demande, réalisations qui y répondent. Une mission freelance met en avant les preuves clients ; un CDI, les compétences et réalisations.
3. Vérifier chaque ligne contre l'inventaire et les interdits de `_CONTEXTE.md`. Une compétence prouvée s'écrit sans précaution ; ce qui n'est pas revendicable n'apparaît pas, même reformulé.
4. `{{CMD}} cv "cv/<fichier>.md" --capture` (ou `generer_cv` avec `capture: true`) : **2 pages**, le remplissage de chaque page et ses avertissements (saut de page mal placé, dernière page trop vide) à corriger, puis regarder l'image des pages. Au-delà de 2 pages, couper du texte ; ne pas réduire la police ni toucher au gabarit.
5. Ne jamais écraser un PDF déjà envoyé : nouvelle version avec le suffixe « V2 ».
6. **Le gabarit (`cv/gabarit/gabarit.css`) est commun à tous les CV** : ne le modifier qu'à la demande de l'utilisateur, en le prévenant que le changement vaut pour tous ses CV.
