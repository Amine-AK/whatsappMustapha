# ELECTRO-LMESTOUR: credit app (Next.js PWA)

A web app to manage customer credit, connected to the same Google Sheet as
`code.gs`. It opens in the browser on a PC or laptop and installs on an Android
phone like a normal app.

What it does:

- **List** every customer with what they still owe and their next payment date.
- **Search** by name or phone number (`0661…`, `+212 661…` and `661…` all match).
- **Filter** by status (late, today, tomorrow, upcoming, paid), by payment date
  (from / to) and by amount still owed (from / to), and sort.
- **Add** a customer.
- **Edit** a customer: the app shows what will change and asks to confirm.
- **Delete** a customer: the app asks to confirm.
- **Add a payment**: amount, the day it was paid (today by default, can be
  changed) and the next payment date (one period later by default, can be changed).
- **Remind late customers** on WhatsApp through WATI, with one button.

## How it works with the Google Sheet

The app reads and writes the main tab (`Feuille 1`) in the exact format
`code.gs` uses, so the sheet and its menu keep working:

| Column | What the app writes |
|---|---|
| A, B | name, phone (kept as typed) |
| C | items, each with a `(dd/MM/yyyy - HH:mm)` stamp |
| D, E | selling and buying price |
| F, H | profit and remaining, as `"X درهم"` |
| G | payments: `1000 (01/10/2026 - 10:00) + 500 (25/10/2026 - 14:30)` |
| I, J | period (سيمانة / 15 يوم / شهر / تحديد يدوي) and next payment date |
| K–M | left as they are |
| N | instalment amount |
| O–Q | not touched (the script fills its WhatsApp links and print button when the sheet opens) |

Also:

- **The hidden `_Backup_Security_` tab is kept in sync.** Edits made by the app
  don't trigger the script, so the app copies each changed row there itself and
  deletes the same row there on delete. Without this, the secret-code protection
  in the sheet would compare against wrong rows.
- **Edits are never lost.** If someone changed a row in the sheet after the app
  loaded it, the app refuses to save and asks you to refresh, instead of
  overwriting their change.
- **Formulas are never written.** Text is saved as text, so a name starting with
  `=` can't run a formula.
- **Every reminder is logged** in a new tab `سجل التذكيرات` (date, customer,
  phone, result). A customer isn't reminded twice the same day for the same
  due date.

## 1. Google Sheets access (once)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a
   project.
2. **APIs & Services > Library**, search **Google Sheets API** and click **Enable**.
3. **IAM & Admin > Service Accounts > Create service account**. Give it a name and
   no role.
4. Open it, go to **Keys > Add key > Create new key > JSON**. A file downloads.
5. **Share the Google Sheet** with the `client_email` from that file, as
   **Editor** (the app writes to the sheet).
6. Put `client_email` in `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` in
   `GOOGLE_PRIVATE_KEY`. Keep this key secret: it can edit the sheet.

## 2. WATI (for the reminder button)

WhatsApp only lets businesses message customers who haven't written in the
last 24 hours with a **template approved by WhatsApp**.

1. In WATI: **Broadcast > Your templates > New template message**.
   - Name: `debt_reminder_ar`, category **Utility**, language **Arabic**.
   - Body. WATI fills `{{1}}`…`{{5}}` **in this order**: name, items, due
     date, remaining amount, instalment.

     ```
     السلام عليكم {{1}}، نذكركم من متجر ELECTRO-LMESTOUR بأن موعد الدفعة بخصوص ({{2}}) قد حل بتاريخ {{3}}.
     ⏳ المبلغ المتبقي: {{4}} درهم
     📌 الطريطة المتفق عليها: {{5}}
     المرجو التواصل معنا عبر رقمنا التجاري 0663336760 وشكراً.
     ```
   - Submit it and wait until it shows **Approved**. WATI refuses templates
     that are pending or rejected.
2. Set these variables:
   - `WATI_API_ENDPOINT`: `https://live-mt-server.wati.io/<tenant ID>`. The
     tenant ID is the number in the WATI dashboard address
     (`live.wati.io/10281911/…` gives `10281911`).
   - `WATI_ACCESS_TOKEN`: a WATI API key (`wati_…`) with at least one of the
     permissions `api`, `wati_integration:write` or `messagetemplate:write`.
   - `WATI_CHANNEL_NUMBER`: the shop's WhatsApp number connected in WATI, without
     `+` (e.g. `212658869574`).
   - `WATI_TEMPLATE_NAME`: the template's exact name.

The app uses WATI's `POST /{tenantId}/api/v1/sendTemplateMessage`. WATI answering
"sent" means it accepted the message; delivery happens a few seconds later.
WATI refuses messages when the trial's broadcast quota is used up.

The reminder button lists every customer whose payment date has passed and who
still owes money. You can untick anyone, then confirm. Customers with a bad
phone number or already reminded today are shown but not selected. WATI's
answer for each customer (sent / failed and why) is shown in the list and saved
in the `سجل التذكيرات` tab.

## 3. Run on your computer

You need Node.js 20 or newer.

```bash
cd web
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

## 4. Put it online (needed to install it on the phone)

Installing a PWA needs HTTPS, so host it. [Vercel](https://vercel.com) is free
for this:

1. Push the repository to GitHub (already done).
2. On Vercel: **Add New > Project**, pick this repository, and set **Root
   Directory** to `web`.
3. Add every variable from `.env.example` under **Environment Variables**.
4. Deploy. You get an address like `https://electro-lmestour.vercel.app`.

## 5. Install the app

- **Android (Chrome):** open the address, log in, then **⋮ menu > Install app**
  (or "Add to Home screen"). It gets its own icon and opens full screen.
- **PC / laptop (Chrome or Edge):** open the address and click the install icon
  at the right of the address bar. Or just keep using it in the browser.

## Printing a payment receipt (thermal printer)

After you record a payment, the receipt (**وصل الأداء**) opens by itself with a
**🖨️ طبع الوصل** button. To print it again later, or to print an older payment,
press **وصل** on the customer's card and pick the payment. It works offline too.

The receipt shows the shop name and phone, a receipt number (date and time of the
payment, e.g. `261030-1432`), the customer, the items, the amount paid, the total,
how much was paid so far, what remains, the next payment date and the instalment.

Choose **58 mm** or **80 mm** paper in the receipt window; the app remembers it on
that device.

- **PC / laptop (USB printer):** install the printer's driver (Xprinter, Epson
  TM, Rongta…), then in the print window choose the printer, **Margins: None**,
  **Scale: 100**, and the paper size of your roll (e.g. 80 × 297 mm or "Roll").
  Turn off *Headers and footers*.
- **Android phone (Bluetooth or USB printer):** Android needs a print service for
  the printer. Install the printer maker's print plugin, or a general one such as
  **RawBT**, enable it in *Settings > Connected devices > Printing*, then press
  **طبع الوصل** and choose the printer.

Do a test print once to check the width; if the right side is cut, choose 58 mm.

## Working without internet

After the app has been opened once with internet on a device, it also works
**offline** on that device:

- It opens and shows the customers as they were at the last sync (the bar at
  the top says when).
- You can **add, edit, record payments and delete**. Each change is saved on the
  device right away and marked **ما تزامنش** (not synced yet).
- When the connection comes back, the changes are sent to the Google Sheet **by
  themselves, in the order you made them**. This happens as soon as the phone is
  back online, when you open the app, and every 30 seconds while changes wait.
  The app must be open for this; a closed app syncs the next time it's opened.
- **Reminders need internet** and wait until every change has been sent, so a
  customer who paid offline never gets a reminder by mistake.

What makes syncing safe:

- **Nothing is applied twice.** If the connection drops after the sheet saved a
  change but before the phone heard back, the phone sends it again and the
  server recognises it (same customer, same payment, same time stamp).
- **Rows can move.** If someone deleted a row above in the meantime, the
  customer is found by its content, not by its row number.
- **Other people's changes are never overwritten.** If a customer was changed
  in the sheet while you edited them offline, your change is refused and listed
  under ⚠️ at the top: choose **عاود** (send again) or **تجاهل** (drop it).
- The changes waiting on a device live in that browser's storage. Clearing the
  browser data, or uninstalling the app, before they're synced loses them.

## Security

- One shop password (`APP_PASSWORD`). After 30 days you need to log in again.
- Every page and API call requires login. Requests from other websites are refused.
- Google and WATI keys stay on the server and are never sent to the phone.
- Use a long password. Anyone with it can see and change customer debts.

## Development

```bash
npm test          # rules ported from code.gs (dates, amounts, phones, row format)
npm run lint      # TypeScript check
npm run build
```

Code map:

| Path | What |
|---|---|
| `src/lib/sheet-logic.ts` | The sheet's rules (port of `code.gs`): amounts, dates, phones, statuses, row format |
| `src/lib/sheets.ts` | Google Sheets API: read, add, edit, delete rows, backup tab, reminder log |
| `src/lib/wati.ts` | WATI template message |
| `src/app/api/…` | Server routes used by the app |
| `src/proxy.ts` | Login check on every request |
| `src/components/` | Screens: list, form, payment, reminders |
| `public/sw.js` | Service worker: keeps the app itself on the device so it opens offline |
| `src/lib/offline.ts`, `src/components/useOfflineCustomers.ts` | Offline changes: saved on the device (IndexedDB) and synced in order |
| `src/lib/rows.ts` | Finds a customer's row by content when rows moved |
