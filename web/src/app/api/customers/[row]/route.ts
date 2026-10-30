import { handleError, jsonError, parseRowParam, readJson, ROW_CHANGED_MESSAGE } from "@/lib/api";
import { findRows, locateRow } from "@/lib/rows";
import { deleteCustomerRow, readRow, updateCustomerRow } from "@/lib/sheets";
import {
  inputToRow,
  isStamp,
  makeStamp,
  normalizeInput,
  rowMatchesInput,
  rowToCustomer,
  stampInput,
  todayISO,
  validateInput,
  type CustomerInput,
} from "@/lib/sheet-logic";

interface EditBody {
  input?: Partial<CustomerInput>;
  expected?: string[];
  stamp?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ row: string }> }) {
  const row = parseRowParam((await params).row);
  if (!row) return jsonError("رقم السطر غير صحيح", 400);
  const body = await readJson<EditBody>(request);
  if (body instanceof Response) return body;
  if (!Array.isArray(body.expected)) return jsonError("expected is required", 400);
  const stamp = body.stamp && isStamp(body.stamp) ? body.stamp : makeStamp();
  const input = stampInput(normalizeInput(body.input ?? {}), stamp);
  const errors = validateInput(input);
  if (errors.length) return jsonError(errors[0].message, 400, { errors });
  try {
    const today = todayISO();
    const found = await locateRow(row, body.expected);
    if (!found) {
      // Retry of an edit that already reached the sheet?
      const done = await findRows((r) => rowMatchesInput(r, input));
      if (done.length === 1) return Response.json({ customer: rowToCustomer(done[0].current, done[0].row, today), alreadySaved: true });
      return jsonError(ROW_CHANGED_MESSAGE, 409, { code: "conflict" });
    }
    await updateCustomerRow(found.row, inputToRow(input, stamp, found.current));
    return Response.json({ customer: rowToCustomer(await readRow(found.row), found.row, today) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ row: string }> }) {
  const row = parseRowParam((await params).row);
  if (!row) return jsonError("رقم السطر غير صحيح", 400);
  const body = await readJson<{ expected?: string[] }>(request);
  if (body instanceof Response) return body;
  if (!Array.isArray(body.expected)) return jsonError("expected is required", 400);
  try {
    const found = await locateRow(row, body.expected);
    // Not found: changed by someone else, or already deleted by an earlier try.
    if (!found) return jsonError(ROW_CHANGED_MESSAGE, 409, { code: "conflict" });
    await deleteCustomerRow(found.row);
    return Response.json({ ok: true, row: found.row });
  } catch (e) {
    return handleError(e);
  }
}
