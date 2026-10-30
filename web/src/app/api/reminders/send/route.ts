import { handleError, jsonError, readJson } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { logTimestamp, reminderBlocker, reminderParams, sentToday } from "@/lib/reminders";
import { appendReminderLog, readCustomerRows, readReminderLog, type ReminderLogEntry } from "@/lib/sheets";
import { formatAmount, rowChanged, rowToCustomer, todayISO } from "@/lib/sheet-logic";
import { sendReminderTemplate } from "@/lib/wati";

export const maxDuration = 60;

const MAX_PER_REQUEST = 10;

interface SendBody {
  targets?: { row: number; expected: string[] }[];
}

type Result = { row: number; status: "sent" | "failed" | "skipped"; detail: string };

/** Sends up to 10 reminders; the app calls it in batches and shows progress. */
export async function POST(request: Request) {
  if (!watiConfigured()) return jsonError("WATI ماشي مضبوط. زيد WATI_API_ENDPOINT و WATI_ACCESS_TOKEN و WATI_TEMPLATE_NAME و WATI_CHANNEL_NUMBER.", 503);
  const body = await readJson<SendBody>(request);
  if (body instanceof Response) return body;
  const targets = Array.isArray(body.targets) ? body.targets.slice(0, MAX_PER_REQUEST) : [];
  if (!targets.length) return jsonError("ما كاين حتى زبون", 400);

  try {
    const today = todayISO();
    const [rows, log] = await Promise.all([readCustomerRows(), readReminderLog()]);
    const results: Result[] = [];
    const newLog: ReminderLogEntry[] = [];

    for (const t of targets) {
      const current = Number.isInteger(t.row) && t.row >= 2 ? rows[t.row - 2] : undefined;
      if (!current || !Array.isArray(t.expected) || rowChanged(current, t.expected)) {
        results.push({ row: t.row, status: "skipped", detail: "السطر تبدل، حدّث اللائحة" });
        continue;
      }
      const c = rowToCustomer(current, t.row, today);
      const blocker = c ? reminderBlocker(c) : "سطر خاوي";
      if (!c || blocker) {
        results.push({ row: t.row, status: "skipped", detail: blocker ?? "" });
        continue;
      }
      if (sentToday([...log, ...newLog], c, today)) {
        results.push({ row: t.row, status: "skipped", detail: "تصيفط ليه اليوم" });
        continue;
      }
      const { ok, detail } = await sendReminderTemplate(c.phoneIntl, reminderParams(c));
      results.push({ row: t.row, status: ok ? "sent" : "failed", detail });
      newLog.push({
        sentAt: logTimestamp(),
        row: c.row,
        name: c.name,
        phone: c.phoneIntl,
        dueDate: c.dueDate,
        remaining: formatAmount(c.remaining),
        result: ok ? "sent" : "failed",
        detail,
      });
    }

    await appendReminderLog(newLog);
    return Response.json({ results });
  } catch (e) {
    return handleError(e);
  }
}
