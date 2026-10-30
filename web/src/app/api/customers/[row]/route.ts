import { handleError, jsonError, parseRowParam, readJson, ROW_CHANGED_MESSAGE } from "@/lib/api";
import { deleteCustomerRow, readRow, updateCustomerRow } from "@/lib/sheets";
import { inputToRow, makeStamp, normalizeInput, rowChanged, rowToCustomer, todayISO, validateInput, type CustomerInput } from "@/lib/sheet-logic";

interface EditBody {
  input?: Partial<CustomerInput>;
  expected?: string[];
}

export async function PUT(request: Request, { params }: { params: Promise<{ row: string }> }) {
  const row = parseRowParam((await params).row);
  if (!row) return jsonError("رقم السطر غير صحيح", 400);
  const body = await readJson<EditBody>(request);
  if (body instanceof Response) return body;
  if (!Array.isArray(body.expected)) return jsonError("expected is required", 400);
  const input = normalizeInput(body.input ?? {});
  const errors = validateInput(input);
  if (errors.length) return jsonError(errors[0].message, 400, { errors });
  try {
    const current = await readRow(row);
    if (rowChanged(current, body.expected)) return jsonError(ROW_CHANGED_MESSAGE, 409);
    await updateCustomerRow(row, inputToRow(input, makeStamp(), current));
    return Response.json({ customer: rowToCustomer(await readRow(row), row, todayISO()) });
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
    if (rowChanged(await readRow(row), body.expected)) return jsonError(ROW_CHANGED_MESSAGE, 409);
    await deleteCustomerRow(row);
    return Response.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
