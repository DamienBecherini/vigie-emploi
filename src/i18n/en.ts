// English texts of the CLI, the API, the generated tracker and the initialization (same keys as fr.ts).
import type { KeyServer } from './fr.ts';
import type { Plural, MessageText } from './tool.ts';

const p = (one: string, other: string): Plural => ({ one, other });

export const en: Record<KeyServer, MessageText> = {
  'cli.help': `vigie-emploi — job offers, scores and applications (local SQLite database)

Usage: vigie-emploi <command> [options]

Command and option names, statuses and event types are the same in every language (they are typed by the AI):
for example "list --status sent", "event 12 --type interview".

Commands
  init [folder] [--port 4410] [--mcp-name vigie-emploi] [--template plain|modern|compact] [--language fr|en]
                        Creates a workspace (~/vigie-emploi when no folder is given; templates, résumé template, sample grid, config, .mcp.json)
                        and prints the starting prompt to give the AI; --language: language of the dashboard,
                        the CLI and the tracking file (fr by default)
  count <file>          Character count of each copy-paste message in the file (blocks between
                        "──── start …" and "──── end …"), or of the whole file if it has none
  templates             Bundled résumé templates (plain, modern, compact…)
  template <name>       Installs this template in the workspace's cv/gabarit (the old one is kept next to it)
  cv <cv.md>… [--template <folder>] [--capture]
                        Markdown résumé -> A4 PDF next to the .md, with the page count (target: 2).
                        Template: --template, else the workspace's cv/gabarit/, else the application's;
                        --capture: PNG image of the rendering in <template>/apercu/ (visual check)
  ingest [--keep] [--no-fetch] [--no-mail] [--emails <folder>]
                        Reads the .eml files of the inbox, adds the new offers,
                        then deletes the processed e-mails (unless --keep); fetches the mailbox first when one
                        is configured (--no-mail: do not fetch it)
  mail [setup|status|fetch|forget]
                        Mailbox read over IMAP (folder where a filter files the job alerts): setup asks for
                        the address, the password (kept in the system keychain, never in the workspace) and
                        the folder; options --address, --host, --port, --insecure, --folder, --since-days 14,
                        --no-mark-seen, --password-stdin. fetch: fetches without ingesting
  import-history        Imports candidatures/_lots/*.json, _ecartees.md and _SUIVI.md if they exist (idempotent)
  list [filters]        Paginated list of offers
      --status a,b  --score-min N  --score-max N  --unscored  --source s1,s2  --tag t
      --from YYYY-MM-DD  --until YYYY-MM-DD (date received)  --text "words"
      --contract CDI  --remote remote  --applications  --page N  --size N
      --sort score|received_at|published_at|title|company|…  --order asc|desc
      --sort received_at:desc,score:desc  (several levels: date, then score for equal dates)
  show <id>             Offer details (scores, statuses, tags, application)
  to-read [--limit N] [--full]
                        Offers to process without a score, with the URL to read (or the description already extracted)
  score <id> --json '{"criteria": {"technique": {"score": 8, "justification": "…"}, …}, "inputs": {…}, "blockers": [], "fit": "…"}'
  score --file lot.json [--dry-run]
                        Records scores (batch format). With "criteria", the score is computed with the
                        grid (see "rubric"); without, it is an overall score (old grid).
                        --dry-run: computes and prints without saving anything
  rubric [--instructions] [--json]
                        Current scoring grid: criteria, weights, scales, rules, inventory, examples
  rubric --history | --version N | --restore N [--summary "…"] | --init
  rubric --update '{"weight": {"technique": 40}, …}' --summary "…" [--dry-run]
                        Partial change (weight, threshold, scales, rules, inventory); recomputes the scores
  rescore               Recomputes all criterion-based scores with the current grid
  status <id> <status> [--comment "…"]
                        Statuses: {statuses}
  tag <id> +add -remove
  link <id> <url|->     Records (or clears with -) the offer link
  apply <id>            Moves the offer to "go" and prints everything needed to prepare the application
  application <id> [--folder d] [--cv f] [--channel c] [--sent-at DD/MM/YYYY] [--message m]
                   [--next-action "…"]
                        Records the application (empty option "" clears a field);
                        with --sent-at, the offer moves to "sent"
  next-action <id> "text"
                        Next action of the application ("" or - to clear it)
  event <id> --type {types} [--at "DD/MM/YYYY HH:MM"] --summary "…"
                   [--direction sent|received] [--channel c] [--contacts "…"] [--details "…"]
                   [--amount 3000 --unit "€"] [--days 6] [--file candidatures/x/quote.md]…
                   [--done | --no-done]
                        Adds an event to the application journal; dated in the future (and not done),
                        it is a deadline. --at defaults to now; "tomorrow" and "+3" accepted
  journal <id>          Application journal (deadlines first, then newest to oldest)
  deadlines [--days 7]  Overdue deadlines and those due within N days
  done <event_id> [--no-done]
                        Marks a deadline as done (--no-done: reopen it)
  files <id>            Files of the application folder (paths to quote in --file)
  stats                 Applications by stage (sent, reply, interview, offer), reply delay
  generate-tracker [--output <file>] [--replace]
                        Generates the application tracking file from the database: by default
                        candidatures/_SUIVI.genere.md (preview); --replace writes candidatures/_SUIVI.md
  serve [--port 4410] [--idle <minutes>]
                        Starts the dashboard (http://localhost:4410); --idle: stops by itself after that idle time
  mcp                   MCP server (stdio transport) to drive vigie-emploi from an AI; without a configured
                        folder: ~/vigie-emploi, created if needed by the initialize_workspace tool

General options
  --data <folder>       Data folder (else VIGIE_EMPLOI_DATA or vigie-emploi.config.json)
  --config <file>       Configuration file
  --json                JSON output (all commands)

Language: "language" key of vigie-emploi.config.json (fr or en) or VIGIE_EMPLOI_LANGUAGE variable.
`,

  'cli.error': 'Error: {message}',
  'cli.commandUnknown': 'Unknown command: {command}',
  'cli.invalid': 'Invalid {name}: {value}',
  'cli.offerNotFound': 'Offer {id} not found',
  'cli.statusUnknown': 'Unknown status: {status}',
  'cli.statusExpected': 'Status expected among: {statuses}',
  'cli.none': 'none',

  'cli.detail.status': 'Status: {status} · Score: {score} · Source: {source} ({site_id})',
  'cli.detail.url': 'URL: {url}',
  'cli.detail.remote': 'remote work: {value}',
  'cli.detail.dates': 'Received {received} · published {published}',
  'cli.detail.stack': 'Stack: {stack}',
  'cli.detail.tags': 'Tags: {tags}',
  'cli.detail.scoreRubric': 'Score {score} (grid v{version}, exact {exact}) on {at}',
  'cli.detail.scoreOld': 'Score {score} (old grid; raw {raw}{penalties}) on {at}',
  'cli.detail.penalties': ', penalties: {penalties}',
  'cli.detail.fit': 'What fits: {text}',
  'cli.detail.gaps': 'Gaps: {text}',
  'cli.detail.application': 'Application: {info}',
  'cli.detail.sentAt': 'sent on {date}',
  'cli.detail.nextAction': 'Next action: {text}',
  'cli.detail.journal': 'Journal:',
  'cli.detail.history': 'Status history:',
  'cli.detail.description': 'Description:',

  'cli.breakdown.neutral': '(neutral) ',
  'cli.breakdown.main': '(manual) ',
  'cli.breakdown.average': 'Weighted average',
  'cli.breakdown.rule': 'Rule: {label} → {effect}{withoutEffect}',
  'cli.breakdown.cap': 'cap {value}',
  'cli.breakdown.withoutEffect': ' (no effect)',
  'cli.breakdown.ignored': 'Rule ignored (unknown or disabled): {rule}',
  'cli.breakdown.score': 'Score: {exact} → {score}',
  'cli.impact.summary': '{recalculated} criterion-based offer(s) recomputed, {changed} with a changed score.',
  'cli.impact.rising': 'Now above the threshold {threshold} ({n}):',
  'cli.impact.falling': 'Back below the threshold {threshold} ({n}):',

  'cli.journal.overdue': 'OVERDUE',
  'cli.journal.toDo': 'to do',
  'cli.journal.empty': '  (empty journal)',

  'cli.ingest.summary':
    '{files} e-mail(s), {offers} offer(s): {added} new ({withDescription} with a description, {toRead} to read in the browser), {duplicates} duplicate(s), {dismissed} discarded by title.',
  'cli.ingest.kept': 'E-mails kept (--keep).',
  'cli.ingest.deleted': '{n} e-mail(s) deleted.',
  'cli.ingest.dismissed': '  discarded #{id} {title} ({pattern})',
  'cli.ingest.error': '  error {file}: {message}',
  'cli.ingest.withoutOffer': '  no offer recognised, e-mail kept: {file}',
  'cli.ingest.acknowledgment': '  application acknowledgement (not an alert): {subject}{suite}',
  'cli.ingest.offerMissing': ' → offer not in the database',
  'cli.ingest.suite': 'Next: vigie-emploi to-read',
  'cli.ingest.mail': 'Mailbox: {n} e-mail(s) fetched from "{folder}".',
  'cli.ingest.mailMore': 'Mailbox: more messages are waiting; they will come with the next ingestion.',
  'cli.ingest.mailError': 'Mailbox not fetched: {message}',
  'cli.mail.notTty': 'Cannot type the password outside a terminal: use --password-stdin.',
  'cli.mail.cancelled': 'Cancelled.',
  'cli.mail.noConfigFile': 'No vigie-emploi.config.json file: create the workspace first (vigie-emploi init).',
  'cli.mail.askAddress': 'E-mail address:',
  'cli.mail.addressRequired': 'E-mail address required (--address).',
  'cli.mail.oauth':
    '{name} no longer accepts passwords over IMAP (Microsoft sign-in required), which is not supported yet. Meanwhile: forward your alerts to another mailbox, or drop the e-mails in emails/.',
  'cli.mail.askHost': 'IMAP server (e.g. imap.example.com):',
  'cli.mail.hostRequired': 'IMAP server required (--host).',
  'cli.mail.provider': '{name}: {host}, port {port}.',
  'cli.mail.appPassword': '{name} needs an "app password" (16 characters), not the account password. Create it here; two-step verification must be on: {help}',
  'cli.mail.askPassword': 'Password (nothing shows while you type):',
  'cli.mail.passwordRequired': 'Empty password.',
  'cli.mail.folders': 'Folders of the mailbox:',
  'cli.mail.askFolder': 'Folder of the alerts (number or name):',
  'cli.mail.folderRequired': 'Folder required (--folder).',
  'cli.mail.folderUnknown': 'No folder "{folder}" in the mailbox. Folders: {folders}',
  'cli.mail.saved':
    'Mailbox saved: folder "{folder}" fetched at each ingestion (settings in {file}, password: {backend}). Remember the filter of your mailbox that files the job alerts in this folder.',
  'cli.mail.notConfigured': 'No mailbox configured (vigie-emploi mail setup).',
  'cli.mail.status': 'Mailbox: {user} on {host}:{port}, folder "{folder}"\nPassword: {password}\nLast fetch: {fetched}',
  'cli.mail.passwordYes': 'stored ({backend})',
  'cli.mail.passwordNo': 'missing (vigie-emploi mail setup)',
  'cli.mail.never': 'never',
  'cli.mail.fetched': '{n} e-mail(s) fetched from "{folder}", dropped in {inbox}. Next: vigie-emploi ingest',
  'cli.mail.more': 'More messages are waiting: fetch again.',
  'cli.mail.forgotten': 'Mailbox forgotten: settings and password removed (the messages stay in the mailbox).',
  'cli.mail.subUnknown': 'Unknown subcommand "{sub}": setup, status, fetch or forget.',

  'cli.import.batches': 'Batches: {files} file(s), {inputs} item(s), {offers} offer(s) created, {scores} score(s).',
  'cli.import.register':
    'Register: {lines} line(s), {offers} offer(s) including {created} created ({withoutLink} without a link), {statuses} status(es), {scores} score(s), {corrected} company name(s) corrected.',
  'cli.import.trackerIgnore': 'Tracking file: not read ({reason}).',
  'cli.import.tracker': 'Tracking file: {lines} line(s), {offers} offer(s) created, {applications} application(s), {statuses} status(es).',
  'cli.import.journals':
    'Journals: {folders} folder(s), {lines} dated line(s), {created} event(s) created, {existing} already in the database, {duplicate} already entered by hand, {removed} removed, {deadlines} deadline(s); types: {types}.',
  'cli.import.attached': '  folder linked to offer #{offer}: {folder}',
  'cli.import.withoutOffer': '  folder without an offer in the database: {folder}',
  'cli.import.withoutTracker': '  folder without dated tracking: {folder}',
  'cli.import.untyped': 'Untyped journal lines, imported as notes ({n}):',
  'cli.import.withoutDate': 'Journal lines without a date, not imported ({n}):',
  'cli.import.merge': '  duplicate merged: #{duplicate} → #{offer} ({company})',
  'cli.import.unrecognized': 'Unrecognised lines ({n}):',
  'cli.import.linksNotRecognized': 'Unrecognised links ({n}):',

  'cli.list.headers': 'id|score|status|source|received|company|title',
  'cli.list.footer': 'Page {page}/{pages} · {total} offer(s)',
  'cli.toRead.none': 'No offer to read.',
  'cli.toRead.description': 'description extracted',
  'cli.toRead.browser': 'to read in the browser',
  'cli.toRead.human': 'protected page: ask for the text',
  'cli.toRead.withoutUrl': '(no URL)',
  'cli.toRead.total': '{n} offer(s) to process. JSON details (descriptions included): vigie-emploi to-read --json',
  'cli.score.expected': "score: --json '{...}' or --file lot.json expected",
  'cli.score.oneSingle': 'score <id>: a single score expected',

  'cli.rubric.copied': 'Sample grid copied to {path} (version 1): adapt it.',
  'cli.rubric.exists': 'A grid already exists: {path}',
  'cli.rubric.version': 'Version {version}: {summary}',
  'cli.rubric.summaryExpected': 'rubric --update: --summary "…" expected (or --dry-run for a preview)',
  'cli.rubric.jsonInvalid': 'rubric --update: invalid JSON ({message})',
  'cli.rubric.saved': 'Version {version} saved.',
  'cli.rubric.dry_run': 'Trial: nothing is saved.',
  'cli.rubric.title': '{name} — version {version} of {at} ({author}): {summary}',
  'cli.rubric.file': 'File: {path} · “worth a look” threshold: {threshold}',
  'cli.rubric.criteria': 'Criteria (normalised weights):',
  'cli.rubric.ai': 'AI',
  'cli.rubric.computation': 'computed',
  'cli.rubric.remote': 'Remote work (0 to 5 days on site): {days}; unknown {unknown}',
  'cli.rubric.compensation':
    'Pay ({reference}): salary floor {floor}K, target {low}-{high}K a year; day rate floor {daily_rate}{fullRemote}, target {tjmLow}-{tjmHigh} a day; unknown {unknown}',
  'cli.rubric.fullRemote': ' ({value} fully remote)',
  'cli.rubric.rules': 'Blocking rules:',
  'cli.rubric.inventory': 'Inventory:',
  'cli.rubric.examples': 'Reference examples:',
  'cli.rubric.instructions': 'Instructions for the AI:',
  'cli.rescore': 'Grid v{version}.',

  'cli.tag.prefix': 'tag: prefix each tag with + or - ({tags})',
  'cli.tag.none': '(no tag)',
  'cli.link.expected': 'link: URL expected (or - to clear)',
  'cli.link.none': '(no link)',
  'cli.apply.folder': 'Suggested folder: {folder}',
  'cli.application.option': 'application: at least one option expected (--folder, --channel…)',
  'cli.nextAction.expected': 'next-action: text expected ("" or - to clear)',
  'cli.nextAction.none': '(no next action)',

  'cli.event.typeExpected': 'event: --type expected ({types})',
  'cli.event.summaryExpected': 'event: --summary "…" expected',
  'cli.event.added': 'Event #{id} added to offer #{offer}: {at} {type}{deadline} — {summary}',
  'cli.event.deadline': ' (deadline)',
  'cli.deadlines.offer': 'offer #{id}',
  'cli.deadlines.overdue': 'Overdue ({n}):',
  'cli.deadlines.upcoming': 'Upcoming until {date} ({n}):',
  'cli.done.done': 'Event #{id} done: {summary}',
  'cli.done.reopened': 'Event #{id} reopened (to do): {summary}',

  'cli.files.withoutFolder': '#{id}: no application folder (vigie-emploi application {id} --folder candidatures/…)',
  'cli.files.absent': '#{id}: folder {folder} missing from the data folder',
  'cli.files.title': '{folder} ({n} file(s)):',
  'cli.files.ko': 'KB',
  'cli.stats.steps': 'Sent: {sent} · reply: {replies} · interview: {interviews} · offer: {proposals}',
  'cli.stats.notEnough': 'Delay before the first reply: not enough dated data.',
  'cli.stats.timeout': 'Average delay before the first reply: {days} d (over {n} application(s)).',
  'cli.tracker.summary': '{file}: {inProgress} in progress, {noFollowUp} sent without reply, {closes} closed.',

  'cli.init.usage': 'Usage: vigie-emploi init [folder, ~/vigie-emploi by default] [--port 4410] [--mcp-name vigie-emploi] [--language fr|en]',
  'cli.init.created': 'Workspace created: {folder}',
  'cli.init.config': '  configuration: {config} (port {port}, language {language})',
  'cli.init.mcp': '  MCP server “{name}”: {mcp}',
  'cli.init.browser': '  browser for PDFs: {browser}',
  'cli.init.command': 'Application command, from the workspace: {command}',
  'cli.init.steps': 'Next steps:',
  'cli.init.step1': '  1. Drop your résumé and the PDF export of your LinkedIn profile into {folder}/a-deposer/',
  'cli.init.step2': '  2. Open your AI in {folder} (Claude Code: cd into the folder then “claude”, and accept the MCP server)',
  'cli.init.step3': '  3. Paste this prompt:',

  'cli.count.usage': 'Usage: vigie-emploi count <file>',
  'cli.count.line': '{characters} characters  {words} words  “{start}…”',
  'cli.templates.choose': 'Choose: vigie-emploi template <name> (from the workspace; the old template is kept next to it).',
  'cli.template.usage': 'Usage: vigie-emploi template <name> (list: vigie-emploi templates)',
  'cli.template.installed': 'Template “{name}” installed in {folder}{old}.',
  'cli.template.old': ' (old template kept in {folder})',
  'cli.template.regenerate': 'Regenerate the résumés to see the result: vigie-emploi cv "cv/<name>.md" --capture',
  'cli.cv.usage': 'Usage: vigie-emploi cv <cv.md>… [--template <folder>] [--capture]',
  'cli.cv.withoutBrowser': 'No Chrome, Edge or Chromium found (set its path in VIGIE_EMPLOI_BROWSER)',
  'cli.cv.pages': 'page(s)',
  'cli.cv.exceeded': '  <-- MORE THAN 2 PAGES',
  'cli.cv.fill': 'fill: {rate}',
  'cli.rubric.examplesBeforeAfter': 'Reference examples (before → after):',
  'cli.rubric.new': 'new',

  'server.started': 'Dashboard: http://localhost:{port}/  (data: {folder})',
  'server.stop': 'Ctrl+C to stop.',
  'server.portUsed': 'Port {port} is already in use: the dashboard is probably already running at http://localhost:{port}/',
  'server.otherPort': 'Otherwise, choose another port: vigie-emploi serve --port {suivant}',
  'server.idle': 'No activity for {minutes} min: stopping the dashboard.',
  'api.hostRefused': 'Host refused',
  'api.originRefused': 'Origin refused',
  'api.actionUnknown': 'Unknown action',
  'api.remoteMachine': 'The folder can only be opened on the machine where vigie-emploi runs',
  'api.withoutFolder': 'No application folder for this offer',
  'api.openingImpossible': 'Could not open the folder ({program}): {message}',
  'api.jsonExpected': 'JSON request expected',
  'api.offerNotFound': 'Offer not found',
  'api.statusUnknown': 'Unknown status',
  'api.fieldText': 'Field {field}: text expected',
  'api.pathBadlyEncode': 'Badly encoded path',
  'api.routeUnknown': 'Unknown route',
  'api.notCompiled': 'Dashboard not built: run “npm run build” in the vigie-emploi folder.',
  'api.withoutTerminal': 'No terminal configured for this platform: add "terminal" to vigie-emploi.config.json, or run “claude {prompt}” in {folder}.',
  'api.terminalImpossible': 'Cannot open the terminal ({program}): {message}',

  'tracker.title': '# Application tracking',
  'tracker.when': '{date} at {hour}',
  'tracker.warning1': '> **File generated by vigie-emploi on {when}: do not edit by hand.** Changes are made in the database',
  'tracker.warning2': '> (dashboard, CLI or MCP tools), then `vigie-emploi generate-tracker`. One line per offer; the details are in each offer’s folder.',
  'tracker.inProgress': 'In progress',
  'tracker.noFollowUp': 'Sent without reply',
  'tracker.closes': 'Closed',
  'tracker.headers': '| Offer | Type | Channel | Sent | Status | Next action | Folder |',
  'tracker.headersCloses': '| Offer | Outcome |',
  'tracker.estimations': 'Dates marked “≈” are estimates, not a record of sending. Correct them if you find the real date.',
  'tracker.footer': 'Offers seen, discarded or set aside: in the database (dashboard `vigie-emploi serve`, or `vigie-emploi list --status dismissed`).',
  'tracker.toSend': '**To send** — GO',
  'tracker.remote': 'remote {value}',
  'tracker.folder': 'folder',
  'tracker.overdue': ' (overdue)',
  'tracker.hour': '{h}:{m}',

  'init.prompt':
    'You are going to help me with my job search. Please talk to me in English. My workspace is {workspace}. Read {workspace}/AGENTS.md then {workspace}/DEMARRAGE.md, and follow the onboarding: first check which tools you have, read what I dropped into a-deposer/, then ask me your questions, a few at a time.',
  'init.folderExpected': 'Folder to create expected: vigie-emploi init <folder>',
  'init.notOneFolder': '{folder} exists and is not a folder',
  'init.notEmpty': 'The folder {folder} is not empty: choose a new or empty folder',
  'init.nameMcpInvalid': 'Invalid MCP server name: {name} (letters, digits, - and _)',
  'init.templateUnknown': 'Unknown template: {template} (available: {list})',
  'init.languageUnknown': 'Unknown language: {language} ({languages})',
  'init.npx':
    'Started by npx: the MCP server and the instructions use “{command}” (pinned version). On first launch, npx downloads it (connection needed), then keeps it in its cache. For a fixed path, install with “npm install -g vigie-emploi” instead, then run init again.',
  'init.notCompile': 'Dashboard not built: run “npm run build” in {app} before “vigie-emploi serve”.',
  'init.withoutBrowser':
    'No Chrome, Edge or Chromium found: generating PDF résumés will not work. Install Chrome or Edge, or set the browser path in VIGIE_EMPLOI_BROWSER.',
  'init.scaffoldFrench': 'No workspace template in this language yet: the AI instructions are in French. Your AI can still talk to you in your language.',

  // ---------------------------------------------------------------------------------------------
  // Core (src/core, ingestion, CV): errors and messages returned to the CLI, the API and the MCP server
  'core.or': ' or ',
  'core.ni': ' or ',
  'core.none': 'none',
  'core.noneFeminine': 'none',
  'core.cap': 'cap {value}',
  'core.withoutUrl': 'no URL',
  'core.dateFormat': 'Invalid date: "{text}" (expected DD/MM/YYYY, DD/MM/YYYY HH:MM or YYYY-MM-DD)',
  'core.dateInvalid': 'Invalid date: "{text}"',
  'core.hourInvalid': 'Invalid time: "{text}"',
  'flag.remoteUnknown': 'Remote work unknown (neutral value): to check',
  'flag.compensationUnknown': 'Pay unknown (neutral value): to ask',
  'flag.subFloor': 'Pay below the floor{value}: to point out',
  'flag.criterionMissing': '{label}: no sub-score (neutral value 5)',
  'core.textExpected': '{name}: text expected',
  'core.numberExpected': '{name}: number expected ({value})',
  'core.pathEmpty': 'Empty file path',
  'core.pathAbsolute': 'Absolute path refused: {path} (expected a path relative to the data folder)',
  'core.pathInvalid': 'Invalid path: {path}',
  'core.pathRefused': 'Path refused: {path}',
  'core.filesList': 'files: a list of paths is expected',
  'core.typeEventUnknown': 'Unknown event type: {type} ({types})',
  'core.directionUnknown': 'Unknown direction: {direction} (sent or received)',
  'core.eventNotFound': 'Event {id} not found',
  'core.daysInvalid': 'Invalid number of days: {days}',
  'core.offerNotFound': 'Job ad {id} not found',
  'core.summaryEvent': 'An event summary is required',
  'core.accessRefused': 'Access denied: {path}',
  'core.fileNotFound': 'File not found: {path}',
  'core.notOneFile': 'Not a file: {path}',
  'core.notOneFolder': 'Not a folder: {path}',
  'core.linkInvalid': 'Invalid link (http:// or https:// expected): {link}',
  'core.statusUnknown': 'Unknown status: {status}',
  'core.scoreInvalid': 'Invalid score: {score}',
  'core.scoreScale': 'Score outside the 0-10 scale: {score}',
  'core.mergeImpossible': 'Cannot merge: job ad {target} or {duplicate} not found',
  'core.inputWithoutId': 'Entry with neither "id" nor "url"',
  'core.withoutRubric': 'Criteria-based score without a scoring grid: create profil/grille.json in the data folder (vigie-emploi rubric --init)',
  'core.scoreIgnored': '"score" field ({score}) ignored: score calculated with grid v{version} = {calculee}',
  'core.rawScoreIgnored': '"raw_score" field ignored: replaced by the weighted average',
  'core.batchUnreadable': 'Unreadable batch: JSON array expected',
  'core.noneScore': 'No score to record',
  'core.step.reread': 'Reread the job ad ({url}) and the recorded score',
  'core.step.instructions': 'Apply the application instructions in the data folder (CLAUDE.md, AGENTS.md or equivalent)',
  'core.step.folder': 'Create the folder {folder} with the ad, the fit, the gaps and the messages',
  'core.step.save': 'Record the application (folder, CV, channel, next action): save_application or vigie-emploi application {id} --folder {folder}',
  'core.step.send': 'Once it is sent: record the date sent (sent_at); the job ad moves to "sent"',
  'core.rubricUnreadable': 'Unreadable grid ({path}): {message}',
  'core.rubricObject': 'Unreadable grid ({path}): JSON object expected',
  'core.versionNotFound': 'Grid version {version} not found',
  'core.summaryChange': 'A summary of the change is required',
  'core.rubricModifiedFile': 'Changed in the grille.json file',
  'core.rubricInitial': 'Initial version (grille.json file)',
  'core.notOfRubric': 'No scoring grid: create {path} (template: examples/rubric.en.json, or "vigie-emploi rubric --init")',
  'core.noneChange': 'No change compared with the current version',
  'core.backVersion': 'Back to version {version}',
  'core.rubric.computationExpected': 'criterion {id}: "computation" expected ({computations})',
  'core.rubric.computationReserved': 'criterion {id}: "computation" is reserved for computed criteria',
  'core.rubric.targetHigh': 'the high target must be above the floor',
  'core.rubric.targetHighFullRemote': 'the high target must be above the fully remote floor',
  'core.rubric.targetLow': 'the low target is above the high target',
  'core.rubric.valueCap': 'rule {id}: "value" expected for a cap',
  'core.rubric.criterionThreshold': 'rule {id}: "criterion" and "threshold" expected',
  'core.rubric.subScore': 'sub-score from 0 to 10 expected: {value}',
  'core.rubric.criteriaMax': '{n} criteria at most',
  'core.rubric.criterionDouble': 'duplicate criterion: {id}',
  'core.rubric.ruleDouble': 'duplicate rule: {id}',
  'core.rubric.scaleDouble': 'scale {computation} used by two criteria',
  'core.rubric.oneWeight': 'at least one criterion must have a weight',
  'core.rubric.exampleCriterion': 'example "{title}": unknown AI criterion {criterion}',
  'core.rubric.exampleRule': 'example "{title}": unknown rule {rule}',
  'core.rubric.invalid': 'Invalid grid ({origin}): {message}',
  'core.calc.paceUnknown': 'On-site pattern unknown: neutral value',
  'core.calc.fullRemote': 'Fully remote',
  'core.calc.onsiteDays': p('{n} day on site per week', '{n} days on site per week'),
  'core.calc.compensationUnknown': 'Pay not published: neutral value',
  'core.calc.unitSalary': 'K a year',
  'core.calc.unitTjm': ' a day',
  'core.calc.middle': 'middle of the range',
  'core.calc.subFloor': 'below the floor of {floor}',
  'core.calc.targetHigh': 'at or above the high target ({target})',
  'core.calc.between': 'between the floor of {floor} and the high target of {target}',
  'core.calc.floorFullRemote': ' (fully remote floor)',
  'core.input.invalid': 'Invalid criteria-based score: {message}',
  'core.input.criterionUnknown': 'Unknown criterion: {id} (criteria scored by the AI: {list})',
  'core.input.criterionComputed': 'The criterion {id} is calculated by the application: do not score it; provide {fields} instead if the job ad gives them',
  'core.input.ruleUnknown': 'Unknown blocking rule: {id} (rules: {list})',
  'core.change.invalid': 'Invalid change: {message}',
  'core.change.criterionUnknownList': 'Unknown criterion: {id} (criteria: {list})',
  'core.change.criterionUnknown': 'Unknown criterion: {id}',
  'core.change.newRule': 'New rule {id}: "label" and "effect" expected',
  'core.change.ruleUnknown': 'Unknown rule: {id}',
  'core.change.technologyMissing': 'Technology not in the inventory: {technology}',
  'core.change.exampleAbsent': 'Example not in the grid: {title} (examples: {list})',
  'core.change.examplesHomonyms': 'Several examples are called "{title}": specify { title, company }',
  'core.instructions.scoreFinale':
    'Do not give the final score: the application calculates it (weighted average, blocking rules, rounded to the nearest half point). A "score" field supplied with "criteria" is ignored.',
  'core.instructions.criteria': 'Score each of these criteria from 0 to 10, with a short justification ("criteria" field): {list}.',
  'core.instructions.computed': p('Do not score {list}: it is calculated from the scale. ', 'Do not score {list}: they are calculated from the scale. '),
  'core.instructions.inputs':
    'Fill in "inputs" when the job ad gives them: onsite_days (days on site: 0 = fully remote, 5 = fully on site), salary_min / salary_max as plain amounts in the grid\'s currency, and unit (year, month, day or hour). ' +
    "Otherwise the application infers them from the job ad's remote work and pay fields; when unknown, they take the neutral value with a flag.",
  'core.instructions.blockers': 'List in "blockers" the ids of the rules that apply to the job ad (active rules: {list}).',
  'core.instructions.technique':
    'Technical criterion: compare the skills asked for with the inventory (levels strong / medium / light / zero) and list the gaps in the justification and in "gaps".',
  'core.instructions.examples':
    'Calibrate your sub-scores on the grid\'s reference examples. Also fill in "fit" (what matches), "gaps" and "read" (read in full).',
  'core.instructions.threshold': '"Worth a look" threshold: {threshold}. List for the user the job ads scored above it, with the breakdown.',
  'core.rubric.identifier': 'id expected: lower-case letters, digits, "-" or "_", 40 characters at most',
  'core.rubric.score10': 'score from 0 to 10',
  'core.rubric.sixValues': 'six values expected: 0 to 5 days on site',
  'core.rubric.afterChange': 'after the change',
  'core.penaltiesIgnored': '"penalties" field ignored: blocking rules go through "blockers"',
  'core.import': 'apply (reopened after "{status}")',
  'core.sentAt': 'sent on {date}',
  'core.ingest.box': 'Inbox not found: {folder}',
  'core.mail.error.no-password': 'no password stored for this mailbox (dashboard settings, or vigie-emploi mail setup).',
  'core.mail.error.authentication':
    'login refused by {host} (address or password). Gmail, Yahoo, iCloud: an app password is needed, not the account password. Detail: {message}',
  'core.mail.error.folder': 'no folder "{folder}" in the mailbox (renamed or deleted?). Detail: {message}',
  'core.mail.error.connection': 'cannot reach the server {host} (server address, network). Detail: {message}',
  'core.mail.error.other': 'IMAP error: {message}',
  'core.mail.backend.environment': 'VIGIE_EMPLOI_MAIL_PASSWORD variable',
  'core.mail.backend.dpapi': 'encrypted for your Windows session',
  'core.mail.backend.keychain': 'macOS keychain',
  'core.mail.backend.secret-service': 'system keyring',
  'core.mail.backend.file': 'file readable by you alone (no keyring available)',
  'core.ingest.seen': 'Seen again on {date} in a {source} alert: status unchanged',
  'core.ingest.withoutJsonLd': 'No JSON-LD JobPosting on the page',
  'core.ingest.readingImpossible': 'could not read the page: {message}',
  'core.ingest.employerRefused': 'employer refused: {pattern}',
  'core.ingest.titleExcluded': 'title excluded: {pattern}',
  'core.ingest.email': 'e-mail: {subject}',
  'core.ingest.alwaysPresent': 'file still present after deletion',
  'core.ingest.notDeleted': 'e-mail read but not deleted: {message}',
  'core.access.pathCache': 'Path refused: {path} (no ".." and no hidden file or folder)',
  'core.access.data': "Access denied: {path} (data/ holds the database; use the application's tools)",
  'core.access.outWorkspace': 'Path outside the workspace refused: {path} (expected a path relative to the workspace)',
  'core.access.sort': 'Access denied: {path} (leads outside the workspace)',
  'core.access.folderNotFound': 'Folder not found: {path}',
  'core.access.notOneFolder': 'Not a folder: {path}',
  'core.access.isOneFolder': '{path} is a folder: use list_files',
  'core.access.tooBigText': 'File too large to read in one go: {path} ({size} bytes)',
  'core.access.tooBig': 'File too large: {path} ({size} bytes)',
  'core.access.extension': 'Extension not allowed for writing: {ext} (allowed: {list})',
  'core.access.withoutExtension': '(none)',
  'core.access.tooLong': 'Content too long',
  'core.access.exists': '{path} already exists (create_only): choose another name (suffix "V2") or replace it knowingly',
  'core.access.moveFile': 'Only files can be moved: {path}',
  'core.access.destination': 'The destination already exists: {path} (nothing is overwritten)',
  'core.cv.notFound': 'CV not found: {path}',
  'core.cv.templateIncomplete': 'Incomplete template: {path} is missing',
  'core.cv.templateUnknown': 'Unknown template: {name} (available: {list})',
  'core.pages.pdfEmpty': 'Empty PDF',
  'core.pages.jumpBadlyPlaced':
    'Page {page} is only {pc}% full although another page follows: badly placed page break (unbreakable block too high, forced break); tighten or move content to fill the page.',
  'core.pages.lastEmpty':
    'Last page ({page}) is {pc}% full: a lot of empty space; add content that is genuinely useful for the job ad, or condense to fit on one page fewer.',
  'core.pages.lastRemark':
    'Note: last page ({page}) is {pc}% full, leaving about {empty}% of the page empty; acceptable, but there is room for something useful for the job ad if anything is missing.',
  'core.pages.percent': '{pc}%',
  'core.config.notConfigure':
    'Data folder not configured: set VIGIE_EMPLOI_DATA, pass --data <folder> or create {file} with "dataDir" (see vigie-emploi.config.example.json).',
  'core.config.notFound': 'Configuration file not found: {path}',
  'core.config.language': 'Unknown language: {language} ({languages}; VIGIE_EMPLOI_LANGUAGE or "language" in {file})',

  'common.offers': p('{n} offer', '{n} offers'),
};
