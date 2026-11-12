# Automating the arrival of alerts in `emails/`

Goal: every job alert received (LinkedIn, Indeed, Glassdoor, Reed, Otta…) is saved automatically as an `.eml` file in the workspace's `emails/` folder. The user then only has to ask you to "process the e-mails".

First ask which mail client they use, then guide them step by step for that one only, one step at a time, checking with them that each step worked.

## Thunderbird (recommended)

Thunderbird cannot save a message as a file from a filter; the free **FiltaQuilla** add-on adds this action.

1. **Install FiltaQuilla**: menu **Tools → Add-ons and Themes**, search for "FiltaQuilla", install it.
2. **Enable the action**: Add-ons → FiltaQuilla → **Options**; in the list of actions, tick **"Save Message as File"** (disabled by default: without it, it does not appear in filters).
3. **Create the filter**: menu **Tools → Message Filters**, choose the account that receives the alerts, **New**, name it "Job alerts".
   - **"Match any of the following"**, one condition per site: **From → contains → the sending address of the alerts** (the user finds it by opening an alert they received).
   - Actions: 1. **Save Message as File** → the workspace's `emails/` folder (give them the full path); 2. *(optional)* **Move Message to** a subfolder, for example "Processed alerts".
   - Let the filter run on **Getting New Mail**.
4. **Alerts already received**: select the filter, then **Run Now** on the inbox.
5. **Check**: list `emails/`; `.eml` files should be there.

The exact labels may vary slightly with the version of Thunderbird or of the add-on: if the user cannot find a menu, ask them what they see.

## Gmail, Outlook.com, Yahoo or another webmail

These cannot save a message to a folder on the computer. The simplest option: **add the same account to Thunderbird** (free, the setup assistant does everything), only for this filter, then follow the Thunderbird section. The webmail keeps working as before.

## Outlook (desktop app)

Outlook rules cannot save a message as a file without a macro. Suggest, in this order: add the account to Thunderbird (section above); otherwise, drag the alerts by hand from Outlook to `emails/` (Outlook saves them as `.msg`, which the application does not read: use "Save as" in `.eml` format where offered, otherwise Thunderbird).

## Without automation

Dragging alerts from the mail client into `emails/` is always possible; once a day is enough.
