import { handleError } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { summarize } from "@/lib/ledger";
import { reminderRow } from "@/lib/reminders";
import { readReminderLog } from "@/lib/sheets";
import { loadLedger } from "@/lib/store";
import { todayISO } from "@/lib/sheet-logic";

export const dynamic = "force-dynamic";

/** Customers whose payment date has passed and who still owe money. */
export async function GET() {
  try {
    const today = todayISO();
    const [ledger, log] = await Promise.all([loadLedger(), readReminderLog()]);
    const overdue = summarize(ledger, today)
      .filter((s) => s.status === "overdue")
      .sort((a, b) => a.client.nextDueDate.localeCompare(b.client.nextDueDate))
      .map((s) => reminderRow(s, log, today));
    return Response.json({ today, watiConfigured: watiConfigured(), overdue });
  } catch (e) {
    return handleError(e);
  }
}
