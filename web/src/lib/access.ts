import "server-only";
import { cookies } from "next/headers";
import { jsonError } from "./api";
import { readSessionToken, SESSION_COOKIE } from "./auth";
import { can, type Me, type Permission } from "./roles";
import { userForSession } from "./users";

// The server is the guard: every route asks who is calling and what they may do.
// Hiding buttons in the app is only for comfort.

/** The logged-in user, or a 401 response (session gone, account disabled or password changed). */
export async function currentUser(): Promise<Me | Response> {
  const session = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const me = session ? await userForSession(session.uid, session.pv) : null;
  return me ?? jsonError("سجل الدخول من جديد", 401);
}

/** Same, and a 403 when the user lacks the permission. */
export async function requireUser(perm?: Permission): Promise<Me | Response> {
  const me = await currentUser();
  if (me instanceof Response) return me;
  if (perm && !can(me, perm)) return jsonError("ما عندكش الصلاحية لهاد الشي", 403);
  return me;
}

export { ledgerFor, opAllowed, stampOp } from "./permissions";
