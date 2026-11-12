# CV

Les CV s'écrivent en Markdown, un fichier par CV, puis se convertissent en PDF A4 :

```
{{CMD}} cv "cv/<nom>.md"
```

Sans terminal (client MCP seul), l'outil `generer_cv` fait la même chose. Le PDF est écrit à côté du `.md` ; la commande affiche le nombre de pages et le remplissage de chacune, mesuré sur le PDF (`PAGES : 2 (remplissage : 96 %, 58 %)`), avec un avertissement si une page suivie d'une autre est remplie à moins de 80 % (saut de page mal placé) ou si la dernière l'est à moins de 50 %. **Cible : 2 pages bien remplies.** S'il y en a 3, couper du texte plutôt que réduire la police.

- `cv/<Prénom>_<NOM>_CV-<Intitulé>.md` : le CV générique validé au démarrage.
- `cv/<Prénom>_<NOM>_CV-cible-<Entreprise>-<Poste>.md` : un CV ciblé par offre, quand l'offre le justifie.
- Ne jamais écraser un PDF déjà envoyé : nouvelle version avec le suffixe « V2 ».
- [`_exemple-structure.md`](_exemple-structure.md) : un CV fictif qui montre la structure attendue.

## Structure attendue

1. `# Prénom NOM`
2. Le titre visé en `**gras**` (reprendre les mots de l'offre), puis un sous-titre en `*(italique)*`.
3. Les coordonnées, une à quatre lignes, éléments séparés par « · » : disponibilité, e-mail, téléphone, site ; puis la ville ; puis les profils (`[LinkedIn](…) · [GitHub](…)`). Le convertisseur les range seul en trois rangées : contacts, adresse, profils.
4. `## Résumé`, puis les sections dans l'ordre voulu.
5. `## Expérience Professionnelle` : un poste = `### dates · lieu`, puis une première ligne en **gras** (l'intitulé du poste), puis le texte ou une liste.
6. Les sections dont le titre contient *compétences*, *formations*, *certifications* ou *langues* (ou *skills*, *education*, *languages*) passent en deux colonnes : y mettre des listes courtes.
7. Saut de page manuel, si la coupure tombe mal : une ligne `<!-- saut-de-page -->` juste avant le titre `##` de la section à renvoyer en page 2. Vérifier ensuite qu'on reste à 2 pages.

## Gabarit

Le gabarit est dans [`gabarit/`](gabarit/) : `gabarit.css`, les polices, et une photo facultative (`portrait.jpg`, `.png` ou `.webp`). Pour changer l'apparence :

- choisir un autre gabarit livré : `{{CMD}} gabarits` (outil `lister_gabarits`) les liste (« sobre » à empattements, « moderne » avec bandeau de couleur, « compact » sur une colonne), `{{CMD}} gabarit <nom>` (outil `choisir_gabarit`) l'installe ; l'ancien est gardé dans `cv/gabarit-<date>/` et la photo est reprise ;

- demander à l'IA : « adapte `cv/gabarit/gabarit.css` à ce modèle » en lui donnant une capture ou un PDF du rendu voulu ; elle modifie la feuille, régénère le CV et vérifie les 2 pages ;
- ou modifier `gabarit.css` soi-même (couleur d'accent, police, marges).

Contrôle visuel : `--capture` (outil : `capture: true`) produit une image PNG des vraies pages du PDF, l'une sous l'autre (dans `cv/gabarit/apercu/`).
