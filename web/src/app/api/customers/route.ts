import { handleError, jsonError, readJson } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { findRows } from "@/lib/rows";
import { appendCustomerRow, readCustomerRows, readRow } from "@/lib/sheets";
import {
  inputToRow,
  isStamp,
  makeStamp,
  normalizeInput,
  rowMatchesInput,
  rowToCustomer,
  rowsToCustomers,
  stampInput,
  todayISO,
  validateInput,
  type CustomerInput,
} from "@/lib/sheet-logic";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = todayISO();
    const customers = rowsToCustomers(await readCustomerRows(), today);
    return Response.json({ customers, today, watiConfigured: watiConfigured() });
  } catch (e) {
    return handleError(e);
  }
}

interface AddBody extends Partial<CustomerInput> {
  /** Time stamp chosen when the customer was added (offline adds are sent later). */
  stamp?: string;
}

export async function POST(request: Request) {
  const body = await readJson<AddBody>(request);
  if (body instanceof Response) return body;
  const stamp = body.stamp && isStamp(body.stamp) ? body.stamp : makeStamp();
  const input = stampInput(normalizeInput(body), stamp);
  const errors = validateInput(input);
  if (errors.length) return jsonError(errors[0].message, 400, { errors });
  try {
    const today = todayISO();
    // A retry of an add that already reached the sheet: return that row instead of adding it twice.
    const existing = await findRows((r) => rowMatchesInput(r, input));
    if (existing.length) {
      return Response.json({ customer: rowToCustomer(existing[0].current, existing[0].row, today), alreadySaved: true });
    }
    const row = await appendCustomerRow(inputToRow(input, stamp));
    return Response.json({ customer: rowToCustomer(await readRow(row), row, today) }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
