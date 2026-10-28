import "server-only";
import { env } from "./env";

// WATI (WhatsApp Business API). Messages to customers who haven't written in
// the last 24 hours must use a template approved by WhatsApp; create it in
// WATI with the parameters below (see README).

export interface ReminderParams {
  name: string;
  items: string;
  due_date: string;
  remaining: string;
  installment: string;
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
        parameters: Object.entries(params).map(([name, value]) => ({ name, value: String(value) })),
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const text = await res.text();
    let body: { result?: boolean; info?: string; message?: string } = {};
    try {
      body = JSON.parse(text);
    } catch {}
    // WATI answers 200 with result:false when it refuses (invalid number, template…).
    if (res.ok && body.result !== false) return { ok: true, detail: "sent" };
    return { ok: false, detail: `WATI ${res.status}: ${body.info || body.message || text.slice(0, 200) || "error"}` };
  } catch (e) {
    return { ok: false, detail: `WATI: ${e instanceof Error ? e.message : String(e)}` };
  }
}
