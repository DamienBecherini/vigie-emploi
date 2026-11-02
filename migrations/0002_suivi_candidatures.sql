-- Sprint 2 : informations du suivi des candidatures (_SUIVI.md généré depuis la base).

-- Prochaine action à mener, et qui l'a écrite (import-suivi, cli, interface, mcp) :
-- la reprise de _SUIVI.md ne remplace pas un texte saisi ailleurs.
ALTER TABLE candidatures ADD COLUMN prochaine_action TEXT;
ALTER TABLE candidatures ADD COLUMN prochaine_action_origine TEXT;
-- Cellule « Offre » du suivi, en Markdown sans les liens : « **Entreprise** (précision) — Intitulé ».
ALTER TABLE candidatures ADD COLUMN libelle TEXT;
-- Cellule « Type » du suivi : contrat, lieu, rémunération, télétravail en texte libre.
ALTER TABLE candidatures ADD COLUMN conditions TEXT;
-- Cellule « Statut » (ou « Issue » pour les closes) reprise du suivi, en Markdown. Elle n'est réécrite
-- dans le suivi généré que tant que le dernier statut de l'offre est celui de la reprise.
ALTER TABLE candidatures ADD COLUMN etat TEXT;
ALTER TABLE candidatures ADD COLUMN maj_le TEXT;
