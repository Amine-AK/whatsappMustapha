import { describe, expect, it } from "vitest";
import { applyOps, keyCustomers, shiftRowsAfterDelete, type LocalCustomer, type Op } from "./offline";
import { rowToCustomer, type CustomerInput } from "./sheet-logic";

const TODAY = "2026-10-30";

function sheetRow(name: string, due = "2026-10-20", advance = "1000 (01/10/2026 - 10:00)"): string[] {
  const row = new Array(17).fill("");
  Object.assign(row, { 0: name, 1: "0661234567", 2: "TV (01/10/2026 - 10:00)", 3: "3000", 4: "2000", 6: advance, 8: "شهر", 9: due, 13: "500" });
  return row;
}

function local(name: string, row: number, uid = name): LocalCustomer {
  return { ...rowToCustomer(sheetRow(name), row, TODAY)!, uid };
}

const base = { createdAt: "", status: "pending" as const, attempts: 0, label: "" };
const input: CustomerInput = { name: "Youssef", phone: "0670112233", items: "Frigo (30/10/2026 - 12:00)", sell: "5000", buy: "4000", advance: "1000 (30/10/2026 - 12:00)", period: "شهر", dueDate: "2026-11-30", installment: "500" };

describe("applyOps", () => {
  const list = [local("Ahmed", 2), local("Fatima", 3)];

  it("shows an offline add, payment, edit and delete right away", () => {
    const ops: Op[] = [
      { ...base, id: "1", uid: "new", kind: "add", input, stamp: "30/10/2026 - 12:00" },
      { ...base, id: "2", uid: "Ahmed", kind: "pay", amount: 500, paidDate: "2026-10-29", nextDueDate: "2026-11-20", stamp: "29/10/2026 - 12:00" },
      { ...base, id: "3", uid: "Fatima", kind: "delete" },
    ];
    const out = applyOps(list, ops, TODAY);
    expect(out.map((c) => c.name)).toEqual(["Ahmed", "Youssef"]);
    const ahmed = out[0];
    expect(ahmed.advance).toBe("1000 (01/10/2026 - 10:00) + 500 (29/10/2026 - 12:00)");
    expect(ahmed.remaining).toBe(1500);
    expect(ahmed.dueDate).toBe("2026-11-20");
    expect(ahmed.pending).toBe(true);
    // The sheet hasn't changed yet: keep what it holds, to find the row when syncing.
    expect(ahmed.expected).toEqual(list[0].expected);
    expect(out[1]).toMatchObject({ uid: "new", remaining: 4000, pending: true });
  });

  it("applies several changes to the same customer in order", () => {
    const ops: Op[] = [
      { ...base, id: "1", uid: "Ahmed", kind: "pay", amount: 500, paidDate: "2026-10-29", nextDueDate: "2026-11-20", stamp: "29/10/2026 - 12:00" },
      { ...base, id: "2", uid: "Ahmed", kind: "pay", amount: 300, paidDate: "2026-10-30", nextDueDate: "2026-12-20", stamp: "30/10/2026 - 09:00" },
    ];
    expect(applyOps(list, ops, TODAY)[0]).toMatchObject({ remaining: 1200, dueDate: "2026-12-20" });
  });

  it("ignores refused changes and recomputes statuses for today", () => {
    const ops: Op[] = [{ ...base, id: "1", uid: "Fatima", kind: "delete", status: "failed" }];
    const out = applyOps(list, ops, "2026-10-20");
    expect(out).toHaveLength(2);
    expect(out[0].status).toBe("today");
  });
});

describe("keeping ids stable", () => {
  it("reuses the id of unchanged rows", () => {
    const prev = [local("Ahmed", 2, "a"), local("Fatima", 3, "f")];
    const fresh = [rowToCustomer(sheetRow("Ahmed"), 2, TODAY)!, rowToCustomer(sheetRow("Fatima", "2026-11-01"), 3, TODAY)!];
    const keyed = keyCustomers(fresh, prev);
    expect(keyed[0].uid).toBe("a");
    expect(keyed[1].uid).not.toBe("f");
  });
  it("moves rows up after a delete", () => {
    const out = shiftRowsAfterDelete([local("A", 2), local("B", 4), local("C", 5)], 3);
    expect(out.map((c) => c.row)).toEqual([2, 3, 4]);
  });
});
