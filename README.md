# ELECTRO-LMESTOUR

**The app is in [`web/`](web/README.md)**: a Next.js app, installable on Android
and usable on PC, that keeps each customer's purchases, payments and instalment
in separate Google Sheet tabs, works offline, prints thermal receipts and sends
WATI reminders. Start there.

> **Older tools in this repository (kept for reference, no longer matching the sheet):**
> - `reminder/` (below): a Python + Playwright tool that sent reminders through
>   WhatsApp Web. It reads the old one-row-per-customer `Feuille 1` layout and
>   the old Apps Script (`code.gs`, now removed). The app replaces it.
> - `db/`: a PostgreSQL design of the same data. Not used; the data stays in
>   Google Sheets.

---

# Old tool: WhatsApp debt reminders (Python + Playwright)

The `reminder/` folder is a Python tool that read the old `Feuille 1` layout,
used the same rules as the old Apps Script to pick who must pay, and sent the
WhatsApp messages through WhatsApp Web with Playwright, one by one, 60 seconds
apart.

## Who gets a message

Same rules as `collectDueAndUpcomingCustomers_` in `code.gs`. A customer row gets a
reminder when:

- it has a name (column A),
- they still owe money: selling price (D) minus payments (G) is more than 0,
- the next payment date (J) is **past** 🔴, **today** 🟠 or **tomorrow** 🟢.

The message text is the same as in the sheet (remaining amount, instalment from
column N and period from column I, shop number 0663336760).

The tool also adds a few protections:

- **No double messages:** every send goes into `sent_log.csv`. A customer is not
  reminded again for the same due date the same day (`--resend-after-days` to
  change it, e.g. `3` = every 3 days for late customers).
- **Bad numbers are skipped** and reported (e.g. `123`). `00212…` is handled.
- **60 s + a random extra wait** between messages to protect the number.

## 1. Install (once)

You need Python 3.10 or newer.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate     Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## 2. Link the shop WhatsApp (once)

```bash
python -m reminder --login-only
```

A browser opens on WhatsApp Web. On the shop phone (0663336760): **WhatsApp >
Linked devices > Link a device**, scan the QR code. The session is saved in
`.wa-profile/`, so you don't scan again. Keep that folder private: anyone with it
can use the shop's WhatsApp.

## 3. Give it the customer data

**Option A: CSV (simplest).** In the sheet, open the main tab, then
**File > Download > Comma-separated values (.csv)**. Use the file with `--csv`.

**Option B: read the Google Sheet directly (best for automatic runs).**
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project,
   enable the **Google Sheets API**, create a **service account** and download its
   JSON key as `service_account.json` in this folder.
2. Share the Google Sheet with the service account's email (`…@….iam.gserviceaccount.com`),
   **Viewer** is enough.
3. The sheet ID is the long code in its URL: `docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.

## 4. Run

Always check first with `--dry-run` (nothing is sent, it prints every message):

```bash
python -m reminder --csv clients.csv --dry-run
python -m reminder --sheet-id <SHEET_ID> --dry-run
```

Then send for real:

```bash
python -m reminder --sheet-id <SHEET_ID>
```

Useful options:

| Option | Meaning |
|---|---|
| `--only overdue` | only late customers (also `today`, `tomorrow`; can repeat) |
| `--max 20` | send at most 20 messages this run |
| `--delay 90` | seconds between messages (default 60) |
| `--resend-after-days 3` | remind the same customer at most every 3 days |
| `--headless` | hide the browser (only after the QR code was scanned) |
| `--worksheet "Feuille 1"` | tab name (default `Feuille 1`, else the first tab) |
| `--today 2026-10-27` | pretend it's another day (testing) |

Results are printed and saved in `sent_log.csv`. Screenshots of failures go to `logs/`.

## 5. Every morning automatically

The computer must be on and logged in.

- **Windows:** Task Scheduler > Create Basic Task > Daily 09:00 > Start a program:
  - Program: `C:\path\to\whatsappMustapha\.venv\Scripts\python.exe`
  - Arguments: `-m reminder --sheet-id <SHEET_ID>`
  - Start in: `C:\path\to\whatsappMustapha`
- **Mac/Linux (cron):**
  `0 9 * * * cd /path/to/whatsappMustapha && .venv/bin/python -m reminder --sheet-id <SHEET_ID> >> run.log 2>&1`

## Good to know

- WhatsApp does not allow automated messages officially. Sending a few dozen
  reminders a day to your own customers, slowly, is low risk, but a number can
  still get banned. Keep the delay, and don't send to people who never gave you
  their number.
- Close other WhatsApp Web tabs while it runs (WhatsApp Web works in one tab only).
- If WhatsApp changes its website and sending stops working, the page selectors
  are at the top of `reminder/whatsapp.py`.
- Due dates don't move forward by themselves (same as in the sheet): after a
  customer pays, update column J, or they will keep getting the "late" message.
- Amounts follow the sheet's rule "add up every number in the cell", so write
  `1500`, not `1 500` (that reads as 1 + 500).

## Tests

```bash
pip install pytest
python -m pytest
```
