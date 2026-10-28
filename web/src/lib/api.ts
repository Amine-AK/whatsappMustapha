import "server-only";
import { SheetsError } from "./sheets";

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

/**
 * Read a JSON body from a same-origin request. Requiring JSON + same origin
 * stops other websites from submitting forms with the shop's cookie.
 */
export async function readJson<T>(request: Request): Promise<T | Response> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && new URL(origin).host !== host) {
    return jsonError("طلب غير مسموح", 403);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }
  try {
    return (await request.json()) as T;
  } catch {
    return jsonError("JSON غير صالح", 400);
  }
}

export function parseRowParam(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2 && n < 1_000_000 ? n : null;
}

export function handleError(e: unknown) {
  console.error(e);
  if (e instanceof SheetsError) {
    if (e.status === 403) return jsonError("ما عندناش الحق نوصلو للـ Google Sheet. شارك الورقة مع حساب الخدمة.", 502);
    if (e.status === 404) return jsonError("الـ Google Sheet ما لقيناهش. تأكد من GOOGLE_SHEET_ID.", 502);
    return jsonError("مشكل مع Google Sheets، عاود من بعد شوية.", 502);
  }
  return jsonError("وقع مشكل في السيرفر.", 500);
}

export const ROW_CHANGED_MESSAGE = "هاد السطر تبدل فالورقة من بعد ما فتحتيه. حدّث اللائحة وعاود.";
