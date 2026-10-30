import { describe, expect, it } from "vitest";
import { buildReceipt } from "./receipt";
import { listPayments, rowToCustomer } from "./sheet-logic";

function customer(advance: string) {
  const row = new Array(17).fill("");
  Object.assign(row, { 0: "محمد صاحب سمير", 1: "0661234567", 2: "تلفاز (01/10/2026 - 10:00) + ثلاجة (05/10/2026 - 11:00)", 3: "3000+4000", 6: advance, 8: "شهر", 9: "2026-11-28", 13: "500" });
  return rowToCustomer(row, 2, "2026-10-30")!;
}

describe("listPayments", () => {
  it("reads amounts and stamps, skipping empty parts", () => {
    expect(listPayments("1000 (01/10/2026 - 10:00) + 500 (25/10/2026 - 14:30) + 200")).toEqual([
      { amount: 1000, stamp: "01/10/2026 - 10:00" },
      { amount: 500, stamp: "25/10/2026 - 14:30" },
      { amount: 200, stamp: "" },
    ]);
    expect(listPayments("0")).toEqual([]);
  });
});

describe("buildReceipt", () => {
  const c = customer("1000 (01/10/2026 - 10:00) + 500 (25/10/2026 - 14:30) + 500 (30/10/2026 - 09:05)");
  it("describes the latest payment with the next due date", () => {
    expect(buildReceipt(c)).toEqual({
      number: "261030-0905",
      date: "30/10/2026 - 09:05",
      label: "دفعة 3",
      customer: "محمد صاحب سمير",
      phone: "0661234567",
      items: "تلفاز + ثلاجة",
      amount: 500,
      total: 7000,
      paidToDate: 2000,
      remaining: 5000,
      nextDueDate: "2026-11-28",
      installment: "500 درهم (كل شهر)",
    });
  });
  it("reprints an older payment with the totals of that day", () => {
    expect(buildReceipt(c, 0)).toMatchObject({ label: "تسبيق", amount: 1000, paidToDate: 1000, remaining: 6000, nextDueDate: "", number: "261001-1000" });
  });
  it("has nothing to print without payments", () => {
    expect(buildReceipt(customer("0"))).toBeNull();
  });
});
