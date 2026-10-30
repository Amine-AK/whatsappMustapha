import { handleError, jsonError, readJson } from "@/lib/api";
import { isLedgerId } from "@/lib/ledger";
import { restore } from "@/lib/store";

export const maxDuration = 60;

/** Bring an archived customer back to the active list. */
export async function POST(request: Request) {
  const body = await readJson<{ id?: string }>(request);
  if (body instanceof Response) return body;
  if (!isLedgerId(body.id)) return jsonError("رقم الزبون غير صحيح", 400);
  try {
    if (!(await restore(body.id))) return jsonError("هاد الزبون ما كاينش فالأرشيف", 404);
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
