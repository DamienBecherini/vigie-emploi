-- English schema: tables, columns, stored values and the keys of the stored JSON (scores.input,
-- scores.breakdown, rubrics.content) renamed. New tables are created and filled from the old ones, which are
-- then dropped, children first (no ON DELETE CASCADE can fire: nothing references the old tables any more).

CREATE TABLE offers (
  id                INTEGER PRIMARY KEY,
  source            TEXT NOT NULL,             -- linkedin, indeed, glassdoor, hellowork, free-work, register, tracker, manual…
  site_id           TEXT NOT NULL,             -- id of the offer on its site (deduplication)
  canonical_url     TEXT,
  title             TEXT NOT NULL DEFAULT '',
  company           TEXT,
  location          TEXT,
  contract          TEXT,
  compensation      TEXT,
  compensation_min  REAL,
  compensation_max  REAL,
  compensation_unit TEXT CHECK (compensation_unit IN ('year', 'month', 'day', 'hour')),
  remote            TEXT,
  published_at      TEXT,
  received_at       TEXT,
  description       TEXT,
  stack             TEXT,
  origin            TEXT NOT NULL CHECK (origin IN ('email', 'import-batch', 'import-register', 'import-tracker', 'manual')),
  status            TEXT NOT NULL DEFAULT 'new',
  score             REAL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (source, site_id)
);
INSERT INTO offers (id, source, site_id, canonical_url, title, company, location, contract, compensation, compensation_min,
                    compensation_max, compensation_unit, remote, published_at, received_at, description, stack, origin,
                    status, score, created_at, updated_at)
SELECT id, CASE source WHEN 'registre' THEN 'register' WHEN 'suivi' THEN 'tracker' WHEN 'manuel' THEN 'manual' ELSE source END, id_site, url_canonique, titre, entreprise, lieu, contrat, remuneration,
       remuneration_min, remuneration_max, CASE remuneration_unite WHEN 'an' THEN 'year' WHEN 'mois' THEN 'month' WHEN 'jour' THEN 'day' WHEN 'heure' THEN 'hour' ELSE remuneration_unite END, teletravail, publiee_le, recue_le,
       description, stack, CASE origine WHEN 'import-lot' THEN 'import-batch' WHEN 'import-registre' THEN 'import-register' WHEN 'import-suivi' THEN 'import-tracker' WHEN 'manuel' THEN 'manual' ELSE origine END, CASE statut WHEN 'nouvelle' THEN 'new' WHEN 'a-lire' THEN 'to-read' WHEN 'notee' THEN 'scored' WHEN 'ecartee' THEN 'dismissed' WHEN 'envoyee' THEN 'sent' WHEN 'relancee' THEN 'followed-up' WHEN 'entretien' THEN 'interview' WHEN 'refus' THEN 'rejected' WHEN 'close' THEN 'closed' WHEN 'abandonnee' THEN 'withdrawn' ELSE statut END, note, cree_le, maj_le
FROM offres;

CREATE TABLE scores (
  id               INTEGER PRIMARY KEY,
  offer_id         INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  raw_score        REAL,
  penalties        TEXT,
  score            REAL,
  fit              TEXT,
  gaps             TEXT,
  read             INTEGER NOT NULL DEFAULT 0,
  rubric_version   TEXT,
  origin           TEXT NOT NULL DEFAULT 'cli',  -- cli, import-batch, import-register, import-tracker, interface, mcp
  scored_at        TEXT NOT NULL,
  exact_score      REAL,
  input            TEXT,
  breakdown        TEXT,
  recalculated_at  TEXT
);
INSERT INTO scores (id, offer_id, raw_score, penalties, score, fit, gaps, read, rubric_version, origin, scored_at, exact_score,
                    input, breakdown, recalculated_at)
SELECT id, offre_id, note_brute, penalites, note, colle, ecarts, lu, grille_version, CASE origine WHEN 'import-lot' THEN 'import-batch' WHEN 'import-registre' THEN 'import-register' WHEN 'import-suivi' THEN 'import-tracker' WHEN 'manuel' THEN 'manual' ELSE origine END, notee_le,
       note_exacte, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(saisie, '"plancher_full_remote":', '"floor_full_remote":'), '"salaire_provenance":', '"salary_origin":'), '"jours_provenance":', '"days_origin":'), '"bloquants_ignores":', '"ignored_blockers":'), '"poids_normalise":', '"normalized_weight":'), '"grille_version":', '"rubric_version":'), '"jours_sur_site":', '"onsite_days":'), '"note_exacte":', '"exact_score":'), '"cible_basse":', '"target_low":'), '"cible_haute":', '"target_high":'), '"salaire_min":', '"salary_min":'), '"salaire_max":', '"salary_max":'), '"commentaire":', '"comment":'), '"inventaire":', '"inventory":'), '"consignes":', '"instructions":'), '"entreprise":', '"company":'), '"bloquants":', '"blockers":'), '"inconnue":', '"unknown":'), '"inconnu":', '"unknown":'), '"criteres":', '"criteria":'), '"critere":', '"criterion":'), '"exemples":', '"examples":'), '"drapeaux":', '"flags":'), '"plancher":', '"floor":'), '"salaire":', '"salary":'), '"moyenne":', '"average":'), '"libelle":', '"label":'), '"origine":', '"origin":'), '"baremes":', '"scales":'), '"entrees":', '"inputs":'), '"niveau":', '"level":'), '"techno":', '"technology":'), '"valeur":', '"value":'), '"regles":', '"rules":'), '"calcul":', '"computation":'), '"effet":', '"effect":'), '"actif":', '"active":'), '"poids":', '"weight":'), '"seuil":', '"threshold":'), '"titre":', '"title":'), '"unite":', '"unit":'), '"note":', '"score":'), '"nom":', '"name":'), '"tjm":', '"daily_rate":'), '"source":"ia"', '"source":"ai"'), '"source":"calcul"', '"source":"computation"'), '"origin":"ia"', '"origin":"ai"'), '"origin":"calcul"', '"origin":"computation"'), '"origin":"neutre"', '"origin":"neutral"'), '"computation":"teletravail"', '"computation":"remote"'), '"computation":"remuneration"', '"computation":"compensation"'), '"reference":"milieu"', '"reference":"middle"'), '"level":"fort"', '"level":"strong"'), '"level":"moyen"', '"level":"medium"'), '"level":"leger"', '"level":"light"'), '"effect":"plafond_critere"', '"effect":"criterion_cap"'), '"effect":"plafond"', '"effect":"cap"'), '"unit":"an"', '"unit":"year"'), '"unit":"mois"', '"unit":"month"'), '"unit":"jour"', '"unit":"day"'), '"unit":"heure"', '"unit":"hour"'), '"days_origin":"saisie"', '"days_origin":"input"'), '"days_origin":"offre"', '"days_origin":"offer"'), '"salary_origin":"saisie"', '"salary_origin":"input"'), '"salary_origin":"offre"', '"salary_origin":"offer"'), '"code":"teletravail_inconnu"', '"code":"remote_unknown"'), '"code":"remuneration_inconnue"', '"code":"compensation_unknown"'), '"code":"sous_plancher"', '"code":"sub_floor"'), '"code":"critere_manquant:', '"code":"criterion_missing:'),
       replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(decomposition, '"plancher_full_remote":', '"floor_full_remote":'), '"salaire_provenance":', '"salary_origin":'), '"jours_provenance":', '"days_origin":'), '"bloquants_ignores":', '"ignored_blockers":'), '"poids_normalise":', '"normalized_weight":'), '"grille_version":', '"rubric_version":'), '"jours_sur_site":', '"onsite_days":'), '"note_exacte":', '"exact_score":'), '"cible_basse":', '"target_low":'), '"cible_haute":', '"target_high":'), '"salaire_min":', '"salary_min":'), '"salaire_max":', '"salary_max":'), '"commentaire":', '"comment":'), '"inventaire":', '"inventory":'), '"consignes":', '"instructions":'), '"entreprise":', '"company":'), '"bloquants":', '"blockers":'), '"inconnue":', '"unknown":'), '"inconnu":', '"unknown":'), '"criteres":', '"criteria":'), '"critere":', '"criterion":'), '"exemples":', '"examples":'), '"drapeaux":', '"flags":'), '"plancher":', '"floor":'), '"salaire":', '"salary":'), '"moyenne":', '"average":'), '"libelle":', '"label":'), '"origine":', '"origin":'), '"baremes":', '"scales":'), '"entrees":', '"inputs":'), '"niveau":', '"level":'), '"techno":', '"technology":'), '"valeur":', '"value":'), '"regles":', '"rules":'), '"calcul":', '"computation":'), '"effet":', '"effect":'), '"actif":', '"active":'), '"poids":', '"weight":'), '"seuil":', '"threshold":'), '"titre":', '"title":'), '"unite":', '"unit":'), '"note":', '"score":'), '"nom":', '"name":'), '"tjm":', '"daily_rate":'), '"source":"ia"', '"source":"ai"'), '"source":"calcul"', '"source":"computation"'), '"origin":"ia"', '"origin":"ai"'), '"origin":"calcul"', '"origin":"computation"'), '"origin":"neutre"', '"origin":"neutral"'), '"computation":"teletravail"', '"computation":"remote"'), '"computation":"remuneration"', '"computation":"compensation"'), '"reference":"milieu"', '"reference":"middle"'), '"level":"fort"', '"level":"strong"'), '"level":"moyen"', '"level":"medium"'), '"level":"leger"', '"level":"light"'), '"effect":"plafond_critere"', '"effect":"criterion_cap"'), '"effect":"plafond"', '"effect":"cap"'), '"unit":"an"', '"unit":"year"'), '"unit":"mois"', '"unit":"month"'), '"unit":"jour"', '"unit":"day"'), '"unit":"heure"', '"unit":"hour"'), '"days_origin":"saisie"', '"days_origin":"input"'), '"days_origin":"offre"', '"days_origin":"offer"'), '"salary_origin":"saisie"', '"salary_origin":"input"'), '"salary_origin":"offre"', '"salary_origin":"offer"'), '"code":"teletravail_inconnu"', '"code":"remote_unknown"'), '"code":"remuneration_inconnue"', '"code":"compensation_unknown"'), '"code":"sous_plancher"', '"code":"sub_floor"'), '"code":"critere_manquant:', '"code":"criterion_missing:'),
       recalculee_le
FROM notes;

CREATE TABLE statuses (
  id       INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  status   TEXT NOT NULL CHECK (status IN ('new', 'to-read', 'scored', 'dismissed', 'go', 'sent', 'followed-up',
                                           'interview', 'rejected', 'closed', 'withdrawn')),
  comment  TEXT,
  origin   TEXT NOT NULL DEFAULT 'cli',       -- cli, ingest, interface, mcp, import-batch, import-register, import-tracker
  at       TEXT NOT NULL
);
INSERT INTO statuses (id, offer_id, status, comment, origin, at)
SELECT id, offre_id, CASE statut WHEN 'nouvelle' THEN 'new' WHEN 'a-lire' THEN 'to-read' WHEN 'notee' THEN 'scored' WHEN 'ecartee' THEN 'dismissed' WHEN 'envoyee' THEN 'sent' WHEN 'relancee' THEN 'followed-up' WHEN 'entretien' THEN 'interview' WHEN 'refus' THEN 'rejected' WHEN 'close' THEN 'closed' WHEN 'abandonnee' THEN 'withdrawn' ELSE statut END, CASE commentaire WHEN 'candidater' THEN 'apply' WHEN 'bouton candidater' THEN 'apply button' ELSE commentaire END,
       CASE origine WHEN 'import-lot' THEN 'import-batch' WHEN 'import-registre' THEN 'import-register' WHEN 'import-suivi' THEN 'import-tracker' WHEN 'manuel' THEN 'manual' ELSE origine END, le
FROM statuts;

CREATE TABLE tags_new (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
INSERT INTO tags_new (id, name) SELECT id, nom FROM tags;

CREATE TABLE offer_tags (
  offer_id INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags_new (id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, tag_id)
);
INSERT INTO offer_tags (offer_id, tag_id) SELECT offre_id, tag_id FROM offre_tags;

CREATE TABLE applications (
  id                 INTEGER PRIMARY KEY,
  offer_id           INTEGER NOT NULL UNIQUE REFERENCES offers (id) ON DELETE CASCADE,
  folder             TEXT,                     -- relative to the data folder
  cv                 TEXT,
  sent_at            TEXT,
  channel            TEXT,
  message            TEXT,
  next_action        TEXT,
  next_action_origin TEXT,                     -- import-tracker, cli, interface, mcp
  label              TEXT,
  conditions         TEXT,
  state              TEXT,
  updated_at         TEXT
);
INSERT INTO applications (id, offer_id, folder, cv, sent_at, channel, message, next_action, next_action_origin, label,
                          conditions, state, updated_at)
SELECT id, offre_id, dossier, cv, envoyee_le, canal, message, prochaine_action, CASE prochaine_action_origine WHEN 'import-lot' THEN 'import-batch' WHEN 'import-registre' THEN 'import-register' WHEN 'import-suivi' THEN 'import-tracker' WHEN 'manuel' THEN 'manual' ELSE prochaine_action_origine END,
       libelle, conditions, etat, maj_le
FROM candidatures;

CREATE TABLE ingestions_new (
  id         INTEGER PRIMARY KEY,
  at         TEXT NOT NULL,
  files      INTEGER NOT NULL,
  added      INTEGER NOT NULL,
  duplicates INTEGER NOT NULL,
  dismissed  INTEGER NOT NULL,
  errors     INTEGER NOT NULL
);
INSERT INTO ingestions_new (id, at, files, added, duplicates, dismissed, errors)
SELECT id, le, fichiers, nouvelles, doublons, ecartees, erreurs FROM ingestions;

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  offer_id   INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('message', 'interview', 'test', 'proposal', 'decision', 'note')),
  -- For a message: sent by the user or received (optional).
  direction  TEXT CHECK (direction IN ('sent', 'received')),
  -- YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time). A future date not done is a deadline.
  at         TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 1 CHECK (done IN (0, 1)),
  summary    TEXT NOT NULL,
  details    TEXT,
  channel    TEXT,
  contacts   TEXT,
  amount     REAL,
  unit       TEXT,                           -- € HT, €/d, K€/year…
  days       REAL,                           -- length of a quote, in days
  files      TEXT NOT NULL DEFAULT '[]',     -- JSON array of paths relative to the data folder
  origin     TEXT NOT NULL CHECK (origin IN ('interface', 'cli', 'mcp', 'import')),
  -- Folder import: fingerprint of the source line (idempotence), null otherwise.
  import_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
INSERT INTO events (id, offer_id, type, direction, at, done, summary, details, channel, contacts, amount, unit, days, files,
                    origin, import_key, created_at, updated_at)
SELECT id, offre_id, CASE type WHEN 'entretien' THEN 'interview' WHEN 'proposition' THEN 'proposal' ELSE type END, CASE sens WHEN 'envoye' THEN 'sent' WHEN 'recu' THEN 'received' ELSE sens END, le, fait, resume, details, canal, interlocuteurs, montant,
       unite, jours, fichiers, origine,
       CASE WHEN cle_import LIKE 'suivi:%' THEN 'tracker:' || substr(cle_import, 7)
            WHEN cle_import LIKE 'revue:%' THEN 'seen:' || substr(cle_import, 7)
            ELSE cle_import END,
       cree_le, maj_le
FROM evenements;

CREATE TABLE rubrics (
  version INTEGER PRIMARY KEY,
  content TEXT NOT NULL,                      -- full rubric, validated JSON (Zod schema of src/core/rubric.ts)
  at      TEXT NOT NULL,
  author  TEXT NOT NULL CHECK (author IN ('interface', 'cli', 'mcp', 'file')),
  summary TEXT NOT NULL
);
INSERT INTO rubrics (version, content, at, author, summary)
SELECT version, replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(contenu, '"plancher_full_remote":', '"floor_full_remote":'), '"salaire_provenance":', '"salary_origin":'), '"jours_provenance":', '"days_origin":'), '"bloquants_ignores":', '"ignored_blockers":'), '"poids_normalise":', '"normalized_weight":'), '"grille_version":', '"rubric_version":'), '"jours_sur_site":', '"onsite_days":'), '"note_exacte":', '"exact_score":'), '"cible_basse":', '"target_low":'), '"cible_haute":', '"target_high":'), '"salaire_min":', '"salary_min":'), '"salaire_max":', '"salary_max":'), '"commentaire":', '"comment":'), '"inventaire":', '"inventory":'), '"consignes":', '"instructions":'), '"entreprise":', '"company":'), '"bloquants":', '"blockers":'), '"inconnue":', '"unknown":'), '"inconnu":', '"unknown":'), '"criteres":', '"criteria":'), '"critere":', '"criterion":'), '"exemples":', '"examples":'), '"drapeaux":', '"flags":'), '"plancher":', '"floor":'), '"salaire":', '"salary":'), '"moyenne":', '"average":'), '"libelle":', '"label":'), '"origine":', '"origin":'), '"baremes":', '"scales":'), '"entrees":', '"inputs":'), '"niveau":', '"level":'), '"techno":', '"technology":'), '"valeur":', '"value":'), '"regles":', '"rules":'), '"calcul":', '"computation":'), '"effet":', '"effect":'), '"actif":', '"active":'), '"poids":', '"weight":'), '"seuil":', '"threshold":'), '"titre":', '"title":'), '"unite":', '"unit":'), '"note":', '"score":'), '"nom":', '"name":'), '"tjm":', '"daily_rate":'), '"teletravail":{', '"remote":{'), '"remuneration":{', '"compensation":{'), '"source":"ia"', '"source":"ai"'), '"source":"calcul"', '"source":"computation"'), '"origin":"ia"', '"origin":"ai"'), '"origin":"calcul"', '"origin":"computation"'), '"origin":"neutre"', '"origin":"neutral"'), '"computation":"teletravail"', '"computation":"remote"'), '"computation":"remuneration"', '"computation":"compensation"'), '"reference":"milieu"', '"reference":"middle"'), '"level":"fort"', '"level":"strong"'), '"level":"moyen"', '"level":"medium"'), '"level":"leger"', '"level":"light"'), '"effect":"plafond_critere"', '"effect":"criterion_cap"'), '"effect":"plafond"', '"effect":"cap"'), '"unit":"an"', '"unit":"year"'), '"unit":"mois"', '"unit":"month"'), '"unit":"jour"', '"unit":"day"'), '"unit":"heure"', '"unit":"hour"'), '"days_origin":"saisie"', '"days_origin":"input"'), '"days_origin":"offre"', '"days_origin":"offer"'), '"salary_origin":"saisie"', '"salary_origin":"input"'), '"salary_origin":"offre"', '"salary_origin":"offer"'), '"code":"teletravail_inconnu"', '"code":"remote_unknown"'), '"code":"remuneration_inconnue"', '"code":"compensation_unknown"'), '"code":"sous_plancher"', '"code":"sub_floor"'), '"code":"critere_manquant:', '"code":"criterion_missing:'), le, CASE auteur WHEN 'fichier' THEN 'file' ELSE auteur END, resume FROM grilles;

-- Old objects, children first.
DROP VIEW echeances;
DROP TRIGGER offres_fts_ai;
DROP TRIGGER offres_fts_ad;
DROP TRIGGER offres_fts_au;
DROP TABLE offres_fts;
DROP TABLE evenements;
DROP TABLE notes;
DROP TABLE statuts;
DROP TABLE offre_tags;
DROP TABLE candidatures;
DROP TABLE grilles;
DROP TABLE offres;
DROP TABLE tags;
DROP TABLE ingestions;
ALTER TABLE tags_new RENAME TO tags;
ALTER TABLE ingestions_new RENAME TO ingestions;

CREATE INDEX offers_score ON offers (score);
CREATE INDEX offers_received_at ON offers (received_at);
CREATE INDEX offers_published_at ON offers (published_at);
CREATE INDEX offers_status ON offers (status);
CREATE INDEX offers_source ON offers (source);
CREATE INDEX offers_updated_at ON offers (updated_at);
CREATE INDEX offers_company ON offers (company COLLATE NOCASE);
CREATE INDEX scores_offer ON scores (offer_id, scored_at);
CREATE INDEX statuses_offer ON statuses (offer_id, at);
CREATE INDEX offer_tags_tag ON offer_tags (tag_id);
CREATE INDEX events_deadlines ON events (at, done);
CREATE INDEX events_offer ON events (offer_id, at);
CREATE UNIQUE INDEX events_import ON events (offer_id, import_key) WHERE import_key IS NOT NULL;

-- Deadlines: events not done yet (upcoming or overdue), with their offer.
CREATE VIEW deadlines AS
SELECT e.*, o.title, o.company, o.status
FROM events e JOIN offers o ON o.id = e.offer_id
WHERE e.done = 0;

-- Full-text search (accents ignored).
CREATE VIRTUAL TABLE offers_fts USING fts5 (
  title, company, description, stack,
  content = 'offers', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
INSERT INTO offers_fts (offers_fts) VALUES ('rebuild');

CREATE TRIGGER offers_fts_ai AFTER INSERT ON offers BEGIN
  INSERT INTO offers_fts (rowid, title, company, description, stack)
  VALUES (new.id, new.title, new.company, new.description, new.stack);
END;

CREATE TRIGGER offers_fts_ad AFTER DELETE ON offers BEGIN
  INSERT INTO offers_fts (offers_fts, rowid, title, company, description, stack)
  VALUES ('delete', old.id, old.title, old.company, old.description, old.stack);
END;

CREATE TRIGGER offers_fts_au AFTER UPDATE OF title, company, description, stack ON offers BEGIN
  INSERT INTO offers_fts (offers_fts, rowid, title, company, description, stack)
  VALUES ('delete', old.id, old.title, old.company, old.description, old.stack);
  INSERT INTO offers_fts (rowid, title, company, description, stack)
  VALUES (new.id, new.title, new.company, new.description, new.stack);
END;
