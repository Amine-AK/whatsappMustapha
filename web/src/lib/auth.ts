import { createHmac, timingSafeEqual } from "node:crypto";

// Signed session cookie: who is logged in (uid) and a fingerprint of their
// password (pv: changing the password signs out old sessions). It expires after
// SESSION_DAYS. Used by proxy.ts and the API routes (see access.ts).

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

export interface Session {
  uid: string;
  pv: string;
  exp: number;
}

export function createSessionToken(uid: string, pv: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid, pv, exp: now + SESSION_DAYS * 86_400_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The session in a valid, unexpired token. Tokens from before accounts (no uid) count as the owner's. */
export function readSessionToken(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const { exp, uid, pv } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp <= now) return null;
    return { exp, uid: typeof uid === "string" ? uid : "owner", pv: typeof pv === "string" ? pv : "" };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  return readSessionToken(token, now) !== null;
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) throw new Error("Missing environment variable APP_PASSWORD");
  // Compare hashes so the comparison time doesn't depend on the length.
  const h = (s: string) => createHmac("sha256", "pw").update(s).digest("hex");
  return safeEqual(h(input), h(expected));
}
