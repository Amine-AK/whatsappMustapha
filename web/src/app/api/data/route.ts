import { handleError } from "@/lib/api";
import { ledgerFor, requireUser } from "@/lib/access";
import { env, watiConfigured } from "@/lib/env";
import { loadLedger, needsSetup } from "@/lib/store";
import { todayISO } from "@/lib/sheet-logic";

export const dynamic = "force-dynamic";

/** The whole active ledger (archived customers are not included). */
export async function GET() {
  const me = await requireUser();
  if (me instanceof Response) return me;
  try {
    if (await needsSetup()) return Response.json({ needsSetup: true, today: todayISO(), me });
    // devReset: DEV ONLY, shows the «مسح جميع المعلومات» button.
    return Response.json({
      ledger: ledgerFor(me, await loadLedger()),
      today: todayISO(),
      me,
      watiConfigured: watiConfigured(),
      devReset: env.allowDataReset() && me.role === "owner",
    });
  } catch (e) {
    return handleError(e);
  }
}
