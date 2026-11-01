// How the ledger is laid out in the Google Sheet, and the one-time move from
// the old single "Feuille 1" layout (code.gs, 17 columns).

import {
  emptyLedger,
  newLedgerId,
  summarizeClient,
  type CaisseClose,
  type Category,
  type Client,
  type InstallmentChange,
  type Ledger,
  type Payment,
  type PaymentKind,
  type Purchase,
  type Sale,
  type StockItem,
  type StockMove,
} from "./ledger";
import { COL, extractNumbers, parseSheetDate, parseSum, stripStamps, todayISO } from "./sheet-logic";

export const TABS = {
  clients: "الزبناء",
  purchases: "المشتريات",
  payments: "الدفعات",
  changes: "تغييرات الطريطة",
  stock: "المخزون",
  categories: "الفئات",
  sales: "المبيعات",
  moves: "حركات المخزون",
  closings: "الصندوق اليومي",
} as const;

/** Tabs added with the shop features: created on their own in sheets set up before them. */
export const SHOP_KEYS = ["stock", "categories", "sales", "moves", "closings"] as const;

export const DEFAULT_CATEGORIES: Category[] = [
  { name: "كهرومنزلي كبير", description: "ثلاجات، غسالات، كليماتيزورات، فرنات…", marginTarget: 15, icon: "🧊" },
  { name: "هواتف وأجهزة", description: "هواتف جديدة ومستعملة، طابليط…", marginTarget: 10, icon: "📱" },
  { name: "إكسسوارات وكابلات", description: "شواحن، كابلات، تيليكوموند، كاسك…", marginTarget: 50, icon: "🔌" },
  { name: "ريباراسيون", description: "إصلاح وصيانة، تبديل الشاشة، تركيب…", marginTarget: 60, icon: "🛠️" },
  { name: "أواني منزلية", description: "أجهزة وأواني الكوزينة…", marginTarget: 25, icon: "🍳" },
];

export const ARCHIVE_TABS = {
  clients: "أرشيف الزبناء",
  purchases: "أرشيف المشتريات",
  payments: "أرشيف الدفعات",
} as const;

export type TableKey = keyof typeof TABS;

export const HEADERS: Record<TableKey, string[]> = {
  clients: [
    "رقم الزبون", "الاسم", "الهاتف", "الطريطة", "المدة", "الدفعة المقبلة", "ملاحظات",
    "مجموع المشتريات", "مجموع المدفوع", "المتبقي", "آخر دفعة", "تاريخ الإضافة", "آخر تعديل",
  ],
  purchases: ["رقم العملية", "رقم الزبون", "الزبون", "التاريخ", "السلعة", "ثمن البيع", "ملاحظات", "تاريخ الإضافة", "آخر تعديل"],
  payments: [
    "رقم الوصل", "رقم الزبون", "الزبون", "التاريخ", "الساعة", "المبلغ", "النوع", "رقم السلعة", "السلعة", "ملاحظات", "تاريخ الإضافة", "آخر تعديل",
  ],
  changes: ["رقم", "رقم الزبون", "الزبون", "التاريخ", "الطريطة القديمة", "الطريطة الجديدة", "المدة القديمة", "المدة الجديدة", "السبب", "تاريخ الإضافة"],
  stock: ["رقم السلعة", "السلعة", "الفئة", "الحالة", "ثمن الشراء", "ثمن البيع", "الكمية", "الباركود / IMEI", "ملاحظات", "تاريخ الإضافة", "آخر تعديل"],
  categories: ["الفئة", "الوصف", "هامش الربح المستهدف %", "الأيقونة"],
  sales: [
    "رقم البيع", "رقم التيكي", "التاريخ", "الساعة", "السلعة", "الفئة", "رقم السلعة فالمخزون", "الكمية",
    "ثمن الشراء", "الثمن المقترح", "ثمن البيع", "الربح", "النوع", "رقم الزبون", "الزبون", "رقم العملية",
    "البائع", "ملاحظات", "تاريخ الإضافة", "آخر تعديل",
  ],
  moves: ["رقم", "رقم السلعة", "السلعة", "التاريخ", "التغيير", "السبب", "البائع", "تاريخ الإضافة"],
  closings: [
    "رقم", "التاريخ", "الساعة", "البائع", "مبيعات الكاش", "تسبيقات الكريدي", "دفعات الطريطات", "المصاريف",
    "تفاصيل المصاريف", "الصافي فالقجر (المتوقع)", "المبلغ المحسوب", "الفرق", "ملاحظات", "تاريخ الإضافة",
  ],
};

export type Cell = string | number;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const n = (v: unknown) => (typeof v === "number" ? v : parseSum(s(v)));
/** Dates are stored as text yyyy-mm-dd; a date typed by hand in the sheet comes back as a serial number. */
const d = (v: unknown) => parseSheetDate(typeof v === "number" ? String(Math.floor(v)) : s(v));
const t = (v: unknown) => {
  if (typeof v === "number" && v < 1) {
    const minutes = Math.round(v * 24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const m = s(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "00:00";
};

// ---------------------------------------------------------------- rows → records

export function rowToClient(r: unknown[]): Client | null {
  const id = s(r[0]);
  if (!id) return null;
  return {
    id,
    name: s(r[1]),
    phone: s(r[2]),
    installment: n(r[3]),
    period: s(r[4]),
    nextDueDate: d(r[5]),
    notes: s(r[6]),
    createdAt: s(r[11]),
    updatedAt: s(r[12]),
  };
}

export function rowToPurchase(r: unknown[]): Purchase | null {
  const id = s(r[0]);
  if (!id) return null;
  return { id, clientId: s(r[1]), date: d(r[3]), item: s(r[4]), price: n(r[5]), notes: s(r[6]), createdAt: s(r[7]), updatedAt: s(r[8]) };
}

export function rowToPayment(r: unknown[]): Payment | null {
  const id = s(r[0]);
  if (!id) return null;
  const kind = s(r[6]) === "تسبيق" ? "تسبيق" : "دفعة";
  return {
    id,
    clientId: s(r[1]),
    date: d(r[3]),
    time: t(r[4]),
    amount: n(r[5]),
    kind,
    purchaseId: s(r[7]),
    notes: s(r[9]),
    createdAt: s(r[10]),
    updatedAt: s(r[11]),
  };
}

export function rowToChange(r: unknown[]): InstallmentChange | null {
  const id = s(r[0]);
  if (!id) return null;
  return {
    id,
    clientId: s(r[1]),
    date: d(r[3]),
    oldAmount: n(r[4]),
    newAmount: n(r[5]),
    oldPeriod: s(r[6]),
    newPeriod: s(r[7]),
    reason: s(r[8]),
    createdAt: s(r[9]),
  };
}

/** Whole number that can be negative (parseSum drops the sign). */
const int = (v: unknown) => Math.trunc(typeof v === "number" ? v : Number(s(v).replace(",", ".")) || 0);
/** Empty cell = unknown (null), anything else a number. */
const nn = (v: unknown) => (s(v) === "" ? null : n(v));

export function rowToStock(r: unknown[]): StockItem | null {
  const id = s(r[0]);
  if (!id) return null;
  return {
    id,
    item: s(r[1]),
    category: s(r[2]),
    condition: s(r[3]) === "مستعمل" ? "مستعمل" : "جديد",
    buyPrice: n(r[4]),
    sellPrice: n(r[5]),
    quantity: int(r[6]),
    serial: s(r[7]),
    notes: s(r[8]),
    createdAt: s(r[9]),
    updatedAt: s(r[10]),
  };
}

export function rowToCategory(r: unknown[]): Category | null {
  const name = s(r[0]);
  return name ? { name, description: s(r[1]), marginTarget: n(r[2]), icon: s(r[3]) } : null;
}

export function rowToSale(r: unknown[]): Sale | null {
  const id = s(r[0]);
  if (!id) return null;
  return {
    id,
    ticket: s(r[1]) || id,
    date: d(r[2]),
    time: t(r[3]),
    item: s(r[4]),
    category: s(r[5]),
    stockId: s(r[6]),
    quantity: Math.max(1, Math.trunc(n(r[7])) || 1),
    buyPrice: nn(r[8]),
    listPrice: n(r[9]),
    sellPrice: n(r[10]),
    type: s(r[12]) === "كريدي" ? "كريدي" : "كاش",
    clientId: s(r[13]),
    purchaseId: s(r[15]),
    seller: s(r[16]),
    notes: s(r[17]),
    createdAt: s(r[18]),
    updatedAt: s(r[19]),
  };
}

export function rowToMove(r: unknown[]): StockMove | null {
  const id = s(r[0]);
  if (!id) return null;
  return { id, stockId: s(r[1]), date: d(r[3]), delta: int(r[4]), reason: s(r[5]), seller: s(r[6]), createdAt: s(r[7]) };
}

export function rowToClosing(r: unknown[]): CaisseClose | null {
  const id = s(r[0]);
  if (!id) return null;
  return {
    id,
    date: d(r[1]),
    time: t(r[2]),
    clerk: s(r[3]),
    cashSales: n(r[4]),
    advances: n(r[5]),
    installments: n(r[6]),
    expenses: n(r[7]),
    expensesNote: s(r[8]),
    expected: n(r[9]),
    counted: nn(r[10]),
    notes: s(r[12]),
    createdAt: s(r[13]),
  };
}

export function rowsToLedger(tables: Partial<Record<TableKey, unknown[][]>>): Ledger {
  const keep = <T>(x: T | null): x is T => x !== null;
  const rows = (k: TableKey) => tables[k] ?? [];
  return {
    clients: rows("clients").map(rowToClient).filter(keep),
    purchases: rows("purchases").map(rowToPurchase).filter(keep),
    payments: rows("payments").map(rowToPayment).filter(keep),
    changes: rows("changes").map(rowToChange).filter(keep),
    stock: rows("stock").map(rowToStock).filter(keep),
    categories: rows("categories").map(rowToCategory).filter(keep),
    sales: rows("sales").map(rowToSale).filter(keep),
    moves: rows("moves").map(rowToMove).filter(keep),
    closings: rows("closings").map(rowToClosing).filter(keep),
  };
}

// ---------------------------------------------------------------- records → rows

const money = (v: number) => (v ? v : "");

/** Every row of the ledger as it should be in the sheet, keyed by id. */
export function ledgerToRows(ledger: Ledger, today = todayISO()): Record<TableKey, Map<string, Cell[]>> {
  const names = new Map(ledger.clients.map((c) => [c.id, c.name]));
  const items = new Map(ledger.purchases.map((p) => [p.id, p.item]));
  const clients = new Map<string, Cell[]>();
  for (const c of ledger.clients) {
    const sum = summarizeClient(ledger, c, today);
    clients.set(c.id, [
      c.id, c.name, c.phone, money(c.installment), c.period, c.nextDueDate, c.notes,
      sum.total, sum.paid, sum.remaining, sum.lastPaymentDate, c.createdAt, c.updatedAt,
    ]);
  }
  const purchases = new Map<string, Cell[]>(
    ledger.purchases.map((p) => [
      p.id,
      [p.id, p.clientId, names.get(p.clientId) ?? "", p.date, p.item, p.price, p.notes, p.createdAt, p.updatedAt],
    ]),
  );
  const payments = new Map<string, Cell[]>(
    ledger.payments.map((p) => [
      p.id,
      [
        p.id, p.clientId, names.get(p.clientId) ?? "", p.date, p.time, p.amount, p.kind,
        p.purchaseId, p.purchaseId ? (items.get(p.purchaseId) ?? "") : "", p.notes, p.createdAt, p.updatedAt,
      ],
    ]),
  );
  const changes = new Map<string, Cell[]>(
    ledger.changes.map((c) => [
      c.id,
      [c.id, c.clientId, names.get(c.clientId) ?? "", c.date, money(c.oldAmount), money(c.newAmount), c.oldPeriod, c.newPeriod, c.reason, c.createdAt],
    ]),
  );
  const stockNames = new Map(ledger.stock.map((x) => [x.id, x.item]));
  const stock = new Map<string, Cell[]>(
    ledger.stock.map((x) => [
      x.id,
      [x.id, x.item, x.category, x.condition, x.buyPrice, x.sellPrice, x.quantity, x.serial, x.notes, x.createdAt, x.updatedAt],
    ]),
  );
  const categories = new Map<string, Cell[]>(ledger.categories.map((c) => [c.name, [c.name, c.description, money(c.marginTarget), c.icon]]));
  const sales = new Map<string, Cell[]>(
    ledger.sales.map((x) => [
      x.id,
      [
        x.id, x.ticket, x.date, x.time, x.item, x.category, x.stockId, x.quantity,
        x.buyPrice ?? "", x.listPrice, x.sellPrice, x.buyPrice === null ? "" : round2(x.sellPrice - x.buyPrice), x.type,
        x.clientId, x.clientId ? (names.get(x.clientId) ?? "") : "", x.purchaseId, x.seller, x.notes, x.createdAt, x.updatedAt,
      ],
    ]),
  );
  const moves = new Map<string, Cell[]>(
    ledger.moves.map((m) => [m.id, [m.id, m.stockId, stockNames.get(m.stockId) ?? "", m.date, m.delta, m.reason, m.seller, m.createdAt]]),
  );
  const closings = new Map<string, Cell[]>(
    ledger.closings.map((k) => [
      k.id,
      [
        k.id, k.date, k.time, k.clerk, k.cashSales, k.advances, k.installments, k.expenses, k.expensesNote, k.expected,
        k.counted ?? "", k.counted === null ? "" : round2(k.counted - k.expected), k.notes, k.createdAt,
      ],
    ]),
  );
  return { clients, purchases, payments, changes, stock, categories, sales, moves, closings };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Same content? Numbers and their text form count as equal ("500" = 500). */
export function sameRow(a: unknown[], b: Cell[]): boolean {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? "";
    const y = b[i] ?? "";
    if (x === y) continue;
    if (String(x).trim() === String(y).trim()) continue;
    if (typeof y === "number" && Number(x) === y) continue;
    if (typeof x === "number" && Number(y) === x) continue;
    return false;
  }
  return true;
}

// ---------------------------------------------------------------- migration from Feuille 1

const STAMP = /\(\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s*-\s*(\d{1,2}):(\d{2}))?[^)]*\)/;

function stampOf(part: string): { date: string; time: string } | null {
  const m = part.match(STAMP);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const date = parseSheetDate(`${m[1]}/${m[2]}/${year}`);
  if (!date) return null;
  return { date, time: m[4] ? `${m[4].padStart(2, "0")}:${m[5]}` : "00:00" };
}

function parts(text: string): string[] {
  return text.split("+").map((x) => x.trim()).filter(Boolean);
}

/**
 * Turn the old rows of "Feuille 1" (one row per customer: items and payments
 * joined with "+", with "(dd/MM/yyyy - HH:mm)" stamps) into the new ledger.
 */
export function migrateOldRows(rows: unknown[][], now = new Date()): Ledger {
  const ledger: Ledger = emptyLedger();
  const createdAt = now.toISOString();
  const today = todayISO(now);
  for (const raw of rows) {
    const cell = (i: number) => s(raw[i]);
    const name = cell(COL.name);
    const itemsText = cell(COL.items);
    if (!name && !itemsText) continue;

    const installmentText = cell(COL.installment);
    const client: Client = {
      id: newLedgerId("C"),
      name: name || "بلا اسم",
      phone: cell(COL.phone),
      installment: extractNumbers(installmentText).length ? parseSum(installmentText) : 0,
      period: cell(COL.period),
      nextDueDate: parseSheetDate(cell(COL.dueDate)),
      // Keep anything that isn't a plain amount ("حسب الاتفاق"…) as a note.
      notes: installmentText && !extractNumbers(installmentText).length ? `الطريطة: ${installmentText}` : "",
      createdAt,
      updatedAt: createdAt,
    };
    ledger.clients.push(client);

    // Purchases: one per "+" part of column C, prices from column D in the same order.
    const itemParts = parts(itemsText);
    const prices = parts(cell(COL.sell)).map(parseSum);
    const totalPrice = parseSum(cell(COL.sell));
    const sameCount = prices.length === itemParts.length && itemParts.length > 0;
    const firstDate = itemParts.map(stampOf).find(Boolean)?.date ?? today;
    const purchases: Purchase[] = [];
    if (sameCount) {
      itemParts.forEach((part, i) => {
        purchases.push({
          id: newLedgerId("S"),
          clientId: client.id,
          date: stampOf(part)?.date ?? firstDate,
          item: stripStamps(part) || "سلعة",
          price: prices[i],
          notes: "",
          createdAt,
          updatedAt: createdAt,
        });
      });
    } else if (totalPrice > 0 || itemsText) {
      // Prices don't match the items one by one: keep it as one purchase.
      purchases.push({
        id: newLedgerId("S"),
        clientId: client.id,
        date: firstDate,
        item: stripStamps(itemsText) || "سلعة",
        price: totalPrice || 0,
        notes: sameCount ? "" : `من الورقة القديمة: ${cell(COL.sell)}`,
        createdAt,
        updatedAt: createdAt,
      });
    }
    ledger.purchases.push(...purchases.filter((p) => p.price > 0));

    // Payments: one per "+" part of column G.
    parts(cell(COL.advance)).forEach((part, i) => {
      const amount = parseSum(part);
      if (amount <= 0) return;
      const when = stampOf(part) ?? { date: firstDate, time: "00:00" };
      const kind: PaymentKind = i === 0 ? "تسبيق" : "دفعة";
      ledger.payments.push({
        id: newLedgerId("P"),
        clientId: client.id,
        purchaseId: i === 0 && purchases[0]?.price > 0 ? purchases[0].id : "",
        date: when.date,
        time: when.time,
        amount,
        kind,
        notes: "",
        createdAt,
        updatedAt: createdAt,
      });
    });
  }
  return ledger;
}
