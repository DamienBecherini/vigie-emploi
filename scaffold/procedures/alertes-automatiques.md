# Automating the arrival of alerts

Goal: every job alert received (LinkedIn, Indeed, Glassdoor, Reed, Otta, Welcome to the Jungle…) reaches the application by itself. The user then only has to ask you to "process the e-mails".

Recommended method: **the application fetches a folder of their mailbox itself** (IMAP), on Windows, macOS or Linux, without a mail client. It only reads: nothing is deleted or moved in the mailbox, the fetched messages are only marked as read. The fetch happens at each ingestion (`ingest_emails`, `vigie-emploi ingest`) and from the dashboard.

First ask which mail provider they use (their address is enough: Gmail, Yahoo, iCloud, Outlook.com…), then guide them step by step, one step at a time, checking with them that each step worked.

**Never ask for their password in the conversation**: they type it themselves in the dashboard or in the terminal, and the application hands it to the system keychain (never in the workspace).

## 1. A folder and a filter in their mailbox

In their webmail, they create a folder (a **label** in Gmail), for example "Job alerts", and a **filter** that files the alerts in it. Filter condition: **the sender** contains the sending address of each site's alerts (they find it by opening an alert they received).

- **Gmail**: ⚙ → See all settings → Filters and Blocked Addresses → Create a new filter; "From" field: the addresses separated by `OR`; then "Apply the label" (new label "Job alerts") and tick "Also apply filter to matching conversations". "Skip the Inbox" is optional.
- **Yahoo, iCloud, other webmails**: mail settings → "Filters" or "Rules"; action "Move to folder" "Job alerts".
- The exact labels change with versions: if the user cannot find a menu, ask them what they see.

## 2. The password to use

- **Gmail, Yahoo, iCloud**: an **app password** (16 characters), not the account password. Two-step verification must be on first. Gmail: https://myaccount.google.com/apppasswords (any name, for example "vigie-emploi").
- **Most other providers**: the usual account password.
- **Outlook.com, Hotmail, Live, Microsoft 365**: not supported yet (Microsoft requires its own sign-in). Meanwhile: an Outlook rule that **forwards** the alerts to another mailbox (Gmail…) fetched by the application, or drag and drop (below).
- Another provider: its help pages give the IMAP server (often `imap.<domain>`, port 993).

## 3. Connect the mailbox

- **Dashboard** (the simplest, and the only way without a terminal): `open_dashboard`, then the **"Mailbox"** button at the top: address, password, "Connect and list the folders", choose the "Job alerts" folder, "Save".
- **Terminal**: `vigie-emploi mail setup` (questions asked one by one; the password does not show while typing).

The first fetch only takes the messages of the last 14 days.

## 4. Check

Run the ingestion (`ingest_emails`): its `to_tell` says how many e-mails were fetched from the folder, or why the mailbox could not be fetched (password refused, folder not found, server unreachable). Pass the message on as it is and help fix it.

## Other ways

- **Thunderbird and FiltaQuilla** (if the user already uses Thunderbird): a filter with the "Save Message as File" action to `emails/` (action to enable in FiltaQuilla's options); let the filter run on Getting New Mail.
- **Dragging** alerts from the mail client into `emails/`, as `.eml` files, is always possible; once a day is enough.
