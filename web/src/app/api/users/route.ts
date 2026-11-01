import { handleError, jsonError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/access";
import type { Role, Service } from "@/lib/roles";
import { listUsers, publicUser, saveUser, UserError } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Employee accounts (owner only), without the password hashes. */
export async function GET() {
  const me = await requireUser("owner_only");
  if (me instanceof Response) return me;
  try {
    return Response.json({ users: (await listUsers(true)).map(publicUser) });
  } catch (e) {
    return handleError(e);
  }
}

/** Add or change an account (owner only). */
export async function POST(request: Request) {
  const me = await requireUser("owner_only");
  if (me instanceof Response) return me;
  const body = await readJson<{ id?: string; name?: string; login?: string; role?: Role; services?: Service[]; seeCost?: boolean; active?: boolean; password?: string }>(request);
  if (body instanceof Response) return body;
  try {
    const user = await saveUser({
      id: typeof body.id === "string" ? body.id : undefined,
      name: String(body.name ?? ""),
      login: String(body.login ?? ""),
      role: (body.role ?? "seller") as Role,
      services: Array.isArray(body.services) ? body.services : [],
      seeCost: Boolean(body.seeCost),
      active: body.active !== false,
      password: typeof body.password === "string" && body.password ? body.password : undefined,
    });
    return Response.json({ user });
  } catch (e) {
    if (e instanceof UserError) return jsonError(e.message, 400);
    return handleError(e);
  }
}
