import { handleError, jsonError, readJson } from "@/lib/api";
import { requireUser } from "@/lib/access";
import { isLedgerId } from "@/lib/ledger";
import { archive, searchArchive } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Search archived customers by name or phone. */
export async function GET(request: Request) {
  const me = await requireUser();
  if (me instanceof Response) return me;
  if (me.role === "stock") return jsonError("ما عندكش الصلاحية لهاد الشي", 403);
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > 100) return jsonError("البحث طويل بزاف", 400);
  try {
    return Response.json({ ledger: await searchArchive(q) });
  } catch (e) {
    return handleError(e);
  }
}

/** Archive every customer who finished paying more than 3 months ago (or the given fully-paid ones). */
export async function POST(request: Request) {
  const me = await requireUser("client_delete");
  if (me instanceof Response) return me;
  const body = await readJson<{ ids?: string[] }>(request);
  if (body instanceof Response) return body;
  if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 500 || !body.ids.every(isLedgerId))) {
    return jsonError("أرقام الزبناء غير صحيحة", 400);
  }
  try {
    return Response.json({ archived: await archive(body.ids) });
  } catch (e) {
    return handleError(e);
  }
}
