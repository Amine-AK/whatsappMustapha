// DEV ONLY: remove before going live (see src/lib/dev-reset.ts).
import { handleError, jsonError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/access";
import { resetAllData } from "@/lib/dev-reset";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const me = await requireUser("owner_only");
  if (me instanceof Response) return me;
  if (!env.allowDataReset()) return jsonError("مسح المعلومات ما مفعلش (ALLOW_DATA_RESET)", 403);
  const body = await readJson<{ confirm?: string }>(request);
  if (body instanceof Response) return body;
  if (body.confirm !== "مسح") return jsonError("خاص تكتب «مسح» باش تأكد", 400);
  try {
    return Response.json(await resetAllData());
  } catch (e) {
    return handleError(e);
  }
}
