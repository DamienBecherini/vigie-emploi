-- Sprint 4 : grille de notation transparente et réglable.
-- La grille vit dans <données>/profil/grille.json (version courante) ; chaque enregistrement en garde
-- une version ici (historique, restauration). La note finale est calculée par l'application.

CREATE TABLE grilles (
  version INTEGER PRIMARY KEY,
  contenu TEXT NOT NULL,                       -- grille complète, JSON validé (schéma Zod de src/core/grille.ts)
  le      TEXT NOT NULL,
  auteur  TEXT NOT NULL CHECK (auteur IN ('interface', 'cli', 'mcp', 'fichier')),
  resume  TEXT NOT NULL
);

-- Notes à critères : valeur exacte (la colonne note garde l'arrondi au demi-point, celui qu'on affiche et filtre),
-- saisie d'origine (sous-notes de l'IA ou de l'interface, données d'entrée, règles bloquantes signalées)
-- et décomposition calculée (sous-notes, poids, contributions, règles appliquées, drapeaux).
-- Une note sans saisie est une note globale de l'ancienne grille : elle reste figée.
ALTER TABLE notes ADD COLUMN note_exacte REAL;
ALTER TABLE notes ADD COLUMN saisie TEXT;
ALTER TABLE notes ADD COLUMN decomposition TEXT;
-- Date du dernier recalcul (changement de grille), la note gardant sa date de saisie.
ALTER TABLE notes ADD COLUMN recalculee_le TEXT;
