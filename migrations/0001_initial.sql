-- Schéma initial de vigie-emploi.
-- Les colonnes offres.statut et offres.note reprennent la dernière ligne de statuts / notes
-- (dénormalisées pour trier et filtrer vite sur des dizaines de milliers d'offres).

CREATE TABLE offres (
  id                 INTEGER PRIMARY KEY,
  source             TEXT NOT NULL,              -- linkedin, indeed, glassdoor, hellowork, free-work, registre, suivi, manuel…
  id_site            TEXT NOT NULL,              -- identifiant de l'offre sur le site (dédoublonnage)
  url_canonique      TEXT,
  titre              TEXT NOT NULL DEFAULT '',
  entreprise         TEXT,
  lieu               TEXT,
  contrat            TEXT,
  remuneration       TEXT,
  remuneration_min   REAL,
  remuneration_max   REAL,
  remuneration_unite TEXT CHECK (remuneration_unite IN ('an', 'mois', 'jour', 'heure')),
  teletravail        TEXT,
  publiee_le         TEXT,
  recue_le           TEXT,
  description        TEXT,
  stack              TEXT,
  origine            TEXT NOT NULL CHECK (origine IN ('email', 'import-lot', 'import-registre', 'import-suivi', 'manuel')),
  statut             TEXT NOT NULL DEFAULT 'nouvelle',
  note               REAL,
  cree_le            TEXT NOT NULL,
  maj_le             TEXT NOT NULL,
  UNIQUE (source, id_site)
);

CREATE INDEX offres_note ON offres (note);
CREATE INDEX offres_recue_le ON offres (recue_le);
CREATE INDEX offres_publiee_le ON offres (publiee_le);
CREATE INDEX offres_statut ON offres (statut);
CREATE INDEX offres_source ON offres (source);
CREATE INDEX offres_maj_le ON offres (maj_le);
CREATE INDEX offres_entreprise ON offres (entreprise COLLATE NOCASE);

CREATE TABLE notes (
  id             INTEGER PRIMARY KEY,
  offre_id       INTEGER NOT NULL REFERENCES offres (id) ON DELETE CASCADE,
  note_brute     REAL,
  penalites      TEXT,
  note           REAL,
  colle          TEXT,
  ecarts         TEXT,
  lu             INTEGER NOT NULL DEFAULT 0,
  grille_version TEXT,
  origine        TEXT NOT NULL DEFAULT 'cli',  -- cli, import-lot, import-registre, interface
  notee_le       TEXT NOT NULL
);
CREATE INDEX notes_offre ON notes (offre_id, notee_le);

CREATE TABLE statuts (
  id          INTEGER PRIMARY KEY,
  offre_id    INTEGER NOT NULL REFERENCES offres (id) ON DELETE CASCADE,
  statut      TEXT NOT NULL CHECK (statut IN ('nouvelle', 'a-lire', 'notee', 'ecartee', 'go', 'envoyee', 'relancee',
                                              'entretien', 'refus', 'close', 'abandonnee')),
  commentaire TEXT,
  origine     TEXT NOT NULL DEFAULT 'cli',     -- cli, ingest, interface, import-lot, import-registre, import-suivi
  le          TEXT NOT NULL
);
CREATE INDEX statuts_offre ON statuts (offre_id, le);

CREATE TABLE tags (
  id  INTEGER PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE offre_tags (
  offre_id INTEGER NOT NULL REFERENCES offres (id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (offre_id, tag_id)
);
CREATE INDEX offre_tags_tag ON offre_tags (tag_id);

CREATE TABLE candidatures (
  id         INTEGER PRIMARY KEY,
  offre_id   INTEGER NOT NULL UNIQUE REFERENCES offres (id) ON DELETE CASCADE,
  dossier    TEXT,                             -- chemin relatif au dossier de données
  cv         TEXT,
  envoyee_le TEXT,
  canal      TEXT,
  message    TEXT
);

CREATE TABLE ingestions (
  id        INTEGER PRIMARY KEY,
  le        TEXT NOT NULL,
  fichiers  INTEGER NOT NULL,
  nouvelles INTEGER NOT NULL,
  doublons  INTEGER NOT NULL,
  ecartees  INTEGER NOT NULL,
  erreurs   INTEGER NOT NULL
);

-- Recherche plein texte (accents ignorés).
CREATE VIRTUAL TABLE offres_fts USING fts5 (
  titre, entreprise, description, stack,
  content = 'offres', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER offres_fts_ai AFTER INSERT ON offres BEGIN
  INSERT INTO offres_fts (rowid, titre, entreprise, description, stack)
  VALUES (new.id, new.titre, new.entreprise, new.description, new.stack);
END;

CREATE TRIGGER offres_fts_ad AFTER DELETE ON offres BEGIN
  INSERT INTO offres_fts (offres_fts, rowid, titre, entreprise, description, stack)
  VALUES ('delete', old.id, old.titre, old.entreprise, old.description, old.stack);
END;

CREATE TRIGGER offres_fts_au AFTER UPDATE OF titre, entreprise, description, stack ON offres BEGIN
  INSERT INTO offres_fts (offres_fts, rowid, titre, entreprise, description, stack)
  VALUES ('delete', old.id, old.titre, old.entreprise, old.description, old.stack);
  INSERT INTO offres_fts (rowid, titre, entreprise, description, stack)
  VALUES (new.id, new.titre, new.entreprise, new.description, new.stack);
END;
