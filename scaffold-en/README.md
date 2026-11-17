# My job search

Workspace created by **vigie-emploi**: an AI (Claude Code, Cursor, Codex…) helps you here to sort job ads, prepare honest applications and keep track of your exchanges.

## Getting started

1. Drop your CV and the PDF export of your LinkedIn profile into [`a-deposer/`](a-deposer/) (the drop folder).
2. Open your AI in this folder and paste the starting prompt printed when the workspace was created, or simply: "Read AGENTS.md and DEMARRAGE.md, then start the onboarding."
3. Answer its questions: it fills in your context, your job-ad scoring grid and a first CV, which you approve.

## What is in here

The file and folder names stay in French: the application expects them.

| Path | Purpose |
|---|---|
| `_CONTEXTE.md` | What the AI knows about you: positioning, facts, what you can and cannot claim. The AI's entry point. |
| `_A-FAIRE.md`, `_JOURNAL-DECISIONS.md` | Pending tasks, decision log. |
| `AGENTS.md` (and `CLAUDE.md`) | The AI's working instructions; `DEMARRAGE.md`: the onboarding. |
| `a-deposer/` | Your starting documents (CV, LinkedIn export…). |
| `profil/grille.json` | Your job-ad scoring grid (criteria, weights, pay floor…). |
| `cv/` | Your CVs in Markdown and their PDFs; `cv/gabarit/` = the layout. |
| `candidatures/` | One folder per job ad (ad, fit, messages, follow-up) and `_SUIVI.md`, the generated tracker. |
| `emails/` | Job alert e-mails (`.eml`) to sort: fetched from your mailbox if you connected it, or dropped by hand. |
| `profils-publics/` | The state of your public profiles (LinkedIn, Malt…). |
| `messages/` | Message outlines: application, freelance bid, recruiter, follow-up, thank-you. |
| `procedures/` | The procedures the AI follows (sorting e-mails, preparing applications, targeted CV). |
| `data/` | The database of job ads and applications. |

## Useful commands

The application's command (run it from this folder):

```
{{CMD}} serve      dashboard in the browser
{{CMD}} cv "cv/<name>.md"
                   CV as a PDF (shows the page count)
{{CMD}} mail setup connects your mailbox (folder of the alerts; also with the "Mailbox" button of the dashboard)
{{CMD}} ingest     fetches the mailbox, then reads the job alert e-mails in emails/
```

Tip: put this folder under version control with git (`git init`), so you can get back an earlier version of a CV or a message.
