import { createHmac, timingSafeEqual } from "node:crypto";

// One shop password (APP_PASSWORD). A successful login gets a signed cookie
// that expires after SESSION_DAYS. Used by proxy.ts and the API routes.

export const SESSION_COOKIE = "el_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const v = process.env.SESSION_SECRET ?? "";
  if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return v;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) throw new Error("Missing environment variable APP_PASSWORD");
  // Compare hashes so the comparison time doesn't depend on the length.
  const h = (s: string) => createHmac("sha256", "pw").update(s).digest("hex");
  return safeEqual(h(input), h(expected));
}
