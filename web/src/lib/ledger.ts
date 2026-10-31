// The shop's credit ledger: customers, their purchases, their payments and the
// history of their instalment (الطريطة). One debt per customer = everything they
// bought minus everything they paid.
//
// Every change is an operation with its own id. The same `applyOp` runs on the
// phone (to show the change at once, even offline) and on the server (to save
// it in the Google Sheet), so both always agree. Operations are safe to send
// twice: a second copy is recognised and skipped.

import { addDays, addMonths, dueStatus, isISODate, isManualPeriod, nextDateForPeriod, type DueStatus } from "./sheet-logic";

export interface Client {
  id: string;
  name: string;
  phone: string;
  /** Agreed instalment in dirhams, 0 = not set. */
  installment: number;
  /** سيمانة / 15 يوم / شهر / تحديد يدوي */
  period: string;
  /** yyyy-mm-dd or "" */
  nextDueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  clientId: string;
  /** yyyy-mm-dd */
  date: string;
  item: string;
  price: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const PAYMENT_KINDS = ["تسبيق", "دفعة"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export interface Payment {
  id: string;
  clientId: string;
  /** The purchase this payment is for, "" = general. */
  purchaseId: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm */
  time: string;
  amount: number;
  kind: PaymentKind;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentChange {
  id: string;
  clientId: string;
  date: string;
  oldAmount: number;
  newAmount: number;
  oldPeriod: string;
  newPeriod: string;
  reason: string;
  createdAt: string;
}

// ---------------------------------------------------------------- shop: stock, sales, cash drawer

export const CONDITIONS = ["جديد", "مستعمل"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** A product in stock (المخزون). */
export interface StockItem {
  id: string;
  item: string;
  category: string;
  condition: Condition;
  /** Cost of one unit. */
  buyPrice: number;
  /** Suggested selling price of one unit. */
  sellPrice: number;
  /** Can go below 0 when sold before being counted in: shown as a warning. */
  quantity: number;
  /** Barcode of the product (the same on every box), optional. */
  serial: string;
  /** Serial numbers / IMEI of the units in stock, one per unit. Empty = not tracked by S/N. */
  serials: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Product family (الفئات), used to group sales in the reports. */
export interface Category {
  name: string;
  description: string;
  /** Target margin in %, 0 = none. */
  marginTarget: number;
  /** An emoji, or a small picture as a data: URL (96×96, fits in one sheet cell). "" = automatic icon. */
  icon: string;
}

/** Longest icon kept: a sheet cell holds 50,000 characters. */
export const MAX_ICON_LENGTH = 45_000;

export function validIcon(icon: unknown): icon is string {
  if (typeof icon !== "string") return false;
  if (icon === "") return true;
  if (icon.startsWith("data:")) return icon.length <= MAX_ICON_LENGTH && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(icon);
  return icon.length <= 16 && !/[<>"'`\s]/.test(icon);
}

export const SALE_TYPES = ["كاش", "كريدي"] as const;
export type SaleType = (typeof SALE_TYPES)[number];

/** One line of a sale (المبيعات): every sale, cash or credit, is logged here. */
export interface Sale {
  id: string;
  /** Lines sold together share the ticket (the id of the first line). */
  ticket: string;
  date: string;
  time: string;
  item: string;
  category: string;
  /** Product taken from stock, "" = typed by hand. */
  stockId: string;
  quantity: number;
  /** Total cost of the line, null = unknown (typed by hand without a cost). */
  buyPrice: number | null;
  /** Total suggested price, before any discount. */
  listPrice: number;
  /** Total price paid by the customer. */
  sellPrice: number;
  type: SaleType;
  /** Credit only. */
  clientId: string;
  /** Credit only: the purchase on the customer's account. */
  purchaseId: string;
  /** Serial numbers / IMEI of the units sold (for the warranty). */
  serials: string[];
  seller: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Stock counted in or out by hand (حركات المخزون); sales move stock on their own. */
export interface StockMove {
  id: string;
  stockId: string;
  date: string;
  delta: number;
  /** Units that came in (+) or went out (−), by serial number. */
  serialsIn?: string[];
  serialsOut?: string[];
  reason: string;
  seller: string;
  createdAt: string;
}

/** End of day count of the cash drawer (الصندوق اليومي). */
export interface CaisseClose {
  id: string;
  date: string;
  time: string;
  clerk: string;
  cashSales: number;
  advances: number;
  installments: number;
  expenses: number;
  expensesNote: string;
  /** What should be in the drawer. */
  expected: number;
  /** What was counted, null = not counted. */
  counted: number | null;
  notes: string;
  createdAt: string;
}

export interface Ledger {
  clients: Client[];
  purchases: Purchase[];
  payments: Payment[];
  changes: InstallmentChange[];
  stock: StockItem[];
  categories: Category[];
  sales: Sale[];
  moves: StockMove[];
  closings: CaisseClose[];
}

export function emptyLedger(): Ledger {
  return { clients: [], purchases: [], payments: [], changes: [], stock: [], categories: [], sales: [], moves: [], closings: [] };
}

export const EMPTY_LEDGER: Ledger = emptyLedger();

/** A ledger saved by an older version of the app (before the shop tabs) gets the missing lists. */
export function normalizeLedger(l: Partial<Ledger> | null | undefined): Ledger {
  const full = { ...emptyLedger(), ...(l ?? {}) } as Ledger;
  return {
    ...full,
    stock: full.stock.map((s) => (Array.isArray(s.serials) ? s : { ...s, serials: [] })),
    sales: full.sales.map((s) => (Array.isArray(s.serials) ? s : { ...s, serials: [] })),
  };
}

// ---------------------------------------------------------------- ids

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read on a receipt

/**
 * "C-7K2QXM9A": prefix C (client), S (purchase), P (payment), T (instalment change), O (operation),
 * I (stock item), V (sale), M (stock move), K (cash drawer closing).
 */
export type IdPrefix = "C" | "S" | "P" | "T" | "O" | "I" | "V" | "M" | "K";
export function newLedgerId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}-${Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("")}`;
}

const ID_RE = /^[CSPTOIVMK]-[A-Z0-9]{4,16}$/;
export const isLedgerId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);

// ---------------------------------------------------------------- operations

type OpBody =
  | { type: "client.add"; client: Client }
  | { type: "client.update"; id: string; base: string; patch: Partial<Pick<Client, "name" | "phone" | "notes" | "nextDueDate">> }
  /** withHistory: also delete their purchases, payments and instalment changes (their sales are cancelled). */
  | { type: "client.delete"; id: string; withHistory?: boolean }
  | { type: "client.installment"; id: string; base: string; change: InstallmentChange; nextDueDate?: string }
  | { type: "purchase.add"; purchase: Purchase }
  | { type: "purchase.update"; id: string; base: string; patch: Partial<Pick<Purchase, "date" | "item" | "price" | "notes">> }
  | { type: "purchase.delete"; id: string }
  | { type: "payment.add"; payment: Payment; nextDueDate?: string }
  | {
      type: "payment.update";
      id: string;
      base: string;
      patch: Partial<Pick<Payment, "clientId" | "purchaseId" | "date" | "time" | "amount" | "kind" | "notes">>;
    }
  | { type: "payment.delete"; id: string }
  | { type: "stock.add"; item: StockItem }
  | {
      type: "stock.update";
      id: string;
      base: string;
      patch: Partial<Pick<StockItem, "item" | "category" | "condition" | "buyPrice" | "sellPrice" | "serial" | "notes">>;
    }
  | { type: "stock.adjust"; move: StockMove }
  | { type: "stock.delete"; id: string }
  | { type: "category.save"; category: Category }
  /** Lines sold together; a credit sale also brings the purchases for the customer's account. */
  | { type: "sale.add"; lines: Sale[]; purchases: Purchase[] }
  /** Cancel one line: the product goes back to stock, its purchase leaves the customer's account. */
  | { type: "sale.delete"; id: string }
  | { type: "caisse.close"; close: CaisseClose };

export type LedgerOp = OpBody & {
  /** Unique id of this change. */
  opId: string;
  /** When it was made (ISO). Becomes the record's updatedAt. */
  at: string;
};

export type OpResult = "ok" | "already" | "conflict" | "invalid";

export interface Applied {
  ledger: Ledger;
  result: OpResult;
  message?: string;
}

const CONFLICT = "تبدلات هاد المعلومات من جهاز آخر قبل ما توصل هاد التعديلات.";

function invalid(ledger: Ledger, message: string): Applied {
  return { ledger, result: "invalid", message };
}

const text = (v: unknown, max = 500) => typeof v === "string" && v.length <= max;
const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000_000;
const date = (v: unknown) => typeof v === "string" && (v === "" || isISODate(v));
const time = (v: unknown) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

function checkClient(c: Client): string | null {
  if (!isLedgerId(c.id) || !c.id.startsWith("C-")) return "رقم الزبون غير صحيح";
  if (!text(c.name, 200) || !c.name.trim()) return "الاسم ضروري";
  if (!text(c.phone, 40) || !text(c.period, 40) || !text(c.notes, 1000)) return "معلومات الزبون غير صحيحة";
  if (!money(c.installment)) return "مبلغ الطريطة غير صحيح";
  if (!date(c.nextDueDate) || !text(c.createdAt, 40)) return "التاريخ غير صحيح";
  return null;
}

function checkPurchase(p: Purchase): string | null {
  if (!isLedgerId(p.id) || !p.id.startsWith("S-") || !isLedgerId(p.clientId)) return "رقم العملية غير صحيح";
  if (!text(p.item, 300) || !p.item.trim()) return "السلعة ضرورية";
  if (!money(p.price) || p.price <= 0) return "ثمن البيع غير صحيح";
  if (!date(p.date) || !p.date || !text(p.createdAt, 40)) return "التاريخ غير صحيح";
  if (!text(p.notes, 1000)) return "الملاحظة طويلة بزاف";
  return null;
}

function checkPayment(p: Payment): string | null {
  if (!isLedgerId(p.id) || !p.id.startsWith("P-") || !isLedgerId(p.clientId)) return "رقم الوصل غير صحيح";
  if (p.purchaseId && !isLedgerId(p.purchaseId)) return "السلعة غير صحيحة";
  if (!money(p.amount) || p.amount <= 0) return "المبلغ غير صحيح";
  if (!date(p.date) || !p.date || !time(p.time) || !text(p.createdAt, 40)) return "التاريخ غير صحيح";
  if (!PAYMENT_KINDS.includes(p.kind)) return "نوع الدفعة غير صحيح";
  if (!text(p.notes, 1000)) return "الملاحظة طويلة بزاف";
  return null;
}

const amount = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100_000_000;

export const MAX_SERIALS = 500;

/** A list of serial numbers: short codes, no duplicates. */
function serialList(v: unknown, max = MAX_SERIALS): v is string[] {
  if (!Array.isArray(v) || v.length > max) return false;
  if (!v.every((x) => typeof x === "string" && x.trim() !== "" && x.length <= 100 && !/[\n\r]/.test(x))) return false;
  return new Set(v.map((x) => x.trim().toLowerCase())).size === v.length;
}
const sameSerial = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function checkStock(s: StockItem): string | null {
  if (!isLedgerId(s.id) || !s.id.startsWith("I-")) return "رقم السلعة غير صحيح";
  if (!text(s.item, 300) || !s.item.trim()) return "اسم السلعة ضروري";
  if (!text(s.category, 100) || !text(s.serial, 100) || !text(s.notes, 1000)) return "معلومات السلعة غير صحيحة";
  if (!CONDITIONS.includes(s.condition)) return "الحالة غير صحيحة";
  if (!money(s.buyPrice) || !money(s.sellPrice)) return "الثمن غير صحيح";
  if (!amount(s.quantity) || !Number.isInteger(s.quantity)) return "الكمية غير صحيحة";
  if (!serialList(s.serials ?? [])) return "الأرقام التسلسلية (S/N) غير صحيحة ولا مكررة";
  return null;
}

function checkSale(s: Sale): string | null {
  if (!isLedgerId(s.id) || !s.id.startsWith("V-") || !isLedgerId(s.ticket)) return "رقم البيع غير صحيح";
  if (!text(s.item, 300) || !s.item.trim() || !text(s.category, 100)) return "السلعة ضرورية";
  if (!SALE_TYPES.includes(s.type)) return "نوع البيع غير صحيح";
  if (!Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > 10_000) return "الكمية غير صحيحة";
  if (!money(s.sellPrice) || !money(s.listPrice) || (s.buyPrice !== null && !money(s.buyPrice))) return "الثمن غير صحيح";
  if (!date(s.date) || !s.date || !time(s.time) || !text(s.createdAt, 40)) return "التاريخ غير صحيح";
  if (!text(s.seller, 100) || !text(s.notes, 1000)) return "معلومات البيع غير صحيحة";
  if (s.stockId && !isLedgerId(s.stockId)) return "السلعة غير صحيحة";
  if (!serialList(s.serials ?? [], s.quantity) || (s.serials?.length && s.serials.length !== s.quantity)) return "الأرقام التسلسلية (S/N) غير صحيحة";
  return null;
}

/** Keep only the fields an edit is allowed to change (data from the network is not trusted). */
function pick<T extends object>(patch: unknown, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  if (patch && typeof patch === "object") {
    for (const k of keys) if (k in patch) out[k] = (patch as T)[k];
  }
  return out;
}

function replace<T extends { id: string }>(list: T[], id: string, next: T): T[] {
  return list.map((x) => (x.id === id ? next : x));
}

/**
 * Apply one change. Never mutates `ledger`.
 * - "already": this exact change is already there (sent twice) → nothing to do.
 * - "conflict": the record was changed elsewhere since this change was made.
 * - "invalid": refused (bad values, unknown customer…).
 */
export function applyOp(ledger: Ledger, op: LedgerOp): Applied {
  const findClient = (id: string) => ledger.clients.find((c) => c.id === id);
  switch (op.type) {
    case "client.add": {
      if (findClient(op.client.id)) return { ledger, result: "already" };
      const err = checkClient(op.client);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, clients: [...ledger.clients, { ...op.client, updatedAt: op.at }] }, result: "ok" };
    }
    case "client.update": {
      const c = findClient(op.id);
      if (!c) return invalid(ledger, "الزبون ما بقاش");
      if (c.updatedAt === op.at) return { ledger, result: "already" };
      if (c.updatedAt !== op.base) return { ledger, result: "conflict", message: CONFLICT };
      const next = { ...c, ...pick<Client>(op.patch, ["name", "phone", "notes", "nextDueDate"]), updatedAt: op.at };
      const err = checkClient(next);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, clients: replace(ledger.clients, c.id, next) }, result: "ok" };
    }
    case "client.delete": {
      if (!findClient(op.id)) return { ledger, result: "already" };
      const hasHistory = ledger.purchases.some((p) => p.clientId === op.id) || ledger.payments.some((p) => p.clientId === op.id);
      if (hasHistory && op.withHistory !== true) {
        return invalid(ledger, "هاد الزبون عندو مشتريات ولا دفعات. ما يمكنش يتمسح، أرشفه ملي يخلص.");
      }
      // Everything of this customer goes; their credit sales are cancelled and the products go back to stock.
      const purchaseIds = new Set(ledger.purchases.filter((p) => p.clientId === op.id).map((p) => p.id));
      const cancelled = ledger.sales.filter((s) => s.clientId === op.id || purchaseIds.has(s.purchaseId));
      const cancelledIds = new Set(cancelled.map((s) => s.id));
      return {
        ledger: {
          ...restock(ledger, cancelled, op.at),
          clients: ledger.clients.filter((c) => c.id !== op.id),
          purchases: ledger.purchases.filter((p) => p.clientId !== op.id),
          payments: ledger.payments.filter((p) => p.clientId !== op.id),
          changes: ledger.changes.filter((x) => x.clientId !== op.id),
          sales: ledger.sales.filter((s) => !cancelledIds.has(s.id)),
        },
        result: "ok",
      };
    }
    case "client.installment": {
      const c = findClient(op.id);
      if (!c) return invalid(ledger, "الزبون ما بقاش");
      if (ledger.changes.some((x) => x.id === op.change.id)) return { ledger, result: "already" };
      if (c.updatedAt !== op.base) return { ledger, result: "conflict", message: CONFLICT };
      const ch = op.change;
      if (!isLedgerId(ch.id) || ch.clientId !== c.id || !money(ch.newAmount) || !text(ch.newPeriod, 40) || !text(ch.reason, 300) || !date(ch.date)) {
        return invalid(ledger, "تغيير الطريطة غير صحيح");
      }
      if (op.nextDueDate !== undefined && !date(op.nextDueDate)) return invalid(ledger, "التاريخ غير صحيح");
      const next: Client = {
        ...c,
        installment: ch.newAmount,
        period: ch.newPeriod,
        nextDueDate: op.nextDueDate ?? c.nextDueDate,
        updatedAt: op.at,
      };
      const change: InstallmentChange = { ...ch, oldAmount: c.installment, oldPeriod: c.period };
      return {
        ledger: { ...ledger, clients: replace(ledger.clients, c.id, next), changes: [...ledger.changes, change] },
        result: "ok",
      };
    }
    case "purchase.add": {
      if (ledger.purchases.some((p) => p.id === op.purchase.id)) return { ledger, result: "already" };
      if (!findClient(op.purchase.clientId)) return invalid(ledger, "الزبون ما بقاش");
      const err = checkPurchase(op.purchase);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, purchases: [...ledger.purchases, { ...op.purchase, updatedAt: op.at }] }, result: "ok" };
    }
    case "purchase.update": {
      const p = ledger.purchases.find((x) => x.id === op.id);
      if (!p) return invalid(ledger, "هاد السلعة ما بقاتش");
      if (p.updatedAt === op.at) return { ledger, result: "already" };
      if (p.updatedAt !== op.base) return { ledger, result: "conflict", message: CONFLICT };
      const next = { ...p, ...pick<Purchase>(op.patch, ["date", "item", "price", "notes"]), updatedAt: op.at };
      const err = checkPurchase(next);
      if (err) return invalid(ledger, err);
      // The sale behind this purchase follows the new price, date and name.
      const sales = ledger.sales.map((s) =>
        s.purchaseId === p.id ? { ...s, item: next.item, date: next.date, sellPrice: next.price, updatedAt: op.at } : s,
      );
      return { ledger: { ...ledger, purchases: replace(ledger.purchases, p.id, next), sales }, result: "ok" };
    }
    case "purchase.delete": {
      if (!ledger.purchases.some((p) => p.id === op.id)) return { ledger, result: "already" };
      // The sale behind it is cancelled too, and its product goes back to stock.
      const cancelled = ledger.sales.filter((s) => s.purchaseId === op.id);
      return {
        ledger: {
          ...restock(ledger, cancelled, op.at),
          purchases: ledger.purchases.filter((p) => p.id !== op.id),
          sales: ledger.sales.filter((s) => s.purchaseId !== op.id),
          // Payments for that item stay, as general payments.
          payments: ledger.payments.map((p) => (p.purchaseId === op.id ? { ...p, purchaseId: "" } : p)),
        },
        result: "ok",
      };
    }
    case "payment.add": {
      if (ledger.payments.some((p) => p.id === op.payment.id)) return { ledger, result: "already" };
      const c = findClient(op.payment.clientId);
      if (!c) return invalid(ledger, "الزبون ما بقاش");
      const err = checkPayment(op.payment);
      if (err) return invalid(ledger, err);
      if (op.nextDueDate !== undefined && !date(op.nextDueDate)) return invalid(ledger, "التاريخ غير صحيح");
      const payment = { ...op.payment, purchaseId: purchaseOf(ledger, op.payment.purchaseId, c.id), updatedAt: op.at };
      const clients = op.nextDueDate !== undefined ? replace(ledger.clients, c.id, { ...c, nextDueDate: op.nextDueDate }) : ledger.clients;
      return { ledger: { ...ledger, clients, payments: [...ledger.payments, payment] }, result: "ok" };
    }
    case "payment.update": {
      const p = ledger.payments.find((x) => x.id === op.id);
      if (!p) return invalid(ledger, "هاد الدفعة ما بقاتش");
      if (p.updatedAt === op.at) return { ledger, result: "already" };
      if (p.updatedAt !== op.base) return { ledger, result: "conflict", message: CONFLICT };
      const next = { ...p, ...pick<Payment>(op.patch, ["clientId", "purchaseId", "date", "time", "amount", "kind", "notes"]), updatedAt: op.at };
      if (!findClient(next.clientId)) return invalid(ledger, "الزبون ما بقاش");
      next.purchaseId = purchaseOf(ledger, next.purchaseId, next.clientId);
      const err = checkPayment(next);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, payments: replace(ledger.payments, p.id, next) }, result: "ok" };
    }
    case "payment.delete": {
      if (!ledger.payments.some((p) => p.id === op.id)) return { ledger, result: "already" };
      return { ledger: { ...ledger, payments: ledger.payments.filter((p) => p.id !== op.id) }, result: "ok" };
    }
    case "stock.add": {
      if (!op.item || typeof op.item !== "object") return invalid(ledger, "السلعة غير صحيحة");
      if (ledger.stock.some((s) => s.id === op.item.id)) return { ledger, result: "already" };
      const item = { ...op.item, serials: op.item.serials ?? [] };
      const err = checkStock(item);
      if (err) return invalid(ledger, err);
      const taken = serialTaken(ledger, item.serials);
      if (taken) return invalid(ledger, `الـ S/N «${taken}» كاين ديجا فالمخزون`);
      return { ledger: { ...ledger, stock: [...ledger.stock, { ...item, updatedAt: op.at }] }, result: "ok" };
    }
    case "stock.update": {
      const s = ledger.stock.find((x) => x.id === op.id);
      if (!s) return invalid(ledger, "هاد السلعة ما بقاتش فالمخزون");
      if (s.updatedAt === op.at) return { ledger, result: "already" };
      if (s.updatedAt !== op.base) return { ledger, result: "conflict", message: CONFLICT };
      const next = { ...s, ...pick<StockItem>(op.patch, ["item", "category", "condition", "buyPrice", "sellPrice", "serial", "notes"]), updatedAt: op.at };
      const err = checkStock(next);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, stock: replace(ledger.stock, s.id, next) }, result: "ok" };
    }
    case "stock.adjust": {
      const m = op.move;
      if (!m || typeof m !== "object") return invalid(ledger, "الكمية غير صحيحة");
      if (ledger.moves.some((x) => x.id === m.id)) return { ledger, result: "already" };
      const s = ledger.stock.find((x) => x.id === m.stockId);
      if (!s) return invalid(ledger, "هاد السلعة ما بقاتش فالمخزون");
      if (!isLedgerId(m.id) || !m.id.startsWith("M-") || !Number.isInteger(m.delta) || !m.delta || !amount(m.delta)) return invalid(ledger, "الكمية غير صحيحة");
      if (!date(m.date) || !text(m.reason, 300) || !text(m.seller, 100)) return invalid(ledger, "معلومات غير صحيحة");
      const sIn = m.serialsIn ?? [];
      const sOut = m.serialsOut ?? [];
      if (!serialList(sIn) || !serialList(sOut)) return invalid(ledger, "الأرقام التسلسلية (S/N) غير صحيحة");
      if ((sIn.length || sOut.length) && m.delta !== sIn.length - sOut.length) return invalid(ledger, "الكمية ما كتوافقش عدد الـ S/N");
      const taken = serialTaken(ledger, sIn);
      if (taken) return invalid(ledger, `الـ S/N «${taken}» كاين ديجا فالمخزون`);
      const missing = sOut.find((x) => !s.serials.some((y) => sameSerial(x, y)));
      if (missing) return invalid(ledger, `الـ S/N «${missing}» ما كاينش فهاد السلعة`);
      // A difference, not a new total: counts from two phones add up instead of overwriting each other.
      const serials = [...s.serials.filter((y) => !sOut.some((x) => sameSerial(x, y))), ...sIn.map((x) => x.trim())];
      const next = { ...s, quantity: s.quantity + m.delta, serials, updatedAt: op.at };
      return { ledger: { ...ledger, stock: replace(ledger.stock, s.id, next), moves: [...ledger.moves, m] }, result: "ok" };
    }
    case "stock.delete": {
      if (!ledger.stock.some((s) => s.id === op.id)) return { ledger, result: "already" };
      return { ledger: { ...ledger, stock: ledger.stock.filter((s) => s.id !== op.id) }, result: "ok" };
    }
    case "category.save": {
      const c = op.category;
      if (!c || !text(c.name, 100) || !c.name.trim() || !text(c.description, 300) || !money(c.marginTarget) || c.marginTarget > 1000) {
        return invalid(ledger, "الفئة غير صحيحة");
      }
      const icon = c.icon ?? "";
      if (!validIcon(icon)) return invalid(ledger, "الأيقونة غير صحيحة ولا كبيرة بزاف");
      const clean = { name: c.name.trim(), description: c.description.trim(), marginTarget: c.marginTarget, icon };
      const old = ledger.categories.find((x) => x.name === clean.name);
      if (old && old.description === clean.description && old.marginTarget === clean.marginTarget && old.icon === clean.icon) return { ledger, result: "already" };
      const categories = old ? ledger.categories.map((x) => (x.name === clean.name ? clean : x)) : [...ledger.categories, clean];
      return { ledger: { ...ledger, categories }, result: "ok" };
    }
    case "sale.add": {
      const lines = Array.isArray(op.lines) ? op.lines : [];
      const purchases = Array.isArray(op.purchases) ? op.purchases : [];
      if (!lines.length || lines.length > 50) return invalid(ledger, "البيع خاوي");
      if (lines.every((l) => ledger.sales.some((s) => s.id === l.id))) return { ledger, result: "already" };
      if (lines.some((l) => !l || typeof l !== "object") || purchases.some((p) => !p || typeof p !== "object")) return invalid(ledger, "البيع غير صحيح");
      for (const l of lines) {
        const err = checkSale(l);
        if (err) return invalid(ledger, err);
        if (ledger.sales.some((s) => s.id === l.id)) return invalid(ledger, "رقم البيع مكرر");
        if (l.ticket !== lines[0].ticket) return invalid(ledger, "رقم التيكي غير صحيح");
      }
      if (lines[0].type === "كريدي") {
        const c = findClient(lines[0].clientId);
        if (!c) return invalid(ledger, "الزبون ما بقاش");
        if (purchases.length !== lines.length) return invalid(ledger, "البيع بالكريدي خاصو السلع");
        for (const [i, l] of lines.entries()) {
          const p = purchases[i];
          if (l.type !== "كريدي" || l.clientId !== c.id || l.purchaseId !== p.id || p.clientId !== c.id) return invalid(ledger, "البيع بالكريدي غير صحيح");
          if (p.price !== l.sellPrice || ledger.purchases.some((x) => x.id === p.id)) return invalid(ledger, "البيع بالكريدي غير صحيح");
          const err = checkPurchase(p);
          if (err) return invalid(ledger, err);
        }
      } else if (purchases.length || lines.some((l) => l.type !== "كاش" || l.clientId || l.purchaseId)) {
        return invalid(ledger, "البيع كاش ما فيهش زبون");
      }
      // Products from stock go out (unknown ones are simply not tracked), with their serial numbers.
      const out = new Map<string, number>();
      const soldSerials = new Map<string, string[]>();
      for (const l of lines) {
        if (!l.stockId || !ledger.stock.some((s) => s.id === l.stockId)) continue;
        out.set(l.stockId, (out.get(l.stockId) ?? 0) + l.quantity);
        if (l.serials?.length) soldSerials.set(l.stockId, [...(soldSerials.get(l.stockId) ?? []), ...l.serials]);
      }
      for (const [id, list] of soldSerials) {
        const item = ledger.stock.find((s) => s.id === id)!;
        const gone = list.find((x) => !item.serials.some((y) => sameSerial(x, y)));
        // Sold on another phone in the meantime (or never in stock).
        if (gone) return invalid(ledger, `الـ S/N «${gone}» ما بقاش فالمخزون (يمكن تباع)`);
        if (new Set(list.map((x) => x.toLowerCase())).size !== list.length) return invalid(ledger, "نفس الـ S/N مرتين");
      }
      const stock = ledger.stock.map((s) => {
        if (!out.has(s.id)) return s;
        const sold = soldSerials.get(s.id) ?? [];
        return { ...s, quantity: s.quantity - out.get(s.id)!, serials: s.serials.filter((y) => !sold.some((x) => sameSerial(x, y))), updatedAt: op.at };
      });
      return {
        ledger: {
          ...ledger,
          stock,
          sales: [...ledger.sales, ...lines.map((l) => ({ ...l, serials: l.serials ?? [], stockId: out.has(l.stockId) ? l.stockId : "", updatedAt: op.at }))],
          purchases: [...ledger.purchases, ...purchases.map((p) => ({ ...p, updatedAt: op.at }))],
        },
        result: "ok",
      };
    }
    case "sale.delete": {
      const s = ledger.sales.find((x) => x.id === op.id);
      if (!s) return { ledger, result: "already" };
      const after = restock(ledger, [s], op.at);
      return {
        ledger: {
          ...after,
          sales: ledger.sales.filter((x) => x.id !== s.id),
          purchases: s.purchaseId ? ledger.purchases.filter((p) => p.id !== s.purchaseId) : ledger.purchases,
          payments: s.purchaseId ? ledger.payments.map((p) => (p.purchaseId === s.purchaseId ? { ...p, purchaseId: "" } : p)) : ledger.payments,
        },
        result: "ok",
      };
    }
    case "caisse.close": {
      const k = op.close;
      if (!k || typeof k !== "object") return invalid(ledger, "معلومات الصندوق غير صحيحة");
      if (ledger.closings.some((x) => x.id === k.id)) return { ledger, result: "already" };
      if (!isLedgerId(k.id) || !k.id.startsWith("K-") || !date(k.date) || !k.date || !time(k.time)) return invalid(ledger, "معلومات الصندوق غير صحيحة");
      if (!text(k.clerk, 100) || !text(k.expensesNote, 500) || !text(k.notes, 1000)) return invalid(ledger, "معلومات الصندوق غير صحيحة");
      if (![k.cashSales, k.advances, k.installments, k.expected].every(amount) || !money(k.expenses) || (k.counted !== null && !money(k.counted))) {
        return invalid(ledger, "المبالغ غير صحيحة");
      }
      return { ledger: { ...ledger, closings: [...ledger.closings, k] }, result: "ok" };
    }
  }
}

/** Cancelled sales give their products back to stock. */
function restock(ledger: Ledger, sales: Sale[], at: string): Ledger {
  const back = new Map<string, number>();
  const serials = new Map<string, string[]>();
  for (const s of sales) {
    if (!s.stockId) continue;
    back.set(s.stockId, (back.get(s.stockId) ?? 0) + s.quantity);
    if (s.serials?.length) serials.set(s.stockId, [...(serials.get(s.stockId) ?? []), ...s.serials]);
  }
  if (!back.size) return ledger;
  return {
    ...ledger,
    stock: ledger.stock.map((x) => {
      if (!back.has(x.id)) return x;
      const returned = (serials.get(x.id) ?? []).filter((r) => !x.serials.some((y) => sameSerial(r, y)));
      return { ...x, quantity: x.quantity + back.get(x.id)!, serials: [...x.serials, ...returned], updatedAt: at };
    }),
  };
}

/** A serial number already on a unit in stock (any product), if any. */
function serialTaken(ledger: Ledger, list: string[]): string | undefined {
  return list.find((x) => ledger.stock.some((s) => s.serials.some((y) => sameSerial(x, y))));
}

/** A payment can only point to a purchase of the same customer. */
function purchaseOf(ledger: Ledger, purchaseId: string, clientId: string): string {
  return purchaseId && ledger.purchases.some((p) => p.id === purchaseId && p.clientId === clientId) ? purchaseId : "";
}

export function applyOps(ledger: Ledger, ops: LedgerOp[]): Ledger {
  return ops.reduce((l, op) => applyOp(l, op).ledger, ledger);
}

// ---------------------------------------------------------------- summaries

export interface ItemStatus {
  purchase: Purchase;
  paid: number;
  remaining: number;
}

export interface ClientSummary {
  client: Client;
  purchases: Purchase[];
  payments: Payment[];
  total: number;
  paid: number;
  remaining: number;
  lastPaymentDate: string;
  /** Last purchase or payment. */
  lastActivity: string;
  status: DueStatus;
  items: ItemStatus[];
  /** Fully paid more than 3 months ago: can go to the archive. */
  archivable: boolean;
}

const byDate = <T extends { date: string; createdAt: string }>(a: T, b: T) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

export function sortPayments(list: Payment[]): Payment[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * How much of each purchase is paid: payments chosen for an item go to it,
 * general payments fill the oldest unpaid items first.
 */
export function itemStatuses(purchases: Purchase[], payments: Payment[]): ItemStatus[] {
  const items = [...purchases].sort(byDate).map((p) => ({
    purchase: p,
    paid: payments.filter((x) => x.purchaseId === p.id).reduce((s, x) => s + x.amount, 0),
    remaining: 0,
  }));
  let pool = payments.filter((x) => !x.purchaseId || !purchases.some((p) => p.id === x.purchaseId)).reduce((s, x) => s + x.amount, 0);
  for (const it of items) {
    const room = Math.max(0, it.purchase.price - it.paid);
    const take = Math.min(room, pool);
    it.paid += take;
    pool -= take;
  }
  for (const it of items) it.remaining = Math.max(0, round(it.purchase.price - it.paid));
  return items;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function summarizeClient(ledger: Ledger, clientOrId: Client, today: string): ClientSummary {
  // Always the latest version of the customer in this ledger.
  const client = ledger.clients.find((c) => c.id === clientOrId.id) ?? clientOrId;
  const purchases = ledger.purchases.filter((p) => p.clientId === client.id).sort(byDate);
  const payments = sortPayments(ledger.payments.filter((p) => p.clientId === client.id));
  const total = round(purchases.reduce((s, p) => s + p.price, 0));
  const paid = round(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round(total - paid);
  const lastPaymentDate = payments.length ? payments[payments.length - 1].date : "";
  const lastPurchaseDate = purchases.length ? purchases[purchases.length - 1].date : "";
  // Last purchase or payment; the date the customer was added only counts when there is neither
  // (customers moved from the old sheet were all "added" on the day of the move).
  const lastActivity = [lastPaymentDate, lastPurchaseDate].sort().pop() || client.createdAt.slice(0, 10);
  return {
    client,
    purchases,
    payments,
    total,
    paid,
    remaining,
    lastPaymentDate,
    lastActivity,
    status: dueStatus(client.nextDueDate, remaining, today),
    items: itemStatuses(purchases, payments),
    archivable: purchases.length > 0 && remaining <= 0 && !!lastActivity && addMonths(lastActivity, 3) < today,
  };
}

export function summarize(ledger: Ledger, today: string): ClientSummary[] {
  return ledger.clients.map((c) => summarizeClient(ledger, c, today));
}

/** The purchase a new payment goes to by default: the oldest one not fully paid. */
export function defaultPurchaseFor(s: ClientSummary): string {
  return s.items.find((i) => i.remaining > 0)?.purchase.id ?? "";
}

/** Names of the items still being paid, for reminders. */
export function unpaidItems(s: ClientSummary): string[] {
  return s.items.filter((i) => i.remaining > 0).map((i) => i.purchase.item);
}

/** Months left at the current instalment. */
export function monthsToFinish(remaining: number, installment: number, period: string): number | null {
  if (remaining <= 0) return 0;
  if (installment <= 0) return null;
  const perMonth = period.includes("سيمانة") ? installment * 4.33 : period.includes("15") ? installment * 2 : installment;
  return Math.ceil(remaining / perMonth);
}

/** Next due date after a payment made on `paidDate`. */
export function suggestNextDue(client: Client, paidDate: string): string {
  if (!client.period || isManualPeriod(client.period)) return client.nextDueDate;
  const from = client.nextDueDate && client.nextDueDate > paidDate ? client.nextDueDate : client.nextDueDate || paidDate;
  return nextDateForPeriod(client.period, from) || client.nextDueDate;
}

export function nowParts(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export { addDays };
