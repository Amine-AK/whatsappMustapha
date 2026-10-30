import "server-only";
import { installmentLine, isValidPhone, makeStamp, todayISO, type Customer } from "./sheet-logic";
import type { ReminderLogEntry } from "./sheets";
import type { ReminderParams } from "./wati";

/** "yyyy-mm-dd HH:mm" in shop time, written to the reminder log. */
export function logTimestamp(now = new Date()): string {
  return `${todayISO(now)} ${makeStamp(undefined, now).slice(-5)}`;
}

/** Already reminded today about this same due date. */
export function sentToday(log: ReminderLogEntry[], c: Pick<Customer, "phoneIntl" | "dueDate">, today: string): boolean {
  return log.some((e) => e.result === "sent" && e.phone === c.phoneIntl && e.dueDate === c.dueDate && e.sentAt.startsWith(today));
}

export function reminderBlocker(c: Customer): string | null {
  if (c.status !== "overdue") return "ماشي متأخر";
  if (!isValidPhone(c.phoneIntl)) return "رقم الهاتف غير صحيح";
  return null;
}

export function reminderParams(c: Customer): ReminderParams {
  return {
    name: c.name,
    items: c.itemsPlain || "-",
    due_date: c.dueDate,
    remaining: String(Math.round(c.remaining * 100) / 100),
    installment: installmentLine(c.installment, c.period),
  };
}
