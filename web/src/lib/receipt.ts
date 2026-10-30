// Receipts printed on the thermal printer: one payment (وصل الأداء) or the
// whole account (كشف الحساب).

import { installmentLine } from "./sheet-logic";
import { itemStatuses, sortPayments, type ClientSummary, type Payment } from "./ledger";

export const SHOP = {
  name: "ELECTRO-LMESTOUR",
  phone: "0663336760",
  thanks: "شكراً على ثقتكم",
};

/** "30/10/2026 - 14:32" */
export function displayDateTime(date: string, time?: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}${time && time !== "00:00" ? ` - ${time}` : ""}`;
}

export function displayDate(date: string): string {
  return displayDateTime(date);
}

export function installmentText(s: ClientSummary): string {
  const c = s.client;
  return c.installment > 0 ? installmentLine(String(c.installment), c.period) : "";
}

export interface PaymentReceipt {
  number: string;
  date: string;
  label: string;
  clientId: string;
  customer: string;
  phone: string;
  /** Item this payment was for, if chosen. */
  item: string;
  amount: number;
  /** Bought up to that day. */
  total: number;
  paidToDate: number;
  remaining: number;
  /** Only on the latest payment. */
  nextDueDate: string;
  installment: string;
  /** Items not fully paid right after this payment, with what is left on each. */
  unpaid: { date: string; item: string; price: number; remaining: number }[];
}

/** Receipt for one payment, with the account as it was right after it. */
export function paymentReceipt(s: ClientSummary, payment: Payment): PaymentReceipt {
  const ordered = sortPayments(s.payments);
  const index = ordered.findIndex((p) => p.id === payment.id);
  const upTo = index === -1 ? [...ordered, payment] : ordered.slice(0, index + 1);
  const paidToDate = upTo.reduce((sum, p) => sum + p.amount, 0);
  const bought = s.purchases.filter((p) => p.date <= payment.date);
  const total = bought.reduce((sum, p) => sum + p.price, 0);
  const remaining = Math.max(0, Math.round((total - paidToDate) * 100) / 100);
  const latest = index === ordered.length - 1 || index === -1;
  return {
    number: payment.id,
    date: displayDateTime(payment.date, payment.time),
    label: payment.kind === "تسبيق" ? "تسبيق" : "دفعة",
    clientId: s.client.id,
    customer: s.client.name,
    phone: s.client.phone,
    item: s.purchases.find((p) => p.id === payment.purchaseId)?.item ?? "",
    amount: payment.amount,
    total,
    paidToDate,
    remaining,
    nextDueDate: latest && remaining > 0 ? s.client.nextDueDate : "",
    installment: remaining > 0 ? installmentText(s) : "",
    unpaid: itemStatuses(bought, upTo)
      .filter((i) => i.remaining > 0)
      .map((i) => ({ date: displayDate(i.purchase.date), item: i.purchase.item, price: i.purchase.price, remaining: i.remaining })),
  };
}

export interface Statement {
  clientId: string;
  customer: string;
  phone: string;
  printedAt: string;
  items: { date: string; item: string; price: number; remaining: number }[];
  payments: { date: string; amount: number; label: string }[];
  /** How many older payments were left out (only the last ones are printed). */
  hiddenPayments: number;
  hiddenTotal: number;
  total: number;
  paid: number;
  remaining: number;
  installment: string;
  nextDueDate: string;
}

/** The whole account. `lastPayments` limits how many payments are listed (0 = all). */
export function statement(s: ClientSummary, printedAt: string, lastPayments = 0): Statement {
  const ordered = sortPayments(s.payments);
  const shown = lastPayments > 0 ? ordered.slice(-lastPayments) : ordered;
  const hidden = ordered.slice(0, ordered.length - shown.length);
  return {
    clientId: s.client.id,
    customer: s.client.name,
    phone: s.client.phone,
    printedAt,
    items: s.items.map((i) => ({ date: displayDate(i.purchase.date), item: i.purchase.item, price: i.purchase.price, remaining: i.remaining })),
    payments: shown.map((p) => ({ date: displayDate(p.date), amount: p.amount, label: p.kind === "تسبيق" ? "تسبيق" : "" })),
    hiddenPayments: hidden.length,
    hiddenTotal: hidden.reduce((sum, p) => sum + p.amount, 0),
    total: s.total,
    paid: s.paid,
    remaining: Math.max(0, s.remaining),
    installment: s.remaining > 0 ? installmentText(s) : "",
    nextDueDate: s.remaining > 0 ? s.client.nextDueDate : "",
  };
}
