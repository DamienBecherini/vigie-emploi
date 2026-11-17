# Using vigie-emploi with an AI (MCP server)

[Français](mcp.fr.md) · **English**

`vigie-emploi mcp` starts an [MCP](https://modelcontextprotocol.io) server on standard input / output (stdio transport). An AI (Claude Code, Claude Desktop or any MCP client) finds there the tools to ingest alerts, read, score, apply and generate the tracker, without going through the command line. The server calls the same core as the CLI and the dashboard; it calls no AI model itself.

The server is also enough for a client **with no file access and no terminal** (Claude Desktop): it creates the workspace, exposes the workspace's instructions as prompts, reads and writes the workspace's files and generates résumés as PDF (see "Claude Desktop" below).

The data folder is resolved as for the CLI: `--data <folder>`, otherwise `VIGIE_EMPLOI_DATA`, otherwise `vigie-emploi.config.json` (current folder, data folder or application root), otherwise, for the MCP server only, the default folder **`~/vigie-emploi`** (`C:\Users\<name>\vigie-emploi` on Windows). If that folder does not exist or is empty, the server starts anyway: the data tools answer "workspace not initialised" and the `initialize_workspace` tool creates it. The server keeps the database open while the client runs; the CLI and the dashboard can use it at the same time (5 s wait on a lock).

## Tools

| Tool | Role |
|---|---|
| `list_offers` | Paged list, same filters as `vigie-emploi list` (statuses, min / max score, unscored, sources, tags, text, dates, contract, remote work, applications, sorting on one or more levels: `received_at:desc,score:desc`) |
| `read_offer` | Full detail: description, scores, status history, tags, application |
| `offers_to_read` | Unscored ads to process, with `reading` = `description`, `browser` or `human` |
| `rubric` | Current scoring grid: criteria and weights, scales, blocking rules, inventory, examples (with their computed score), threshold, scoring instructions |
| `score_offer` | One score (by `id`, or by `url`: the ad is created if needed): `criteria`, `inputs`, `blockers`; the final score is computed and returned with its breakdown |
| `score_batch` | Several scores in the batch format, all or nothing; `dry_run: true` computes without saving |
| `update_rubric` | Partial change to the grid (weights, threshold, scales, rules, inventory) with a summary; `dry_run: true` for a preview; `restore_version`; returns the impact (scores that change, ads that cross the threshold) |
| `rescore` | Recomputes criteria-based scores with the current grid |
| `rubric_history` | Versions of the grid (date, author, summary) |
| `change_status` | Status + comment (kept in the history) |
| `update_tags` | Add / remove tags |
| `update_link` | Link of the ad (or `null` to clear it) |
| `apply` | Moves to `go`, returns the ad, the data folder, a suggested folder and the steps |
| `save_application` | Folder, résumé, channel, date sent, message, next action; with a date sent, the ad moves to `sent` |
| `add_event` | Dated event in the journal (message, interview, test, offer, decision, note); dated in the future and not done, it is a deadline |
| `update_event` | Corrects an event (missing field unchanged, `null` clears) |
| `journal` | Journal of an ad: deadlines first, then from newest to oldest |
| `deadlines` | Overdue deadlines and those coming up within N days (7 by default), all ads |
| `mark_done` | Marks a deadline as done (or reopens it) |
| `folder_files` | Files of the application folder (paths to cite in an event) |
| `ingest_emails` | First fetches the mailbox if it is configured (see the README), then reads the `.eml` files in `emails/` and deletes them (unless `keep: true`); `to_tell` says what was fetched, or why the mailbox was not |
| `generate_tracker` | Writes `candidatures/_SUIVI.genere.md` (preview), or `_SUIVI.md` with `replace: true` |

Workspace, files and résumés (for a client with no file access and no terminal):

| Tool | Role |
|---|---|
| `workspace_state` | Workspace folder, initialised or not, onboarding done or not, browser found for PDFs, template installed |
| `initialize_workspace` | Creates the workspace (like `vigie-emploi init`) in the server's folder or the one chosen by the user, then settles there |
| `list_files` | Contents of a workspace folder, 1 to 4 levels deep |
| `read_file` | Text as is; PDF: text extracted page by page; Word (`.docx`): text; image: `image` content |
| `write_file` | Creates or replaces a text file (`.md`, `.txt`, `.json`, `.csv`, `.yml`, `.css`), parent folders included; returns `existed`; `create_only: true` refuses to overwrite |
| `move_file` | Moves or renames a file, never overwriting |
| `generate_cv` | Markdown résumé → PDF next to it, with the workspace's template; page count, `pdf_existed`; `capture: true` attaches a PNG image of the rendering |
| `count` | Characters and words of each copy-and-paste block of a text or a file |
| `list_templates`, `choose_template` | Bundled résumé templates; installed in `cv/gabarit` (the previous one is kept) |
| `open_dashboard` | Starts the dashboard in the background if it is not already running, and returns its address (`open: true` opens it in the default browser); see "Dashboard without a terminal" |

**Safety of the file tools**: every path is relative to the workspace (an absolute path is accepted only if it is inside the workspace); `..`, hidden files and folders (`.mcp.json`, `.git`…), `data/` (the database, which only changes through the application's tools) and symbolic links leading outside the workspace are refused. No tool deletes a file; writing is limited to text files.

### Prompts and resource

The workspace's instructions are read again from disk on every call (the user or the AI may edit them):

| Prompt | Contents |
|---|---|
| `onboarding` | `AGENTS.md` then `DEMARRAGE.md`: first interview or resumption. Without a workspace, it asks the AI to create it first (`initialize_workspace`) |
| `process-emails` | `AGENTS.md` then `procedures/traiter-emails.md` |
| `prepare-go` | `AGENTS.md` then `procedures/preparer-go.md` |
| `targeted-cv` | `AGENTS.md` then `procedures/cv-cible.md` (optional `offer` argument) |

The resource `vigie-emploi://espace/AGENTS.md` gives the general instructions alone; the server's `instructions` point to them.

Errors (ad not found, score out of scale, invalid link…) come back to the AI as a readable error result; the server keeps running.

## Claude Code

A `.mcp.json` file at the root of the data folder (or of the project you work in):

```json
{
  "mcpServers": {
    "vigie-emploi": { "command": "vigie-emploi", "args": ["mcp"] }
  }
}
```

`init` writes this file itself. Tested on Windows 11 with Claude Code: the three forms below connect and expose the 33 tools.

| Form | `command` / `args` | When to use it |
|---|---|---|
| Command alone | `"vigie-emploi"`, `["mcp"]` | Claude Code (it finds the `vigie-emploi.cmd` from `npm link`) |
| Through `cmd` | `"cmd"`, `["/c", "vigie-emploi", "mcp"]` | Windows clients that start the program without a shell |
| Node directly | `"node"`, `["C:/path/vigie-emploi/bin/vigie-emploi.js", "mcp"]` | Anywhere, without `npm link`; the most robust form |

Started without a shell (`child_process.spawn('vigie-emploi')`), `vigie-emploi` alone fails on Windows (`ENOENT`: npm creates a `.cmd`, not an `.exe`); hence the two other forms for generic clients.

To force the data folder: add `"--data", "D:/path/data"` to `args`, or `"env": { "VIGIE_EMPLOI_DATA": "D:/path/data" }`.

From the command line: `claude mcp add vigie-emploi -- vigie-emploi mcp` (local scope), or `claude mcp add --scope project …` to write `.mcp.json`. On first launch, Claude Code asks you to approve a server declared in `.mcp.json`.

## Claude Desktop

Claude Desktop has no file access and no terminal: everything goes through the server, including creating the workspace and opening the dashboard. No command to type.

### One-click extension (recommended)

**1. Install**: double-click `vigie-emploi-<version>.mcpb` (or drag it into the Claude Desktop window, or Settings → Extensions → Advanced settings → Install extension…). Claude Desktop shows the tools and asks for two settings:

- **Workspace folder**: by default `vigie-emploi` in your home folder. It need not exist yet. Avoid a synced folder (OneDrive, Dropbox…): the SQLite database is easily damaged there;
- **Language**: `fr` or `en` (AI instructions, dashboard, tracker).

To change them later: Settings → Extensions → vigie-emploi → Configure.

**2. Start**: see step 2 below (`onboarding` prompt).

The extension contains the compiled application and its dependencies; Claude Desktop runs it with its built-in Node (Node 24.22 in Claude Desktop 5.11492, November 2026), which includes `node:sqlite`. The manifest requires Node 24 or later (`compatibility.runtimes.node`): should the built-in Node ever be older, Claude Desktop would use a recent enough system `node`, and failing that the server stops with a clear message ("install Node 24 or later"), visible in the extension's log.

**If you had declared the server by hand** (next section): remove that entry from `claude_desktop_config.json` before installing the extension, otherwise Claude will have two `vigie-emploi` servers with identical tools.

Building the extension: `npm run mcpb` in the repository (see the README).

### Declaring it by hand

**1. Declare the server** in `claude_desktop_config.json` (Settings → Developer → Edit config):

- Windows, standard installation: `%APPDATA%\Claude\claude_desktop_config.json`;
- Windows, Microsoft Store installation: Claude Desktop keeps its data in `%LOCALAPPDATA%\Claude-Data\claude_<identifier>\claude_desktop_config.json` (for example `claude_pzs8sxrjxfjjc`); the menu above opens the right file;
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`.

```json
{
  "mcpServers": {
    "vigie-emploi": {
      "command": "node",
      "args": ["C:/path/vigie-emploi/bin/vigie-emploi.js", "mcp"],
      "env": { "VIGIE_EMPLOI_DATA": "C:/Users/you/vigie-emploi", "VIGIE_EMPLOI_LANGUAGE": "en" }
    }
  }
}
```

`command`: `node` must be found in the `PATH`; otherwise, its full path (`C:/Program Files/nodejs/node.exe`, `/usr/local/bin/node` or `/opt/homebrew/bin/node` on macOS). `args`: the path of the application's `bin/vigie-emploi.js`, with forward slashes. `env.VIGIE_EMPLOI_DATA`: your workspace folder; without it, the server uses `~/vigie-emploi`. Claude Desktop's current folder is not reliable: always give the folder through `env` (or `"--data", "<folder>"` in `args`). `env.VIGIE_EMPLOI_LANGUAGE`: `en` for the texts shown to you in English (the language written in the workspace's `vigie-emploi.config.json` otherwise applies). Restart Claude Desktop (quit completely, not just close the window) after each change.

**2. Start**: in a new conversation, "+" button → vigie-emploi → **`onboarding`** prompt. If the workspace does not exist yet, the AI offers to create it (`initialize_workspace`, in the configured folder or the one you choose), then asks you to drop your résumé and the PDF export of your LinkedIn profile into `a-deposer/` with the file explorer. If you choose a folder other than the configured one, copy it into the extension's "Workspace folder" setting (or into `VIGIE_EMPLOI_DATA`): otherwise the next session will start again from the configured folder.

**3. Alerts**: for the application to fetch your job alerts itself, ask "open my dashboard", then the **"Mailbox"** button: address, password (typed in the page, never in the conversation), alerts folder. See "Automating alert intake" in the README.

**4. Then**: prompts `process-emails`, `prepare-go` and `targeted-cv`, or simply your requests in plain words ("process the emails", "resume the onboarding"). Résumés are generated by `generate_cv`; the AI sees the rendering (capture) and gives you the path of the PDF. You send the applications yourself.

**Dashboard without a terminal**: ask "open my dashboard". The `open_dashboard` tool checks `/api/health` on the workspace's port (4410 by default); if this workspace's dashboard is not running, it starts it (`vigie-emploi serve --idle 60`) in a separate process, detached from the MCP server: it survives a restart of the server and stops by itself after 60 minutes without activity. Port taken by something else: it tries the next nine. The tool returns the address to click; with `open: true`, it opens it in the default browser. This needs a `node` 24 or later in the `PATH` (Claude Desktop's built-in Node cannot start a separate process); without it, the dashboard runs inside the MCP server's process and stops with Claude Desktop.

Limits: the AI does not read LinkedIn, Indeed or Glassdoor (no browser in Claude Desktop without an extension): paste the text of the ads when it asks. A scanned PDF, with no text, cannot be read: drag it straight into the conversation.

## Generic client

Any stdio MCP client works: run `node <path>/bin/vigie-emploi.js mcp [--data <folder>]` and exchange JSON-RPC over stdin / stdout (one message per line). stdout carries only the protocol; the application's messages ("vigie-emploi MCP ready") go to stderr. Example with the TypeScript SDK:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'my-client', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['C:/path/vigie-emploi/bin/vigie-emploi.js', 'mcp'] }));
const r = await client.callTool({ name: 'offers_to_read', arguments: { limit: 10 } });
```

Official inspector, to try the tools by hand: `npx @modelcontextprotocol/inspector node bin/vigie-emploi.js mcp --data <folder>`.

## Typical flow

See [`AGENTS.en.md`](../AGENTS.en.md): ingest → read → read the grid (`rubric`) → score the criteria (`score_batch`) → apply → record the application → keep the journal (events, deadlines) → generate the tracker.
