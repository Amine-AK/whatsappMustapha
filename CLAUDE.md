# CLAUDE.md: project map for ELECTRO-LMESTOUR

Read this first. It says where things are, so you can open the right file
directly instead of exploring. Keep it up to date when files move or features
are added (one line per file is enough).

## What the project is

A shop app for **ELECTRO-LMESTOUR** (electronics / household goods, Morocco):
customer credit (الكريدي), cash and credit sales, stock with the shop's own
barcodes and sticker printing, the daily cash drawer, reports, and WhatsApp
reminders. Installable PWA, used on phones and the shop PC, works offline.

- **The live app is `web/`** (Next.js 16 App Router, React 19, TypeScript, no
  UI framework, plain CSS). Deployed on **Vercel** from `main` (root dir `web`).
- **Database = one Google Sheet** (Sheets REST API, service account), one tab
  per table. No SQL database (`db/` is an unused design).
- `reminder/`, `tests/`, `requirements.txt`, root `README.md`: the **old**
  Python + Playwright WhatsApp tool. Not used by the app; leave alone.
- Detailed user-facing docs: `web/README.md` (long; search it, don't read it all).

## Conventions (follow them)

- **UI language: Moroccan Darija in Arabic script, RTL.** All labels, hints,
  errors and messages the user sees are Darija (e.g. «سلعة جديدة», «باقي»).
  Code, comments, commit messages and PR text are in **English**.
  The user writes in English, French-ish English or Arabic; answer in their language.
- Money: `money()` in `src/lib/format.ts` → «4.050 درهم». Amounts typed by
  users: `parseAmount()` in `src/components/ui.tsx`.
- Dates: ISO `yyyy-mm-dd` in data; `displayDate()` in `src/lib/receipt.ts` for
  dd/mm/yyyy; shop time zone Africa/Casablanca (`src/lib/sheet-logic.ts`).
- IDs: `newLedgerId(prefix)` in `src/lib/ledger.ts`, prefixes: C client,
  S purchase, P payment, T instalment change, O op, I stock item, V sale,
  M stock move, K cash-drawer close.
- Comments explain *why*, short, in plain English. Keep files' existing style.
- Every user-visible number on phones: `<bdi dir="ltr">` around codes / digits.
- Per-device settings go in `localStorage` (try/catch every access). Keys in use:
  `view`, `theme`, `label-setup`, `label-size`, `label-price`, `receipt-paper`,
  `scanner-camera`, `backup-last`, `backup-snooze`, `ledger-queue`,
  `ledger-snapshot`, `label-print-test` (old, migrated).

## Data flow (credit + shop ledger)

```
phone/PC                                   server (Next route)        Google Sheet
useLedger.ts ── snapshot + queue of ops ──► /api/sync ─► store.sync() ─► tabs
  (IndexedDB via lib/idb.ts, offline)       /api/data ◄─ store.loadLedger()
UI calls data.run(label, ...ops)  →  op queued, applied locally (optimistic), sent when online
```

- **All changes are ops** (`LedgerOp` in `src/lib/ledger.ts`, applied by
  `applyOp`). Op types: `client.add/update/delete/installment`,
  `purchase.add/update/delete`, `payment.add/update/delete`,
  `stock.add/update/adjust/delete`, `sale.add/delete`, `category.save`,
  `caisse.close`. Edits carry `base` (= record's `updatedAt`) → conflicts.
- Server checks permissions per op: `src/app/api/sync/route.ts` +
  `src/lib/permissions.ts` (pure, tested) + `src/lib/access.ts`.
- Sheet layout (tab names, columns, row ↔ object): `src/lib/ledger-sheet.ts`
  (`TABS`: الزبناء, المشتريات, الدفعات, تغييرات الطريطة, المخزون, الفئات,
  المبيعات, حركات المخزون, الصندوق اليومي). Users tab: «المستخدمين» (`src/lib/users.ts`).
  Archive tabs: `src/lib/store.ts`.
- Credit math (remaining per customer and per product, payment split, due
  status): `summarizeClient`, `itemStatuses`, `paymentSplit` in `src/lib/ledger.ts`.
  A payment bigger than what is left on its product spills to the oldest unpaid products.

## Where to change what

| Task / feature | File(s) |
|---|---|
| App shell, main tabs (الكريدي / البيع / المخزون / الصندوق / التقارير), customer list, search | `components/Dashboard.tsx` (`VIEWS`) |
| Customer page (purchases, payments, delete) | `components/ClientDetail.tsx` |
| Add / edit customer, instalment (الطريطة) | `components/ClientForms.tsx` |
| Add purchase, record / edit payment (split hint, next due date) | `components/MoneyForms.tsx` |
| Payment receipt, statement (كشف), WhatsApp message texts | `lib/receipt.ts` (texts) + `components/ReceiptDialog.tsx` (screen / print) |
| WhatsApp reminders (WATI) | `components/RemindersDialog.tsx`, `app/api/reminders/*`, `lib/wati.ts`, `lib/reminders.ts` |
| Sale (cart, cash / credit, scan into sale) | `components/SaleForm.tsx`; cash ticket `components/SaleTicket.tsx` |
| Stock list, product form (codes, barcode popup), quantity ±, unknown scanned code, category chips | `components/StockView.tsx` (StockForm, AdjustForm, UnknownCode inside) |
| Product families (categories) | `components/CategoryForm.tsx`, `components/CategoryIcon.tsx`, `lib/image.ts` |
| Stock search, cash drawer math, reports math | `lib/shop.ts` |
| Cash drawer screen | `components/CaisseView.tsx` |
| Reports screen | `components/ReportsView.tsx` |
| Shop barcodes (EAN-13 starting with 2, new number) | `lib/barcode.ts` |
| Sticker printing window (sizes, list, 🔄 / ⬇️, print pages) | `components/LabelPrint.tsx` |
| Printer setup panel (gap, margins, shift, lines, sizes, rotation, Paysage, driver page) | `components/LabelSetup.tsx` (UI + `useLabelSetup`) |
| Sticker layout math (pitch, pages, @page CSS, moves, resize) | `lib/label-layout.ts` (pure, tested) |
| Canva-like sticker editor (1 finger move, 2 fingers resize) | `components/StickerEditor.tsx` |
| Barcode / sticker PNG download | `lib/barcode-image.ts` |
| Camera scanner UI (modal, history list, torch, hint, messages) | `components/BarcodeScanner.tsx` (public API: props `title, onResult, onClose, continuous, paused`; exports `cleanCode`, `ScanFeedback`, `SCAN_HINT`, `NOT_BARCODE`) |
| Scanner engine (formats + check digits, 2-read confirm, decode region, worker, camera tuning) | `src/scanner/*` (see below) |
| USB / Bluetooth scanner (keyboard input, AZERTY fix) | `components/useScannerInput.ts`, `lib/scanner-input.ts` |
| Beep sound | `lib/beep.ts` |
| Login, session cookie, users / roles / services | `app/login/page.tsx`, `app/api/login`, `lib/auth.ts`, `lib/users.ts`, `lib/roles.ts`, `components/UsersDialog.tsx` |
| Who may do what (UI hides, server enforces) | `lib/roles.ts` (`can`, `seesCost`), `lib/permissions.ts` |
| Route protection (what needs login) | `src/proxy.ts` (matcher: login, PWA files, `/scanner/` are public) |
| Offline / PWA | `public/sw.js` (cache version `VERSION`), `components/RegisterServiceWorker.tsx`, `components/InstallButton.tsx`, `app/manifest.ts`, `lib/idb.ts` |
| Sync state bar | `components/SyncBar.tsx` |
| Header menu (backup, theme, logout) | `components/TopMenu.tsx`; theme `lib/theme.ts` |
| Excel backup | `lib/xlsx.ts`, `lib/backup.ts`, `components/BackupDialog.tsx`, `app/api/export` |
| Archive (old customers) | `components/ArchiveView.tsx`, `app/api/archive/*`, `lib/store.ts` |
| Sheets API client / env vars | `lib/sheets.ts`, `lib/env.ts` |
| Modals (full screen on phones, back button) | `components/Modal.tsx`; shared bits `components/ui.tsx` (`Field`, `Confirm`, `parseAmount`) |
| All styles | `src/app/globals.css` (one file, sections by feature; search the class name) |
| DEV ONLY reset | `lib/dev-reset.ts`, `components/DevReset.tsx`, `app/api/dev/reset` |

### Scanner engine (`web/src/scanner/`)

- `formats.ts`: `PRODUCT_FORMATS` (EAN/UPC), `QR_FORMATS`, `SN_FORMATS`, `codeKind()`, `isValidRead()` (check digits).
- `confirm.ts`: accept after 2 identical reads; same code ignored while in view / 1.5 s; `resume()`.
- `roi.ts`: guide rectangle (80% × 35%) → video pixels (object-fit cover).
- `detector.ts`: native `BarcodeDetector` or `barcode-detector` ponyfill; `.wasm` from `/scanner/zxing_reader.wasm`.
- `decoder.worker.ts` + `decoder.ts`: decode in a Web Worker (ImageBitmap crop), main-thread fallback.
- `camera.ts`: secure-context / errors, best rear lens (saved), focus / zoom / exposure / torch.
- `session.ts`: frame loop (`requestVideoFrameCallback`, drop frames while busy), pause, hint, cleanup.
- The `.wasm` is copied by `web/scripts/copy-zxing-wasm.mjs` (postinstall / predev / prebuild) into
  `web/public/scanner/` (git-ignored).

## Environment variables (server)

`APP_PASSWORD`, `SESSION_SECRET` (≥ 32 chars), `GOOGLE_SHEET_ID`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, optional
`GOOGLE_SHEET_NAME`, `GOOGLE_SHEETS_API_BASE`, `GOOGLE_ACCESS_TOKEN`,
`ALLOW_DATA_RESET`, `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN`,
`WATI_TEMPLATE_NAME`, `WATI_BROADCAST_NAME`, `WATI_CHANNEL_NUMBER`
(see `web/src/lib/env.ts`). None are available in the cloud sandbox.

## Commands (run in `web/`)

- `npm ci` (also copies the scanner `.wasm`)
- `npx tsc --noEmit`: type check (the "lint" script)
- `npx vitest run` / `npx vitest run src/lib/ledger.test.ts`: tests
- `npm run build`: production build (works without env vars)
- Known: **2 tests in `src/lib/sheet-logic.test.ts` (Casablanca time) fail in
  the sandbox** (timezone data) and on `main` too. Not caused by your change.

Tests live next to the code: `src/lib/*.test.ts`, `src/scanner/scanner.test.ts`.
Put new logic in pure functions in `lib/` (or `scanner/`) and test it there.

## Checking UI changes in the sandbox (no Google Sheet, no login)

The proxy lets any path starting with `login` through, so a **temporary** page
can render a component with fake data:

1. Create `web/src/app/login-xtest/page.tsx` that renders e.g.
   `<StockView data={{ ledger: {...}, me: { role: "owner" }, run: () => {} } as never} onToast={() => {}} />`
   (`LabelPrint`, `BarcodeScanner`, `StockView` all work this way).
2. `npx next dev -p 3123` in the background, then Playwright
   (`require('playwright')`, Chromium pre-installed) for screenshots / PDF.
   Camera: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
   and `--use-file-for-fake-video-capture=<file>.y4m` (make the y4m from PNGs
   with ffmpeg; all PNGs must be the same mode, e.g. RGB 640×480).
3. **Delete the test page, `.next/` and `web/AGENTS.md`** (created by next dev)
   before committing.

Notes: launch Chromium with `LANG=C.UTF-8` or Arabic download file names come
out as "download". Two-finger touch can't be sent through CDP; dispatch
`PointerEvent`s in the page instead. On phone width, `.search-row` uses
negative margins that need the app's page padding (overflows in bare test pages).

## Git / PR workflow used here

- Work on the session's `claude/...` branch; when its PR was merged, continue
  from `origin/main` (fast-forward) on the same branch name.
- The owner tests only on the deployed app, so after a change they usually say
  **"pull request and merge"**: open the PR (English, What / Checks sections,
  footer from the session) and merge it with `merge_method: merge`.
- Temporary / experimental work is marked `[TEST]` in the PR title.
- No force-push (blocked); use merges instead of rebases.
