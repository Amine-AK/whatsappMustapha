import { describe, expect, it } from "vitest";
import {
  applyOp,
  applyOps,
  defaultPurchaseFor,
  EMPTY_LEDGER,
  isLedgerId,
  monthsToFinish,
  newLedgerId,
  summarizeClient,
  type Client,
  type Ledger,
  type LedgerOp,
  type Payment,
  type Purchase,
} from "./ledger";
import { ledgerToRows, migrateOldRows, rowsToLedger, sameRow, TABS } from "./ledger-sheet";
import { paymentReceipt, statement } from "./receipt";

const T0 = "2026-01-10T10:00:00.000Z";
let n = 0;
const op = <T extends object>(body: T, at = `2026-01-10T10:00:${String(++n).padStart(2, "0")}.000Z`) =>
  ({ ...body, opId: `O-TEST${n}`, at }) as unknown as LedgerOp;

const client: Client = { id: "C-AAAA1111", name: "محمد صاحب سمير", phone: "0661234567", installment: 1000, period: "شهر", nextDueDate: "2026-02-10", notes: "", createdAt: T0, updatedAt: T0 };
const fridge: Purchase = { id: "S-FRIDGE01", clientId: client.id, date: "2026-01-10", item: "ثلاجة", price: 6000, notes: "", createdAt: T0, updatedAt: T0 };
const washer: Purchase = { id: "S-WASHER01", clientId: client.id, date: "2026-04-15", item: "ماشينة الصابون", price: 2500, notes: "", createdAt: T0, updatedAt: T0 };
const pay = (id: string, date: string, amount: number, purchaseId = "", kind: Payment["kind"] = "دفعة"): Payment => ({
  id, clientId: client.id, purchaseId, date, time: "10:00", amount, kind, notes: "", createdAt: `${date}T10:00:00Z`, updatedAt: T0,
});

/** The user's example: fridge 6000, 2000 down, 1000/month, then a washer 2500 with 1500 down. */
function example(): Ledger {
  return applyOps(EMPTY_LEDGER, [
    op({ type: "client.add", client }),
    op({ type: "purchase.add", purchase: fridge }),
    op({ type: "payment.add", payment: pay("P-PAY00001", "2026-01-10", 2000, fridge.id, "تسبيق") }),
    op({ type: "payment.add", payment: pay("P-PAY00002", "2026-02-10", 1000) }),
    op({ type: "payment.add", payment: pay("P-PAY00003", "2026-03-10", 1000) }),
    op({ type: "payment.add", payment: pay("P-PAY00004", "2026-04-10", 1000) }),
    op({ type: "purchase.add", purchase: washer }),
    op({ type: "payment.add", payment: pay("P-PAY00005", "2026-04-15", 1500, washer.id, "تسبيق"), nextDueDate: "2026-05-10" }),
  ]);
}

describe("one running debt per customer", () => {
  it("adds purchases and payments into one balance, with each item's status", () => {
    const s = summarizeClient(example(), client, "2026-04-20");
    expect(s).toMatchObject({ total: 8500, paid: 6500, remaining: 2000, lastPaymentDate: "2026-04-15", status: "upcoming" });
    expect(s.client.nextDueDate).toBe("2026-05-10");
    // Fridge: 2000 chosen for it + 3000 general → 1000 left. Washer: 1500 chosen → 1000 left.
    expect(s.items.map((i) => [i.purchase.item, i.remaining])).toEqual([["ثلاجة", 1000], ["ماشينة الصابون", 1000]]);
    expect(defaultPurchaseFor(s)).toBe(fridge.id);
  });

  it("estimates the months left at the current instalment", () => {
    expect(monthsToFinish(2000, 1000, "شهر")).toBe(2);
    expect(monthsToFinish(2000, 250, "سيمانة")).toBe(2);
    expect(monthsToFinish(0, 1000, "شهر")).toBe(0);
    expect(monthsToFinish(2000, 0, "شهر")).toBeNull();
  });

  it("logs instalment changes with the old values", () => {
    let l = example();
    const r = applyOp(l, op({ type: "client.installment", id: client.id, base: l.clients[0].updatedAt, change: { id: "T-CHANGE01", clientId: client.id, date: "2026-04-15", oldAmount: 0, newAmount: 1500, oldPeriod: "", newPeriod: "شهر", reason: "شرا ماشينة الصابون", createdAt: T0 } }));
    expect(r.result).toBe("ok");
    l = r.ledger;
    expect(l.clients[0].installment).toBe(1500);
    expect(l.changes[0]).toMatchObject({ oldAmount: 1000, newAmount: 1500, oldPeriod: "شهر", reason: "شرا ماشينة الصابون" });
  });

  it("ignores the date a customer was added once they have bought or paid", () => {
    const moved = { ...client, createdAt: "2026-10-30T09:00:00Z" };
    const l = applyOps(EMPTY_LEDGER, [
      op({ type: "client.add", client: moved }),
      op({ type: "purchase.add", purchase: { ...fridge, price: 500 } }),
      op({ type: "payment.add", payment: pay("P-PAYOLD01", "2026-04-01", 500) }),
    ]);
    const s = summarizeClient(l, moved, "2026-10-30");
    expect(s.lastActivity).toBe("2026-04-01");
    expect(s.archivable).toBe(true);
  });

  it("can be archived 3 months after the last payment that cleared the debt", () => {
    const l = applyOp(example(), op({ type: "payment.add", payment: pay("P-PAY00006", "2026-05-10", 2000) })).ledger;
    expect(summarizeClient(l, client, "2026-08-09").archivable).toBe(false);
    expect(summarizeClient(l, client, "2026-08-11").archivable).toBe(true);
  });
});

describe("operations are safe to repeat and to delay", () => {
  it("skips an operation sent twice", () => {
    const add = op({ type: "payment.add", payment: pay("P-PAY00009", "2026-05-01", 500) });
    const once = applyOp(example(), add);
    const twice = applyOp(once.ledger, add);
    expect([once.result, twice.result]).toEqual(["ok", "already"]);
    expect(twice.ledger.payments.filter((p) => p.id === "P-PAY00009")).toHaveLength(1);
  });

  it("refuses an edit made on an old version, but accepts its own retry", () => {
    const l = example();
    const base = l.clients[0].updatedAt;
    const edit = op({ type: "client.update", id: client.id, base, patch: { phone: "0700000000" } });
    const r1 = applyOp(l, edit);
    expect(applyOp(r1.ledger, edit).result).toBe("already");
    const stale = op({ type: "client.update", id: client.id, base, patch: { name: "آخر" } });
    expect(applyOp(r1.ledger, stale).result).toBe("conflict");
  });

  it("moves a payment recorded on the wrong customer", () => {
    const other: Client = { ...client, id: "C-BBBB2222", name: "سعاد اخت سمير" };
    let l = applyOp(example(), op({ type: "client.add", client: other })).ledger;
    const wrong = l.payments.find((p) => p.id === "P-PAY00004")!;
    const r = applyOp(l, op({ type: "payment.update", id: wrong.id, base: wrong.updatedAt, patch: { clientId: other.id, purchaseId: fridge.id } }));
    expect(r.result).toBe("ok");
    l = r.ledger;
    const moved = l.payments.find((p) => p.id === wrong.id)!;
    // The fridge belongs to the first customer: the moved payment becomes general.
    expect(moved).toMatchObject({ clientId: other.id, purchaseId: "" });
    expect(summarizeClient(l, client, "2026-04-20").remaining).toBe(3000);
    expect(summarizeClient(l, other, "2026-04-20").paid).toBe(1000);
  });

  it("refuses bad data and deleting a customer who has a history", () => {
    expect(applyOp(EMPTY_LEDGER, op({ type: "client.add", client: { ...client, name: " " } })).result).toBe("invalid");
    expect(applyOp(example(), op({ type: "payment.add", payment: { ...pay("P-PAY00010", "2026-05-01", -5) } })).result).toBe("invalid");
    expect(applyOp(example(), op({ type: "client.update", id: client.id, base: example().clients[0].updatedAt, patch: { installment: 1 } as never })).ledger.clients[0].installment).toBe(1000);
    expect(applyOp(example(), op({ type: "client.delete", id: client.id })).result).toBe("invalid");
  });

  it("keeps payments when their purchase is deleted", () => {
    const l = applyOp(example(), op({ type: "purchase.delete", id: washer.id })).ledger;
    expect(l.payments.find((p) => p.id === "P-PAY00005")!.purchaseId).toBe("");
  });

  it("makes readable unique ids", () => {
    const id = newLedgerId("C");
    expect(isLedgerId(id)).toBe(true);
    expect(id).toMatch(/^C-[A-Z2-9]{8}$/);
  });
});

describe("receipts", () => {
  it("prints a payment with the account as it was that day", () => {
    const s = summarizeClient(example(), client, "2026-04-20");
    const r = paymentReceipt(s, s.payments.find((p) => p.id === "P-PAY00002")!);
    expect(r).toMatchObject({ number: "P-PAY00002", date: "10/02/2026 - 10:00", amount: 1000, total: 6000, paidToDate: 3000, remaining: 3000, nextDueDate: "" });
    const last = paymentReceipt(s, s.payments.find((p) => p.id === "P-PAY00005")!);
    expect(last).toMatchObject({ item: "ماشينة الصابون", label: "تسبيق", total: 8500, paidToDate: 6500, remaining: 2000, nextDueDate: "2026-05-10" });
    // Every item not fully paid yet, with what is left on it.
    expect(last.unpaid).toEqual([
      { date: "10/01/2026", item: "ثلاجة", price: 6000, remaining: 1000 },
      { date: "15/04/2026", item: "ماشينة الصابون", price: 2500, remaining: 1000 },
    ]);
    // An older receipt shows the items as they were that day (the washer wasn't bought yet).
    expect(r.unpaid).toEqual([{ date: "10/01/2026", item: "ثلاجة", price: 6000, remaining: 3000 }]);
  });

  it("lists nothing left to pay once everything is paid", () => {
    const l = applyOp(example(), op({ type: "payment.add", payment: pay("P-PAY00007", "2026-05-10", 2000) })).ledger;
    const s = summarizeClient(l, client, "2026-05-10");
    expect(paymentReceipt(s, s.payments.find((p) => p.id === "P-PAY00007")!).unpaid).toEqual([]);
  });

  it("prints the whole account, optionally only the last payments", () => {
    const s = summarizeClient(example(), client, "2026-04-20");
    const st = statement(s, "20/04/2026 - 12:00", 3);
    expect(st.items).toEqual([
      { date: "10/01/2026", item: "ثلاجة", price: 6000, remaining: 1000 },
      { date: "15/04/2026", item: "ماشينة الصابون", price: 2500, remaining: 1000 },
    ]);
    expect(st.payments).toHaveLength(3);
    expect(st).toMatchObject({ hiddenPayments: 2, hiddenTotal: 3000, total: 8500, paid: 6500, remaining: 2000, installment: "1000 درهم (كل شهر)" });
  });
});

describe("sheet layout", () => {
  it("writes and reads back the same ledger", () => {
    const l = example();
    const rows = ledgerToRows(l, "2026-04-20");
    const back = rowsToLedger({
      clients: [...rows.clients.values()],
      purchases: [...rows.purchases.values()],
      payments: [...rows.payments.values()],
      changes: [...rows.changes.values()],
    });
    expect(back).toEqual(l);
    expect(rows.clients.get(client.id)!.slice(7, 11)).toEqual([8500, 6500, 2000, "2026-04-15"]);
    expect(rows.payments.get("P-PAY00005")![8]).toBe("ماشينة الصابون");
    expect(sameRow(["P-1", "500"], ["P-1", 500])).toBe(true);
    expect(TABS.clients).toBe("الزبناء");
  });

  it("reads dates and times typed by hand in the sheet", () => {
    const p = rowsToLedger({ clients: [], purchases: [], payments: [["P-X1234", "C-AAAA1111", "", 46323, 0.5, "1000", "دفعة"]], changes: [] }).payments[0];
    expect(p).toMatchObject({ date: "2026-10-28", time: "12:00", amount: 1000 });
  });
});

describe("migration from Feuille 1", () => {
  const old = (over: Record<number, string>) => Object.assign(new Array(17).fill(""), over);
  it("splits items and payments of the old single row", () => {
    const l = migrateOldRows([
      old({ 0: "Ahmed", 1: "0661234567", 2: "TV (01/03/2026 - 10:00) + Frigo (05/06/2026 - 11:30)", 3: "4500+6000", 4: "3500+4800", 6: "1000 (01/03/2026 - 10:00) + 500 (01/04/2026 - 18:05) + 2000 (05/06/2026 - 11:30)", 8: "شهر", 9: "2026-11-05", 13: "800" }),
      old({ 0: "Karim", 2: "Four", 3: "1000", 6: "0", 13: "حسب الاتفاق" }),
      old({}),
    ]);
    expect(l.clients.map((c) => [c.name, c.installment, c.nextDueDate, c.notes])).toEqual([
      ["Ahmed", 800, "2026-11-05", ""],
      ["Karim", 0, "", "الطريطة: حسب الاتفاق"],
    ]);
    expect(l.purchases.map((p) => [p.item, p.date, p.price])).toEqual([
      ["TV", "2026-03-01", 4500],
      ["Frigo", "2026-06-05", 6000],
      ["Four", expect.any(String), 1000],
    ]);
    // The old buying price (column E) is not carried over.
    expect(l.purchases.every((p) => !("cost" in p))).toBe(true);
    expect(l.payments.map((p) => [p.date, p.time, p.amount, p.kind, p.purchaseId === l.purchases[0].id])).toEqual([
      ["2026-03-01", "10:00", 1000, "تسبيق", true],
      ["2026-04-01", "18:05", 500, "دفعة", false],
      ["2026-06-05", "11:30", 2000, "دفعة", false],
    ]);
    const s = summarizeClient(l, l.clients[0], "2026-10-30");
    expect([s.total, s.paid, s.remaining]).toEqual([10500, 3500, 7000]);
  });

  it("keeps a row whose prices don't match its items as one purchase", () => {
    const l = migrateOldRows([old({ 0: "Salma", 2: "Machine + Four", 3: "6000", 6: "2000" })]);
    expect(l.purchases).toHaveLength(1);
    expect(l.purchases[0]).toMatchObject({ item: "Machine + Four", price: 6000 });
  });
});
