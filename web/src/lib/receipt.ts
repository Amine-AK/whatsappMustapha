// Payment receipt (وصل الأداء) printed on a thermal printer.

import { installmentLine, isManualPeriod, listPayments, type Customer } from "./sheet-logic";

export const SHOP = {
  name: "ELECTRO-LMESTOUR",
  phone: "0663336760",
  thanks: "شكراً على ثقتكم",
};

export interface Receipt {
  /** Same payment, same number: "261030-1432". */
  number: string;
  /** "30/10/2026 - 14:32" */
  date: string;
  /** "تسبيق" for the first payment, "دفعة 3" for the third… */
  label: string;
  customer: string;
  phone: string;
  items: string;
  amount: number;
  total: number;
  /** Paid up to and including this payment. */
  paidToDate: number;
  /** Left to pay after this payment. */
  remaining: number;
  /** Only on the latest payment (older receipts don't know it). */
  nextDueDate: string;
  installment: string;
}

function receiptNumber(stamp: string, index: number): string {
  const m = stamp.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return `P${index + 1}`;
  const [, d, mo, y, hh = "00", mm = "00"] = m;
  return `${y.slice(-2)}${mo.padStart(2, "0")}${d.padStart(2, "0")}-${hh.padStart(2, "0")}${mm}`;
}

/** Receipt for one of the customer's payments (the latest by default). */
export function buildReceipt(c: Customer, index?: number): Receipt | null {
  const payments = listPayments(c.advance);
  if (!payments.length) return null;
  const i = index === undefined ? payments.length - 1 : Math.max(0, Math.min(index, payments.length - 1));
  const paidToDate = payments.slice(0, i + 1).reduce((s, p) => s + p.amount, 0);
  const latest = i === payments.length - 1;
  const remaining = Math.max(0, c.sellTotal - paidToDate);
  return {
    number: receiptNumber(payments[i].stamp, i),
    date: payments[i].stamp,
    label: i === 0 ? "تسبيق" : `دفعة ${i + 1}`,
    customer: c.name,
    phone: c.phone,
    items: c.itemsPlain,
    amount: payments[i].amount,
    total: c.sellTotal,
    paidToDate,
    remaining,
    nextDueDate: latest && remaining > 0 ? c.dueDate : "",
    installment: remaining > 0 && (c.installment || (c.period && !isManualPeriod(c.period))) ? installmentLine(c.installment, c.period) : "",
  };
}
