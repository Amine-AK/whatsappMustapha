import "server-only";
import { unpaidItems, type ClientSummary } from "./ledger";
import { installmentText } from "./receipt";
import { formatAmount, formatMoroccoPhone, isValidPhone, makeStamp, todayISO } from "./sheet-logic";
import type { ReminderLogEntry } from "./sheets";
import type { ReminderParams } from "./wati";

/** "yyyy-mm-dd HH:mm" in shop time, written to the reminder log. */
export function logTimestamp(now = new Date()): string {
  return `${todayISO(now)} ${makeStamp(undefined, now).slice(-5)}`;
}

/** Already reminded today about this same due date. */
export function sentToday(log: ReminderLogEntry[], s: ClientSummary, today: string): boolean {
  const phone = formatMoroccoPhone(s.client.phone);
  return log.some((e) => e.result === "sent" && e.phone === phone && e.dueDate === s.client.nextDueDate && e.sentAt.startsWith(today));
}

export function reminderBlocker(s: ClientSummary): string | null {
  if (s.status !== "overdue") return "ماشي متأخر";
  if (!isValidPhone(formatMoroccoPhone(s.client.phone))) return "رقم الهاتف غير صحيح";
  return null;
}

export function reminderParams(s: ClientSummary): ReminderParams {
  return {
    name: s.client.name,
    items: unpaidItems(s).join(" + ") || "-",
    due_date: s.client.nextDueDate,
    remaining: formatAmount(s.remaining),
    installment: installmentText(s) || "حسب الاتفاق",
  };
}

/** What the reminder window lists for each late customer. */
export function reminderRow(s: ClientSummary, log: ReminderLogEntry[], today: string) {
  return {
    id: s.client.id,
    name: s.client.name,
    phone: s.client.phone,
    remaining: s.remaining,
    dueDate: s.client.nextDueDate,
    status: s.status,
    blocker: reminderBlocker(s),
    sentToday: sentToday(log, s, today),
  };
}
