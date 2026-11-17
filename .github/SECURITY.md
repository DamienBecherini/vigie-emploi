# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub: **Security** tab → **Report a vulnerability** ([direct link](https://github.com/DamienBecherini/vigie-emploi/security/advisories/new)).

Include what you found, how to reproduce it, and what an attacker could do with it. You will get an answer within a week. Once a fix is published, the advisory is made public and credits you, unless you prefer otherwise.

## Supported versions

Only the latest published version (npm `vigie-emploi@latest`, latest GitHub release) receives fixes.

## Scope

vigie-emploi runs on the user's own machine: the dashboard listens on `127.0.0.1` only, the data stays in the workspace folder, and the mailbox password is kept by the system (DPAPI, macOS keychain, Secret Service). Of particular interest:

- access to the local API or to the workspace's files from a web page or from another machine;
- reading of `data/` or `emails/`, or of files outside the workspace, through the dashboard or the MCP file tools;
- leaks of the mailbox password;
- code execution through the content of job ads or e-mails (dashboard, résumé rendering, ingestion).

---

**En français** : pour signaler une faille, n'ouvrez pas d'issue publique ; utilisez l'onglet **Security** → **Report a vulnerability** du dépôt. Réponse sous une semaine ; seule la dernière version publiée reçoit des corrections.
