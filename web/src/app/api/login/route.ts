import { cookies } from "next/headers";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { handleError, jsonError, readJson } from "@/lib/api";
import { authenticate } from "@/lib/users";

// Wrong passwords per address: after 5 in 10 minutes, wait (on top of the 1 s delay).
const failures = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 5;

export async function POST(request: Request) {
  const body = await readJson<{ login?: string; password?: string }>(request);
  if (body instanceof Response) return body;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILS) return jsonError("بزاف ديال المحاولات. عاود من بعد 10 دقايق.", 429);
  try {
    const found = await authenticate(String(body.login ?? ""), String(body.password ?? ""));
    if (!found) {
      failures.set(ip, [...recent, now]);
      // Slow down password guessing.
      await new Promise((r) => setTimeout(r, 1000));
      return jsonError("اسم الدخول ولا كلمة السر غير صحيحين", 401);
    }
    failures.delete(ip);
    (await cookies()).set(SESSION_COOKIE, createSessionToken(found.me.id, found.pv), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DAYS * 86_400,
    });
    return Response.json({ ok: true, me: found.me });
  } catch (e) {
    return handleError(e);
  }
}
