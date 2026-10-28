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
   - Body (the `{{…}}` names must match exactly):

     ```
     السلام عليكم {{name}}، نذكركم من متجر ELECTRO-LMESTOUR بأن موعد الدفعة بخصوص ({{items}}) قد حل بتاريخ {{due_date}}.
     ⏳ المبلغ المتبقي: {{remaining}} درهم
     📌 الطريطة المتفق عليها: {{installment}}
     المرجو التواصل معنا عبر رقمنا التجاري 0663336760 وشكراً.
     ```
   - Submit it and wait for approval (usually minutes to a day).
2. In WATI: **API Docs**. Copy the **API Endpoint** into `WATI_API_ENDPOINT` and
   the **Access Token** into `WATI_ACCESS_TOKEN`.

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

The app needs internet to show customers: the data always comes live from the
sheet. Without internet it opens an "offline" page instead of failing.

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
| `public/sw.js` | Service worker (install + offline page; customer data is never cached) |
