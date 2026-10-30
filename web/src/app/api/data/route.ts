import { handleError } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { loadLedger, needsSetup } from "@/lib/store";
import { todayISO } from "@/lib/sheet-logic";

export const dynamic = "force-dynamic";

/** The whole active ledger (archived customers are not included). */
export async function GET() {
  try {
    if (await needsSetup()) return Response.json({ needsSetup: true, today: todayISO() });
    return Response.json({ ledger: await loadLedger(), today: todayISO(), watiConfigured: watiConfigured() });
  } catch (e) {
    return handleError(e);
  }
}
