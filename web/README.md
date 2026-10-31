# ELECTRO-LMESTOUR: credit app (Next.js PWA)

A web app to manage customer credit, stored in a Google Sheet. It opens in the
browser on a PC or laptop and installs on an Android phone like a normal app.
It works offline and syncs when the connection comes back.

Each customer has **one running account**: everything they bought (1 to 20+
purchases a year: appliances, chargers, a phone repair…) minus everything they
paid, with **one instalment** (الطريطة) that you raise when the debt grows.

What it does:

- **Customers who owe** are listed first; search by name or phone (`0661…`,
  `+212 661…` and `661…` all match). Also search among customers who have paid,
  everyone, or the **archive**.
- **Filter** by status (late, today, tomorrow, upcoming), next payment date and
  amount owed, and sort.
- **Customer account**: totals, instalment and months left, every purchase with
  what is left on it, every payment, and the history of instalment changes.
- **New purchase** for an existing customer, with a down payment, and a
  suggested new instalment (logged with the reason).
- **Payment**: amount, date and time (can be changed), the item it is for (a
  list; by default the oldest item not fully paid), next payment date.
- **Fix mistakes**: edit a purchase or a payment, **move a payment recorded on the
  wrong customer**, or delete; edits and deletes ask for confirmation.
- **Receipts** for the thermal printer: one payment, or the **whole account**
  (كشف الحساب) with all items and payment dates.
- **Archive**: customers who finished paying more than 3 months ago are archived
  with one button; they can be found in the archive and brought back.
- **Remind late customers** on WhatsApp through WATI, with one button.

## The Google Sheet

The app works in these tabs (it creates them; see *First start* below):

| Tab | One row per |
|---|---|
| `الزبناء` | customer: number (C-…), name, phone, instalment, period, next payment date, notes, and the totals bought / paid / remaining (written by the app) |
| `المشتريات` | purchase: customer, date, item, selling price (the buying price will live in the future stock section) |
| `الدفعات` | payment: receipt number (P-…), customer, date, time, amount, تسبيق/دفعة, item |
| `تغييرات الطريطة` | instalment change: old and new amount and period, reason |
| `أرشيف الزبناء`, `أرشيف المشتريات`, `أرشيف الدفعات` | archived customers and their history |
| `سجل التذكيرات` | WhatsApp reminder sent |

Customers, purchases and payments are linked by their numbers (`C-…`, `S-…`,
`P-…`), so moving or sorting rows by hand doesn't break anything. You can read
and fix things in the sheet directly, but **don't change the numbers in the
first columns**.

Size: about 1000 active customers and 3000 a year make roughly 25,000 rows a
year, far below Google Sheets' limit (10 million cells). Archiving keeps the
active tabs small, so the app stays fast.

### First start: moving the old sheet

The first time the app opens on a sheet without these tabs, it shows
**«زيد الأوراق ونقل الزبناء»**. That creates the tabs and moves every customer of
the old `Feuille 1` (one row per customer, items and payments joined with `+`):
each item becomes a purchase with its date and price, each payment a payment
with its date and time. `Feuille 1` is left as it was, as a backup.

### Excel backup

In the **⚙️ menu** (top of the page): **«⬇️ تحميل Excel»** downloads
`electro-lmestour-backup-YYYY-MM-DD.xlsx`: a copy of every tab of the Google
Sheet (customers, purchases, payments, instalment changes, archive, reminder
log…), one Excel sheet per tab. Phones stay text (leading 0 kept), amounts
stay numbers. It needs internet; changes made offline are in it only once
they have synced. The file opens in Excel or LibreOffice, or can be imported
back into Google Sheets (File > Import).

**Daily backup on WhatsApp.** Every 24 hours the app asks to send the file
to WhatsApp **0662275062** (`BACKUP_PHONE` in `src/lib/backup.ts`); «من بعد»
asks again 3 hours later. It is also in the menu: «📤 صيفط Excel فواتساب».
WhatsApp links can't attach a file, so sending takes a tap or two:

- **Phone:** the share menu opens with the file attached; choose WhatsApp,
  then the chat with 0662275062.
- **PC:** the file is downloaded and WhatsApp Web opens the chat with
  0662275062; drop the file in it (📎).

The 24 hours are counted per device (phone and PC each remember their last
backup).

### The old Apps Script (code.gs) is no longer used

The app replaces everything `code.gs` did (menu, WhatsApp links, late list,
invoice). It was removed from this repository, but it still lives in
the sheet itself. To stop it:

1. Open the sheet > **Extensions > Apps Script**.
2. **Triggers** (clock icon, left): delete every trigger (`onEditInstalled`,
   `runDailyMorningAutomation`).
3. Back in the editor, delete the code (or the whole project) and save.

## The shop: sales, stock, cash drawer, reports

Five sections (bottom bar on the phone, tabs on a PC): **الكريدي**, **البيع**,
**المخزون**, **الصندوق**, **التقارير**. Everything works offline and syncs later,
like the credit ledger.

**New tabs** (created on their own the first time the app opens a sheet that
was set up before them):

| Tab | One row per |
|---|---|
| `المخزون` | product: name, family, new/used, cost, price, quantity, IMEI/serial |
| `الفئات` | product family, its target margin and its icon (5 families to start with) |
| `المبيعات` | line sold, cash or credit: cost, price, profit, seller, customer |
| `حركات المخزون` | quantity changed by hand (delivery, count, loss…) and why |
| `الصندوق اليومي` | drawer closing: cash in, expenses, expected, counted, difference |

- **البيع (sale):** 💵 cash (no customer) or 📒 credit (a customer's account, with
  an optional advance). Big buttons for the product families (🧊 📱 🔌 🛠️ 🍳):
  tap one to list its products in stock (and «حاجة أخرى» for something not in
  stock, like a repair), or search as you type (`ip 11` finds `iPhone 11 64GB`). The price can be changed (discount); the
  cost and profit are shown, and a price under cost is refused. «شراء جديد» in a
  customer's account uses the same form, so every sale is in the reports.
  A cash sale prints a «وصل البيع» ticket.
- **Serial numbers (S/N / IMEI):** one product can have many units, each with
  its own S/N (one per line in «الأرقام التسلسلية»; a USB scanner fills the box
  code after code). The quantity is the number of S/N. Deliveries add S/N and
  losses tick the ones that went (in «±», logged in حركات المخزون). In a sale,
  each unit's S/N is chosen (or scanned: the S/N finds its product); it leaves
  stock, is saved with the sale and printed on the receipt; cancelling puts it
  back. A S/N can't be in stock twice or sold twice. Scanning a sold S/N in
  المخزون says when and to whom it was sold (warranty). Columns
  «الأرقام التسلسلية (S/N)» in المخزون, المبيعات and حركات المخزون (added on their
  own to existing sheets). The «الباركود» field stays for the code that is the
  same on every box.
- **📷 Scanning (QR / barcode):** «📷 سكاني» in المخزون opens the camera. A
  code already in stock asks how many arrived (+1); a new code opens «سلعة
  جديدة» with it filled in. 📷 in the البيع search bar puts the scanned product
  in the sale. The code is kept in the «الباركود / IMEI» column. Works with
  the phone camera and with a PC webcam: phones use the browser's built-in
  reader; PCs and iPhones download a reader (`@zxing/library`, ~450 KB) the
  first time the scanner opens. The code can also be typed.
- **USB / Bluetooth barcode scanner:** no need to click anything first. In
  البيع a scan puts the product in the sale (scan twice = quantity 2); in
  المخزون it asks «شحال وصلات منها؟» for a known product or opens «سلعة جديدة»
  with the code. Works on AZERTY (French) PCs too: the app reads the physical
  keys, and repairs codes scanned into a field («é&ç…» → «219…»). A scan is
  ignored while a window (receipt, form) is open, and its Enter never presses
  a button. Scanners must end each code with Enter (the factory default).
- **Families (🗂️ الفئات in المخزون):** add or change a family, with an emoji or
  a picture (photo or file). Pictures are cropped and shrunk to 96×96 and saved
  as text in the «الأيقونة» column (about 1–5 KB, well under a cell's limit), so
  they need no other storage. «＋ فئة جديدة…» in the product form opens the same
  window. Sheets made before this column get its title added on their own.
- **المخزون (stock):** a sale takes the product out of stock; cancelling it
  (in التقارير) puts it back. Quantity changes by hand are differences
  (+3 delivered, −1 lost), so counts from two phones add up, and each one is
  logged with its reason.
- **الصندوق (cash drawer):** money in for the day = cash sales + credit advances
  + instalments. «إغلاق الصندوق» records the expenses and the cash actually
  counted; the sheet keeps the expected amount and the difference, so the owner
  can check every evening. Payments typed in that day with an earlier date are
  listed apart.
- **التقارير (reports):** today / week / month / year / custom, by family or
  product name: revenue, net profit (price − cost; lines without a known cost
  are counted apart), cash vs credit, units sold per product, chart per day or
  month. A credit sale counts on the day it is sold.

No name to type: the seller column stays empty until worker accounts are added
(`currentSeller()` in `src/lib/shop.ts`).

**New customer (+ زبون جديد)** takes 3 short steps: name and phone only →
«واش بغيتي تزيد ليه بيعة دابا؟» → the sale, for that customer, from one input:
the family buttons or the search bar. A
customer without an instalment gets one with their first sale (amount suggested
over ~10 months, period, next due date). «لا، من بعد» opens the customer's
account; until they buy something they are under «الكل».

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
   - Body. WATI fills `{{1}}`…`{{5}}` **in this order**: name, items still being paid, due
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

## Printing receipts (thermal printer)

After you record a payment, the receipt (**وصل الأداء**) opens by itself with a
**🖨️ طبع** button. In a customer's account, **وصل** next to any payment prints it
again, and **كشف الحساب** prints the whole account. It works offline too.

- **Payment receipt:** shop, receipt number (`P-…`), date and time, customer and
  number, the item it was for, the amount, and the account right after that
  payment (total, paid so far, remaining, next date, instalment).
- **Account statement:** every purchase with its date, price and what is left on
  it, every payment with its date, totals and instalment. For a long history,
  tick "only the last 12 payments" (the older ones are printed as one total).

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

- **Nothing is applied twice.** Every change has its own number; if the phone
  sends it again (the connection dropped before the answer), the server sees it
  is already there.
- **Rows can move.** Everything is found by its number (C-…, S-…, P-…), not by
  its row.
- **Other people's changes are never overwritten.** If a customer, purchase or
  payment was changed on another device while you edited it offline, your change
  is refused and listed under ⚠️ at the top: **طبقو** (apply it anyway, on the
  current version) or **تجاهل** (drop it).
- **Few requests:** a whole batch of changes is saved with about 5 Google
  requests, so a long offline day syncs in one go.
- **Archive and restore need internet**, and wait until every change is synced.
- The changes waiting on a device live in that browser's storage. Clearing the
  browser data, or uninstalling the app, before they're synced loses them.

## Security

- One shop password (`APP_PASSWORD`). After 30 days you need to log in again.
- Every page and API call requires login. Requests from other websites are refused.
- Google and WATI keys stay on the server and are never sent to the phone.
- Use a long password. Anyone with it can see and change customer debts.

## Development

```bash
npm test          # ledger rules, migration, receipts, dates, amounts, phones
npm run lint      # TypeScript check
npm run build
```

Code map:

| Path | What |
|---|---|
| `src/lib/ledger.ts` | Customers, purchases, payments, instalment changes; every change as an operation (`applyOp`, used on the phone and on the server); account summaries |
| `src/lib/ledger-sheet.ts` | Tabs and columns in the sheet; moving the old `Feuille 1` |
| `src/lib/store.ts` | Server: read the tabs, save changes (only the rows that changed), setup, archive, restore |
| `src/lib/sheets.ts` | Google Sheets API calls (batched) and the reminder log |
| `src/lib/receipt.ts` | Payment receipt and account statement |
| `src/lib/sheet-logic.ts` | Dates, amounts, phone numbers |
| `src/lib/wati.ts` | WATI template message |
| `src/app/api/…` | Server routes: `data`, `sync`, `setup`, `archive`, `reminders` |
| `src/components/useLedger.ts` | Data on the device (IndexedDB), unsent changes, sync |
| `src/components/` | Screens: list, account, forms, receipts, archive, reminders |
| `src/proxy.ts` | Login check on every request |
| `public/sw.js` | Service worker: keeps the app itself on the device so it opens offline |
