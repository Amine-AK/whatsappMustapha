import { handleError } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { reminderBlocker, sentToday } from "@/lib/reminders";
import { readCustomerRows, readReminderLog } from "@/lib/sheets";
import { rowsToCustomers, todayISO } from "@/lib/sheet-logic";

export const dynamic = "force-dynamic";

/** Customers whose payment date has passed and who still owe money. */
export async function GET() {
  try {
    const today = todayISO();
    const [rows, log] = await Promise.all([readCustomerRows(), readReminderLog()]);
    const overdue = rowsToCustomers(rows, today)
      .filter((c) => c.status === "overdue")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((c) => ({ customer: c, blocker: reminderBlocker(c), sentToday: sentToday(log, c, today) }));
    return Response.json({ today, watiConfigured: watiConfigured(), overdue });
  } catch (e) {
    return handleError(e);
  }
}
