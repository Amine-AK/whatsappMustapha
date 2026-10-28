import { cookies } from "next/headers";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";

export async function POST(request: Request) {
  const body = await readJson<{ password?: string }>(request);
  if (body instanceof Response) return body;
  if (!checkPassword(String(body.password ?? ""))) {
    // Slow down password guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return jsonError("كلمة السر غير صحيحة", 401);
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return Response.json({ ok: true });
}
