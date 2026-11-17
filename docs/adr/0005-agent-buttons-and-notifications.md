# ADR 0005 — "Agent" buttons and push notifications

**English** · [Français](0005-agent-buttons-and-notifications.fr.md)

Date: 12/11/2026 · Status: accepted

## Context

Triaging the e-mails and preparing the applications are done in a dialogue with an agent (Claude Code) in a terminal: the user types "traite les e-mails" (process the e-mails), the agent ingests, reads, scores, then waits for their "go". The user wants to start this work from the dashboard, at the moment there is something to do, and to see the offers change while the agent works, without reloading the page.

Two options for launching:

1. The server runs the agent in the background (`claude -p`) and shows its progress.
2. The server opens a terminal in which the agent starts with the right command; the conversation continues in that terminal.

## Decisions

1. **Option 2: open a terminal.** The flow ends with a decision by the user ("go", messages to rework, sendings announced): they need the conversation. An agent in the background would have no one to accept a permission (everything would have to be allowed in advance), would connect poorly to the Chrome extension that reading the offers requires, and would require handling progress, errors and cancellation in the application. The application still makes no call to a model: it types the command in place of the user.
2. **Pending work** (`GET /api/travail`, `src/api/travail.ts`): number of `.eml` files in the inbox, offers in `go` whose application folder does not exist (no application, folder empty or missing from the disk). The interface shows one button per kind of work, above the filters, only if there is any.
3. **Launching** (`POST /api/travail/traiter-emails` and `/preparer-go`): actions from a closed list, fixed prompt (`/traiter-emails`, `/preparer-go`: commands that the data folder must provide to the agent). Adjustable terminal command (`terminal` in the configuration, `{dossier}` and `{invite}` replaced); by default on Windows: `wt.exe -d <données> claude <invite>`; elsewhere, an explicit error that gives the command to type. The button is disabled for a few seconds after a launch (double click).
4. **Writes from another origin refused.** Checking the host (`localhost`) does not protect against a form posted by a third-party page: any write request whose `Origin` header is not local, or that is marked `Sec-Fetch-Site: cross-site`, is refused (403). Launching also requires `Content-Type: application/json` (impossible from a form without a CORS preflight request). The CLI, the MCP server and the tests send no `Origin`: unchanged.
5. **Push notifications rather than periodic polling** (`GET /api/flux`, Server-Sent Events, `src/api/diffusion.ts`):
   - the database is written by other processes (CLI, the agent's MCP server, git): the server watches the database folder (`fs.watch`, database and journal file), groups a burst of writes (300 ms), then compares `PRAGMA data_version`, which only changes if another connection has committed a write; it emits `base` only in that case;
   - its own writes (API) do not change `data_version` for its connection: the server emits `base` after each successful write request (useful to the other tabs);
   - the inbox is watched in the same way: `emails` with the number of `.eml` files when it changes;
   - the interface reloads all its queries on `base`, the state of the work on `emails`, and everything after a reconnection (changes may have been missed during the outage).
6. **Automatic shutdown unchanged**: the stream, like the health check, does not count as activity; a comment is sent every 25 s to keep the connection open.

## Consequences

- During a triage in the terminal, the offers change status on screen as the agent records them; the "Traiter" (process) button disappears when the ingestion deletes the e-mails.
- Outside Windows, the buttons require setting `terminal` (e.g. `["gnome-terminal", "--working-directory={dossier}", "--", "claude", "{invite}"]`).
- `fs.watch` depends on the file system: on a network share, notifications may be missed; the "Rafraîchir" (refresh) button is still there.
