import { handleError, jsonError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/access";
import { watiConfigured } from "@/lib/env";
import { summarize } from "@/lib/ledger";
import { logTimestamp, reminderBlocker, reminderParams, sentToday } from "@/lib/reminders";
import { appendReminderLog, readReminderLog, type ReminderLogEntry } from "@/lib/sheets";
import { loadLedger } from "@/lib/store";
import { formatAmount, formatMoroccoPhone, todayISO } from "@/lib/sheet-logic";
import { sendReminderTemplate } from "@/lib/wati";

export const maxDuration = 60;

const MAX_PER_REQUEST = 10;

type Result = { id: string; status: "sent" | "failed" | "skipped"; detail: string };

/** Sends up to 10 reminders; the app calls it in batches and shows progress. */
export async function POST(request: Request) {
  const me = await requireUser("reminders");
  if (me instanceof Response) return me;
  if (!watiConfigured()) return jsonError("WATI ماشي مضبوط. زيد WATI_API_ENDPOINT و WATI_ACCESS_TOKEN و WATI_TEMPLATE_NAME و WATI_CHANNEL_NUMBER.", 503);
  const body = await readJson<{ ids?: string[] }>(request);
  if (body instanceof Response) return body;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string").slice(0, MAX_PER_REQUEST) : [];
  if (!ids.length) return jsonError("ما كاين حتى زبون", 400);

  try {
    const today = todayISO();
    const [ledger, log] = await Promise.all([loadLedger(), readReminderLog()]);
    const summaries = new Map(summarize(ledger, today).map((s) => [s.client.id, s]));
    const results: Result[] = [];
    const newLog: ReminderLogEntry[] = [];
    for (const id of ids) {
      // Checked again on the server: the list on the phone may be old.
      const s = summaries.get(id);
      const blocker = s ? reminderBlocker(s) : "الزبون ما بقاش";
      if (!s || blocker) {
        results.push({ id, status: "skipped", detail: blocker ?? "" });
        continue;
      }
      if (sentToday([...log, ...newLog], s, today)) {
        results.push({ id, status: "skipped", detail: "تصيفط ليه اليوم" });
        continue;
      }
      const phone = formatMoroccoPhone(s.client.phone);
      const { ok, detail } = await sendReminderTemplate(phone, reminderParams(s));
      results.push({ id, status: ok ? "sent" : "failed", detail });
      newLog.push({
        sentAt: logTimestamp(),
        clientId: id,
        name: s.client.name,
        phone,
        dueDate: s.client.nextDueDate,
        remaining: formatAmount(s.remaining),
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
