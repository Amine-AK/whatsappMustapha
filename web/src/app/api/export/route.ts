import { handleError } from "@/lib/api";
import { requireUser } from "@/lib/access";
import { readAllTabs } from "@/lib/sheets";
import { USERS_TAB } from "@/lib/users";
import { todayISO } from "@/lib/sheet-logic";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/**
 * Excel backup: a copy of every tab of the Google Sheet (customers,
 * purchases, payments, archive, reminder log…), one sheet per tab.
 */
export async function GET() {
  const me = await requireUser("backup");
  if (me instanceof Response) return me;
  try {
    // The accounts tab (password hashes) never leaves the server.
    const tabs = (await readAllTabs()).filter((t) => t.title !== USERS_TAB);
    const file = buildXlsx(tabs.map((t) => ({ name: t.title, rows: t.rows as XlsxCell[][] })));
    const name = `electro-lmestour-backup-${todayISO()}.xlsx`;
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
