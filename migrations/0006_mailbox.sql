-- IMAP fetch: last message fetched per mailbox and folder (UIDVALIDITY + UID, RFC 3501 § 2.3.1.1).
CREATE TABLE mailbox_state (
  account       TEXT NOT NULL,
  folder        TEXT NOT NULL,
  uid_validity  TEXT NOT NULL,
  last_uid      INTEGER NOT NULL,
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (account, folder)
);
