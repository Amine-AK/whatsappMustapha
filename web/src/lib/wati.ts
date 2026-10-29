import "server-only";
import { env } from "./env";

// WATI v1 API: POST /{tenantId}/api/v1/sendTemplateMessage.
// Messages to customers who haven't written in the last 24 hours must use a
// template approved by WhatsApp (see README for its text).

// WATI parameters are positional: the template uses {{1}}..{{5}} in this order.
export interface ReminderParams {
  name: string;
  items: string;
  due_date: string;
  remaining: string;
  installment: string;
}

export function positionalParameters(params: ReminderParams): { name: string; value: string }[] {
  const ordered = [params.name, params.items, params.due_date, params.remaining, params.installment];
  // WATI rejects empty values.
  return ordered.map((value, i) => ({ name: String(i + 1), value: String(value).trim() || "-" }));
}

export async function sendReminderTemplate(phoneIntl: string, params: ReminderParams): Promise<{ ok: boolean; detail: string }> {
  const url = `${env.watiEndpoint()}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phoneIntl)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.watiToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_name: env.watiTemplate(),
        broadcast_name: env.watiBroadcast(),
        channel_number: env.watiChannelNumber(),
        parameters: positionalParameters(params),
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const text = await res.text();
    let body: { result?: boolean; info?: string; message?: string; error?: { message?: string } } = {};
    try {
      body = JSON.parse(text);
    } catch {}
    // WATI answers 200 with result:false when it refuses (invalid number, template…).
    if (res.ok && body.result !== false) return { ok: true, detail: "sent" };
    return { ok: false, detail: `WATI ${res.status}: ${body.info || body.error?.message || body.message || text.slice(0, 200) || "error"}` };
  } catch (e) {
    return { ok: false, detail: `WATI: ${e instanceof Error ? e.message : String(e)}` };
  }
}
