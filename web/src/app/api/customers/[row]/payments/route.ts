import { handleError, jsonError, parseRowParam, readJson, ROW_CHANGED_MESSAGE } from "@/lib/api";
import { readRow, updateCustomerRow } from "@/lib/sheets";
import {
  appendPayment,
  customerToInput,
  inputToRow,
  isISODate,
  makeStamp,
  rowChanged,
  rowToCustomer,
  todayISO,
} from "@/lib/sheet-logic";

interface PaymentBody {
  amount?: number | string;
  paidDate?: string;
  nextDueDate?: string;
  expected?: string[];
}

export async function POST(request: Request, { params }: { params: Promise<{ row: string }> }) {
  const row = parseRowParam((await params).row);
  if (!row) return jsonError("رقم السطر غير صحيح", 400);
  const body = await readJson<PaymentBody>(request);
  if (body instanceof Response) return body;

  const amount = Number(String(body.amount ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return jsonError("المبلغ غير صحيح", 400);
  const paidDate = String(body.paidDate ?? "");
  if (!isISODate(paidDate)) return jsonError("تاريخ الأداء غير صحيح", 400);
  const nextDueDate = String(body.nextDueDate ?? "");
  if (nextDueDate && !isISODate(nextDueDate)) return jsonError("تاريخ الدفعة المقبلة غير صحيح", 400);
  if (!Array.isArray(body.expected)) return jsonError("expected is required", 400);

  try {
    const today = todayISO();
    const current = await readRow(row);
    if (rowChanged(current, body.expected)) return jsonError(ROW_CHANGED_MESSAGE, 409);
    const customer = rowToCustomer(current, row, today);
    if (!customer) return jsonError("هاد السطر خاوي", 404);

    const input = customerToInput(customer);
    input.advance = appendPayment(customer.advance, amount, makeStamp(paidDate));
    input.dueDate = nextDueDate;
    await updateCustomerRow(row, inputToRow(input, makeStamp(), current));
    return Response.json({ customer: rowToCustomer(await readRow(row), row, today) });
  } catch (e) {
    return handleError(e);
  }
}
