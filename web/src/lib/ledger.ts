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
  /** Buying price, 0 = unknown. */
  cost: number;
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

export interface Ledger {
  clients: Client[];
  purchases: Purchase[];
  payments: Payment[];
  changes: InstallmentChange[];
}

export const EMPTY_LEDGER: Ledger = { clients: [], purchases: [], payments: [], changes: [] };

// ---------------------------------------------------------------- ids

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I: easy to read on a receipt

/** "C-7K2QXM9A": prefix C (client), S (purchase), P (payment), T (instalment change), O (operation). */
export function newLedgerId(prefix: "C" | "S" | "P" | "T" | "O"): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return `${prefix}-${Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("")}`;
}

const ID_RE = /^[CSPTO]-[A-Z0-9]{4,16}$/;
export const isLedgerId = (s: unknown): s is string => typeof s === "string" && ID_RE.test(s);

// ---------------------------------------------------------------- operations

type OpBody =
  | { type: "client.add"; client: Client }
  | { type: "client.update"; id: string; base: string; patch: Partial<Pick<Client, "name" | "phone" | "notes" | "nextDueDate">> }
  | { type: "client.delete"; id: string }
  | { type: "client.installment"; id: string; base: string; change: InstallmentChange; nextDueDate?: string }
  | { type: "purchase.add"; purchase: Purchase }
  | { type: "purchase.update"; id: string; base: string; patch: Partial<Pick<Purchase, "date" | "item" | "price" | "cost" | "notes">> }
  | { type: "purchase.delete"; id: string }
  | { type: "payment.add"; payment: Payment; nextDueDate?: string }
  | {
      type: "payment.update";
      id: string;
      base: string;
      patch: Partial<Pick<Payment, "clientId" | "purchaseId" | "date" | "time" | "amount" | "kind" | "notes">>;
    }
  | { type: "payment.delete"; id: string };

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
  if (!money(p.cost)) return "ثمن الشراء غير صحيح";
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
      if (ledger.purchases.some((p) => p.clientId === op.id) || ledger.payments.some((p) => p.clientId === op.id)) {
        return invalid(ledger, "هاد الزبون عندو مشتريات ولا دفعات. ما يمكنش يتمسح، أرشفه ملي يخلص.");
      }
      return { ledger: { ...ledger, clients: ledger.clients.filter((c) => c.id !== op.id) }, result: "ok" };
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
      const next = { ...p, ...pick<Purchase>(op.patch, ["date", "item", "price", "cost", "notes"]), updatedAt: op.at };
      const err = checkPurchase(next);
      if (err) return invalid(ledger, err);
      return { ledger: { ...ledger, purchases: replace(ledger.purchases, p.id, next) }, result: "ok" };
    }
    case "purchase.delete": {
      if (!ledger.purchases.some((p) => p.id === op.id)) return { ledger, result: "already" };
      return {
        ledger: {
          ...ledger,
          purchases: ledger.purchases.filter((p) => p.id !== op.id),
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
  }
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
  cost: number;
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
    cost: round(purchases.reduce((s, p) => s + p.cost, 0)),
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
