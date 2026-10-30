import { handleError } from "@/lib/api";
import { readAllTabs } from "@/lib/sheets";
import { todayISO } from "@/lib/sheet-logic";
import { buildXlsx, type XlsxCell } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/**
 * Excel backup: a copy of every tab of the Google Sheet (customers,
 * purchases, payments, archive, reminder log…), one sheet per tab.
 */
export async function GET() {
  try {
    const tabs = await readAllTabs();
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
