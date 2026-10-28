import { handleError, jsonError, readJson } from "@/lib/api";
import { watiConfigured } from "@/lib/env";
import { appendCustomerRow, readCustomerRows, readRow } from "@/lib/sheets";
import { inputToRow, makeStamp, normalizeInput, rowToCustomer, rowsToCustomers, todayISO, validateInput, type CustomerInput } from "@/lib/sheet-logic";

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

export async function POST(request: Request) {
  const body = await readJson<Partial<CustomerInput>>(request);
  if (body instanceof Response) return body;
  const input = normalizeInput(body);
  const errors = validateInput(input);
  if (errors.length) return jsonError(errors[0].message, 400, { errors });
  try {
    const row = await appendCustomerRow(inputToRow(input, makeStamp()));
    const customer = rowToCustomer(await readRow(row), row, todayISO());
    return Response.json({ customer }, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}
