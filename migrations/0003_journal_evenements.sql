-- Sprint 3 : journal des candidatures (événements datés) et échéances.
-- La base sait ce qui s'est passé et quand ; les documents restent dans le dossier de candidature :
-- un événement n'en garde que le chemin (relatif au dossier de données), jamais le contenu.

CREATE TABLE evenements (
  id             INTEGER PRIMARY KEY,
  offre_id       INTEGER NOT NULL REFERENCES offres (id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('message', 'entretien', 'test', 'proposition', 'decision', 'note')),
  -- Pour un message : envoyé par l'utilisateur ou reçu (facultatif).
  sens           TEXT CHECK (sens IN ('envoye', 'recu')),
  -- AAAA-MM-JJ ou AAAA-MM-JJTHH:MM (heure locale). Une date future non faite est une échéance.
  le             TEXT NOT NULL,
  fait           INTEGER NOT NULL DEFAULT 1 CHECK (fait IN (0, 1)),
  resume         TEXT NOT NULL,
  details        TEXT,
  canal          TEXT,
  interlocuteurs TEXT,
  montant        REAL,
  unite          TEXT,                         -- € HT, €/j, K€/an…
  jours          REAL,                         -- durée d'un devis, en jours
  fichiers       TEXT NOT NULL DEFAULT '[]',   -- tableau JSON de chemins relatifs au dossier de données
  origine        TEXT NOT NULL CHECK (origine IN ('interface', 'cli', 'mcp', 'import')),
  -- Reprise des dossiers : empreinte de la ligne d'origine (idempotence), null sinon.
  cle_import     TEXT,
  cree_le        TEXT NOT NULL,
  maj_le         TEXT
);
CREATE INDEX evenements_echeances ON evenements (le, fait);
CREATE INDEX evenements_offre ON evenements (offre_id, le);
CREATE UNIQUE INDEX evenements_import ON evenements (offre_id, cle_import) WHERE cle_import IS NOT NULL;

-- Échéances : événements pas encore faits (à venir ou en retard), avec l'offre.
CREATE VIEW echeances AS
SELECT e.*, o.titre, o.entreprise, o.statut
FROM evenements e JOIN offres o ON o.id = e.offre_id
WHERE e.fait = 0;

-- Correction : une offre déjà suivie (go et au-delà) revue dans un lot, le registre ou une alerte ne change
-- plus de statut. Même règle que recalculer() dans src/core/offres.ts.
UPDATE offres SET statut = COALESCE((
  SELECT s.statut FROM statuts s WHERE s.offre_id = offres.id
  ORDER BY (s.origine IN ('ingest', 'import-lot', 'import-registre')
            AND s.statut IN ('nouvelle', 'a-lire', 'notee', 'ecartee')
            AND EXISTS (SELECT 1 FROM statuts s2 WHERE s2.offre_id = s.offre_id
                        AND s2.statut IN ('go', 'envoyee', 'relancee', 'entretien', 'refus', 'close', 'abandonnee'))),
           s.le DESC, s.id DESC
  LIMIT 1), 'nouvelle');
