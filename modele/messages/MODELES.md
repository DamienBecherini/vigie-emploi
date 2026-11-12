# Modèles de messages

Des **trames**, pas des textes à recopier : l'IA les remplit avec l'offre, le dossier de candidature et `_CONTEXTE.md`, puis les adapte au ton de l'utilisateur. Un message générique se voit ; un message qui reprend les mots de l'offre et y répond par des preuves se lit.

## Règles communes

- **Limite du canal** : celle qu'affiche le formulaire fait foi (compteur sous le champ). Mesurer avec `{{CMD}} compter <fichier>` et indiquer la longueur dans le dossier. Repères : formulaire Indeed (dont la « candidature facile » Glassdoor) jusqu'à 4 000 caractères ; une note d'invitation LinkedIn est très courte (quelques centaines de caractères au plus) ; un premier message sur une plateforme freelance gagne à tenir sur un écran de téléphone.
- **Structure** : une accroche qui répond à l'offre (pas « je me permets de… ») ; deux ou trois preuves tirées de `_CONTEXTE.md`, chiffrées si possible ; les écarts assumés en une phrase s'ils sautent aux yeux ; les conditions (disponibilité, télétravail, rémunération si le canal s'y prête) ; une fin qui propose la suite (un échange, un créneau).
- **Honnêteté** : rien qui ne soit revendicable dans `_CONTEXTE.md`. Pas de superlatifs sans preuve.
- **Format** : texte brut, sans Markdown (les formulaires ne le rendent pas). Le donner à l'utilisateur au format « texte à copier-coller » d'`AGENTS.md` ; garder dans le dossier la version envoyée.
- **Vouvoiement** avec un recruteur ou un client, sauf si l'annonce tutoie.

## 1. Candidature par formulaire (CDI ou mission, message joint au CV)

```
Bonjour,

{Accroche : ce que l'offre cherche, en ses mots, et en une phrase pourquoi c'est mon terrain.}

{Preuve 1 : réalisation qui répond à l'exigence principale, avec un chiffre.}
{Preuve 2 : réalisation qui répond à une autre exigence ou au contexte (secteur, taille, méthode).}
{Écart éventuel, assumé : « Je n'ai pas encore travaillé avec X ; je l'aborde comme Y, que j'ai pris en main en Z. »}

{Conditions : disponibilité, télétravail ou lieu, contrat.}

{Fin : « Je serais ravi d'en parler lors d'un premier échange. » + prénom NOM, téléphone.}
```

## 2. Réponse à une mission freelance (Malt, Free-Work, plateforme ou e-mail)

```
Bonjour {prénom si connu},

{Reformulation courte du besoin, pour montrer qu'il est compris, et une question ou un point d'attention qui prouve l'expérience.}

{Une ou deux missions comparables : contexte, ce que j'ai livré, résultat.}

{Proposition : disponibilité, rythme (jours / semaine), télétravail ou sur site, TJM ou « à préciser après un échange » selon le canal.}

{Fin : proposer un appel de 20 minutes cette semaine.}
```

## 3. Message à un recruteur ou à un cabinet (LinkedIn, e-mail)

```
Bonjour {prénom},

{Pourquoi lui : l'offre ou le poste vu, ou le secteur qu'il recrute.}
{Qui je suis en une phrase : métier, années, spécialité, preuve principale.}
{Ce que je cherche : type de poste, contrat, lieu ou télétravail, disponibilité.}

{Fin : CV en pièce jointe ou lien, proposition d'échange.}
```

## 4. Relance après envoi (sans réponse, délai de la section « Conditions », sinon 7 jours)

```
Bonjour {prénom ou « Madame, Monsieur »},

Je reviens vers vous au sujet de ma candidature au poste de {intitulé}, envoyée le {date}.
{Un élément nouveau ou une précision utile, en une phrase, s'il y en a un.}
Le poste m'intéresse toujours ; je reste disponible pour un échange {disponibilités}.

{Prénom NOM}
```

## 5. Remerciement après un entretien (le jour même ou le lendemain)

```
Bonjour {prénom},

Merci pour l'échange de {jour} sur le poste de {intitulé}.
{Un point précis de la discussion et ce qu'il confirme de mon intérêt.}
{Si une question est restée en suspens : la réponse, en deux phrases.}

Je reste à votre disposition pour la suite.
{Prénom NOM}
```

## 6. Lettre de motivation (seulement si le formulaire l'exige)

Une page, même matière que le message 1, en trois paragraphes : ce que l'offre cherche et pourquoi c'est mon terrain ; deux réalisations qui le prouvent ; ce que j'apporte à cette équipe-là et la suite proposée. En-tête avec coordonnées, date, destinataire si connu.
