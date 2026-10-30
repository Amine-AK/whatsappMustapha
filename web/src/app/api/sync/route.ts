import { handleError, jsonError, readJson } from "@/lib/api";
import type { LedgerOp } from "@/lib/ledger";
import { sync } from "@/lib/store";

export const maxDuration = 60;

const MAX_OPS = 100;

/** Save changes made on a device (possibly offline), in order. Safe to send twice. */
export async function POST(request: Request) {
  const body = await readJson<{ ops?: LedgerOp[] }>(request);
  if (body instanceof Response) return body;
  const ops = Array.isArray(body.ops) ? body.ops : [];
  if (!ops.length) return Response.json({ results: [] });
  if (ops.length > MAX_OPS) return jsonError(`ماشي أكثر من ${MAX_OPS} تعديل فمرة`, 400);
  if (ops.some((o) => !o || typeof o !== "object" || typeof o.opId !== "string" || typeof o.at !== "string" || typeof o.type !== "string")) {
    return jsonError("تعديلات غير صالحة", 400);
  }
  try {
    return Response.json({ results: await sync(ops) });
  } catch (e) {
    return handleError(e);
  }
}
