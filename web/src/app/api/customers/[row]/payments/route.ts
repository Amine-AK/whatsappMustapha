import { handleError, jsonError, parseRowParam, readJson, ROW_CHANGED_MESSAGE } from "@/lib/api";
import { findRows, locateRow } from "@/lib/rows";
import { readRow, updateCustomerRow } from "@/lib/sheets";
import {
  appendPayment,
  COL,
  customerToInput,
  formatAmount,
  inputToRow,
  isISODate,
  isStamp,
  makeStamp,
  rowToCustomer,
  sameCell,
  todayISO,
} from "@/lib/sheet-logic";

interface PaymentBody {
  amount?: number | string;
  paidDate?: string;
  nextDueDate?: string;
  expected?: string[];
  /** "dd/MM/yyyy - HH:mm" chosen when the payment was recorded (offline payments are sent later). */
  stamp?: string;
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
  const stamp = body.stamp && isStamp(body.stamp) ? body.stamp : makeStamp(paidDate);
  const part = `${formatAmount(amount)} (${stamp})`;
  const expected = body.expected;

  try {
    const today = todayISO();
    const found = await locateRow(row, expected);
    if (!found) {
      // Retry of a payment that already reached the sheet: same customer, payment already listed.
      const done = await findRows(
        (r) =>
          sameCell(COL.name, r[COL.name] ?? "", expected[COL.name] ?? "") &&
          sameCell(COL.phone, r[COL.phone] ?? "", expected[COL.phone] ?? "") &&
          String(r[COL.advance] ?? "").split("+").map((p) => p.trim()).includes(part),
      );
      if (done.length === 1) return Response.json({ customer: rowToCustomer(done[0].current, done[0].row, today), alreadySaved: true });
      return jsonError(ROW_CHANGED_MESSAGE, 409, { code: "conflict" });
    }
    const customer = rowToCustomer(found.current, found.row, today);
    if (!customer) return jsonError("هاد السطر خاوي", 404);

    const input = customerToInput(customer);
    input.advance = appendPayment(customer.advance, amount, stamp);
    input.dueDate = nextDueDate;
    await updateCustomerRow(found.row, inputToRow(input, makeStamp(), found.current));
    return Response.json({ customer: rowToCustomer(await readRow(found.row), found.row, today) });
  } catch (e) {
    return handleError(e);
  }
}
