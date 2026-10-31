import { describe, expect, it } from "vitest";
import { applyOp, emptyLedger, summarizeClient, type Ledger, type LedgerOp, type Purchase, type Sale, type StockItem } from "./ledger";
import { ledgerToRows, rowsToLedger, TABS } from "./ledger-sheet";
import { cashDay, categoryIcon, filterSales, findByCode, marginCheck, normalizeText, rangeOf, report, searchStock } from "./shop";

const AT = "2026-10-20T09:00:00.000Z";
let n = 0;
const op = (body: object): LedgerOp => ({ opId: `O-TEST${String(++n).padStart(4, "0")}`, at: `2026-10-20T10:00:${String(n % 60).padStart(2, "0")}.000Z`, ...body }) as LedgerOp;

function run(l: Ledger, body: object) {
  const r = applyOp(l, op(body));
  if (r.result !== "ok") throw new Error(`${r.result}: ${r.message}`);
  return r.ledger;
}

const iphone: StockItem = {
  id: "I-IPHONE11", item: "iPhone 11 64GB", category: "هواتف وأجهزة", condition: "مستعمل", buyPrice: 2000, sellPrice: 2600,
  quantity: 3, serial: "356789012345678", notes: "", createdAt: AT, updatedAt: AT,
};
const charger: StockItem = { ...iphone, id: "I-CHARGER1", item: "شارجور Type-C سامسونگ", category: "إكسسوارات وكابلات", condition: "جديد", buyPrice: 20, sellPrice: 50, quantity: 10, serial: "" };
const fridge: StockItem = { ...iphone, id: "I-FRIDGE01", item: "ثلاجة Samsung 400L", category: "كهرومنزلي كبير", condition: "جديد", buyPrice: 5000, sellPrice: 6200, quantity: 0, serial: "" };

function line(over: Partial<Sale>): Sale {
  return {
    id: "V-LINE0001", ticket: "V-LINE0001", date: "2026-10-20", time: "10:00", item: "iPhone 11 64GB", category: "هواتف وأجهزة",
    stockId: "I-IPHONE11", quantity: 1, buyPrice: 2000, listPrice: 2600, sellPrice: 2500, type: "كاش", clientId: "", purchaseId: "",
    seller: "سعيد", notes: "", createdAt: AT, updatedAt: AT, ...over,
  };
}

function shop(): Ledger {
  let l = emptyLedger();
  for (const item of [iphone, charger, fridge]) l = run(l, { type: "stock.add", item });
  return run(l, {
    type: "client.add",
    client: { id: "C-KARIM001", name: "كريم", phone: "0661234567", installment: 500, period: "شهر", nextDueDate: "2026-11-20", notes: "", createdAt: AT, updatedAt: AT },
  });
}

describe("product search", () => {
  it("finds products from a few letters", () => {
    expect(searchStock([iphone, charger, fridge], "ip 11").map((s) => s.id)).toEqual(["I-IPHONE11"]);
    expect(searchStock([iphone, charger, fridge], "type c")[0].id).toBe("I-CHARGER1");
    expect(searchStock([iphone, charger, fridge], "تلاجة").length).toBe(0);
    expect(searchStock([iphone, charger, fridge], "ثلاجه")[0].id).toBe("I-FRIDGE01");
    expect(searchStock([iphone, charger, fridge], "64")[0].id).toBe("I-IPHONE11");
    expect(searchStock([iphone, charger, fridge], "345678")[0].id).toBe("I-IPHONE11");
    expect(normalizeText("إصلاحٌ  الشاشة")).toBe("اصلاح الشاشه");
  });

  it("finds a product by its scanned code", () => {
    const sold = { ...iphone, id: "I-IPHONEOLD", quantity: 0 };
    expect(findByCode([sold, iphone, charger], " 356789012345678 ")?.id).toBe("I-IPHONE11"); // the one still in stock
    expect(findByCode([iphone], "35678901234")).toBeUndefined(); // exact code only
    expect(findByCode([iphone], "")).toBeUndefined();
  });

  it("gives each family an icon", () => {
    expect(["كهرومنزلي كبير", "هواتف وأجهزة", "إكسسوارات وكابلات", "ريباراسيون", "أواني منزلية", "شي حاجة أخرى"].map(categoryIcon)).toEqual(["🧊", "📱", "🔌", "🛠️", "🍳", "📦"]);
  });

  it("warns below cost or under the family's margin", () => {
    expect(marginCheck(1900, 2000, undefined)).toBe("loss");
    expect(marginCheck(2100, 2000, { name: "x", description: "", marginTarget: 10, icon: "" })).toBe("low");
    expect(marginCheck(2300, 2000, { name: "x", description: "", marginTarget: 10, icon: "" })).toBe("ok");
    expect(marginCheck(100, null, undefined)).toBe("unknown");
  });
});

describe("sales", () => {
  it("a cash sale takes the products out of stock, once", () => {
    const body = { type: "sale.add", lines: [line({}), line({ id: "V-LINE0002", stockId: "I-CHARGER1", item: "شارجور", quantity: 2, buyPrice: 40, listPrice: 100, sellPrice: 100 })], purchases: [] };
    const o = op(body);
    const l = applyOp(shop(), o).ledger;
    expect(l.stock.find((s) => s.id === "I-IPHONE11")!.quantity).toBe(2);
    expect(l.stock.find((s) => s.id === "I-CHARGER1")!.quantity).toBe(8);
    expect(l.sales).toHaveLength(2);
    // Sent twice (no network answer the first time): nothing changes.
    expect(applyOp(l, o).result).toBe("already");
  });

  it("a credit sale also goes on the customer's account", () => {
    const p: Purchase = { id: "S-PHONE001", clientId: "C-KARIM001", date: "2026-10-20", item: "iPhone 11 64GB", price: 2500, notes: "", createdAt: AT, updatedAt: AT };
    let l = run(shop(), { type: "sale.add", lines: [line({ type: "كريدي", clientId: "C-KARIM001", purchaseId: p.id })], purchases: [p] });
    l = run(l, { type: "payment.add", payment: { id: "P-ADV00001", clientId: "C-KARIM001", purchaseId: p.id, date: "2026-10-20", time: "10:00", amount: 1000, kind: "تسبيق", notes: "", createdAt: AT, updatedAt: AT } });
    const s = summarizeClient(l, l.clients[0], "2026-10-20");
    expect([s.total, s.paid, s.remaining]).toEqual([2500, 1000, 1500]);
    // Changing the price on the account changes the sale too.
    l = run(l, { type: "purchase.update", id: p.id, base: l.purchases[0].updatedAt, patch: { price: 2400 } });
    expect(l.sales[0].sellPrice).toBe(2400);
    // Deleting the purchase cancels the sale and puts the phone back in stock.
    l = run(l, { type: "purchase.delete", id: p.id });
    expect(l.sales).toHaveLength(0);
    expect(l.stock.find((x) => x.id === "I-IPHONE11")!.quantity).toBe(3);
  });

  it("refuses a credit sale without a customer, or a cash sale with one", () => {
    expect(applyOp(shop(), op({ type: "sale.add", lines: [line({ type: "كريدي", clientId: "C-NOBODY01" })], purchases: [] })).result).toBe("invalid");
    expect(applyOp(shop(), op({ type: "sale.add", lines: [line({ clientId: "C-KARIM001" })], purchases: [] })).result).toBe("invalid");
  });

  it("cancelling a line puts the product back", () => {
    let l = run(shop(), { type: "sale.add", lines: [line({})], purchases: [] });
    l = run(l, { type: "sale.delete", id: "V-LINE0001" });
    expect(l.stock.find((x) => x.id === "I-IPHONE11")!.quantity).toBe(3);
    expect(l.sales).toHaveLength(0);
  });

  it("stock counted by hand adds up from two phones and is logged", () => {
    const move = (id: string, delta: number) => ({ type: "stock.adjust", move: { id, stockId: "I-FRIDGE01", date: "2026-10-20", delta, reason: "وصلات السلعة", seller: "سعيد", createdAt: AT } });
    let l = run(shop(), move("M-ARRIVE01", 4));
    l = run(l, move("M-ARRIVE02", -1));
    expect(l.stock.find((x) => x.id === "I-FRIDGE01")!.quantity).toBe(3);
    expect(applyOp(l, op(move("M-ARRIVE02", -1))).result).toBe("already");
    expect(l.moves).toHaveLength(2);
  });

  it("is saved to the sheet and read back the same", () => {
    let l = run(shop(), { type: "sale.add", lines: [line({ id: "V-FREE0001", ticket: "V-FREE0001", stockId: "", item: "إصلاح", category: "ريباراسيون", buyPrice: null, listPrice: 150, sellPrice: 150 })], purchases: [] });
    l = run(l, { type: "stock.adjust", move: { id: "M-LOSS0001", stockId: "I-CHARGER1", date: "2026-10-20", delta: -2, reason: "خاسرين", seller: "", createdAt: AT } });
    l = run(l, { type: "caisse.close", close: { id: "K-CLOSE001", date: "2026-10-20", time: "20:00", clerk: "سعيد", cashSales: 150, advances: 0, installments: 0, expenses: 20, expensesNote: "قهوة", expected: 130, counted: 120, notes: "", createdAt: AT } });
    const rows = ledgerToRows(l, "2026-10-20");
    // The sheet shows the profit (empty when the cost is unknown) and the drawer difference.
    expect(rows.sales.get("V-FREE0001")![11]).toBe("");
    expect(rows.closings.get("K-CLOSE001")![11]).toBe(-10);
    const tables = Object.fromEntries(Object.keys(TABS).map((k) => [k, [...rows[k as keyof typeof TABS].values()]]));
    const back = rowsToLedger(tables);
    expect(back.sales[0]).toEqual({ ...l.sales[0] });
    expect(back.moves[0].delta).toBe(-2);
    expect(back.stock.find((s) => s.id === "I-CHARGER1")!.quantity).toBe(8);
    expect(back.closings[0]).toEqual(l.closings[0]);
  });
});

describe("cash drawer and reports", () => {
  const p: Purchase = { id: "S-FRIDGE01", clientId: "C-KARIM001", date: "2026-10-20", item: "ثلاجة", price: 6200, notes: "", createdAt: AT, updatedAt: AT };
  let l = run(shop(), { type: "sale.add", lines: [line({})], purchases: [] });
  l = run(l, { type: "sale.add", lines: [line({ id: "V-FRIDGE01", ticket: "V-FRIDGE01", item: "ثلاجة", category: "كهرومنزلي كبير", stockId: "I-FRIDGE01", buyPrice: 5000, listPrice: 6200, sellPrice: 6200, type: "كريدي", clientId: "C-KARIM001", purchaseId: p.id })], purchases: [p] });
  l = run(l, { type: "payment.add", payment: { id: "P-ADV00002", clientId: "C-KARIM001", purchaseId: p.id, date: "2026-10-20", time: "11:00", amount: 2000, kind: "تسبيق", notes: "", createdAt: AT, updatedAt: AT } });
  // Recorded today, dated last week.
  l = run(l, { type: "payment.add", payment: { id: "P-OLD00001", clientId: "C-KARIM001", purchaseId: "", date: "2026-10-13", time: "11:00", amount: 500, kind: "دفعة", notes: "", createdAt: AT, updatedAt: AT } });

  it("adds up the day's cash: cash sales + advances + instalments", () => {
    const day = cashDay(l, "2026-10-20");
    expect(day.totals).toEqual({ cashSales: 2500, advances: 2000, installments: 0, incoming: 4500 });
    expect(day.backdated.map((b) => b.id)).toEqual(["P-OLD00001"]);
  });

  it("reports revenue, profit and units per family", () => {
    const r = report(filterSales(l.sales, "2026-10-01", "2026-10-31"), "2026-10-01", "2026-10-31");
    expect([r.revenue, r.profit, r.cash, r.credit, r.units, r.tickets]).toEqual([8700, 1700, 2500, 6200, 2, 2]);
    expect(r.byCategory.map((g) => [g.name, g.units])).toEqual([["كهرومنزلي كبير", 1], ["هواتف وأجهزة", 1]]);
    expect(r.series).toHaveLength(31);
    // "How many fridges this month?"
    expect(report(filterSales(l.sales, "2026-10-01", "2026-10-31", "", "ثلاجه"), "2026-10-01", "2026-10-31").units).toBe(1);
    expect(filterSales(l.sales, "2026-10-01", "2026-10-31", "هواتف وأجهزة")).toHaveLength(1);
  });

  it("knows the usual ranges", () => {
    expect(rangeOf("week", "2026-10-22")).toEqual({ from: "2026-10-19", to: "2026-10-22" }); // Thursday → Monday
    expect(rangeOf("month", "2026-10-22")).toEqual({ from: "2026-10-01", to: "2026-10-22" });
    expect(rangeOf("year", "2026-10-22").from).toBe("2026-01-01");
    expect(report([], "2026-01-01", "2026-10-22").monthly).toBe(true);
  });
});

describe("deleting a customer", () => {
  it("with purchases and payments only when asked, and then everything of theirs goes", () => {
    const p: Purchase = { id: "S-PHONE001", clientId: "C-KARIM001", date: "2026-10-20", item: "iPhone 11 64GB", price: 2500, notes: "", createdAt: AT, updatedAt: AT };
    let l = run(shop(), { type: "sale.add", lines: [line({ type: "كريدي", clientId: "C-KARIM001", purchaseId: p.id })], purchases: [p] });
    l = run(l, { type: "payment.add", payment: { id: "P-ADV00001", clientId: "C-KARIM001", purchaseId: p.id, date: "2026-10-20", time: "10:00", amount: 1000, kind: "تسبيق", notes: "", createdAt: AT, updatedAt: AT } });
    l = run(l, { type: "sale.add", lines: [line({ id: "V-CASH0001", ticket: "V-CASH0001", stockId: "I-CHARGER1", item: "شارجور", buyPrice: 20, listPrice: 50, sellPrice: 50 })], purchases: [] });
    expect(applyOp(l, op({ type: "client.delete", id: "C-KARIM001" })).result).toBe("invalid");
    l = run(l, { type: "client.delete", id: "C-KARIM001", withHistory: true });
    expect([l.clients.length, l.purchases.length, l.payments.length]).toEqual([0, 0, 0]);
    // Their credit sale is cancelled (phone back in stock); other customers' cash sales stay.
    expect(l.sales.map((s) => s.id)).toEqual(["V-CASH0001"]);
    expect(l.stock.find((x) => x.id === "I-IPHONE11")!.quantity).toBe(3);
    expect(applyOp(l, op({ type: "client.delete", id: "C-KARIM001", withHistory: true })).result).toBe("already");
  });
});

describe("family icons", () => {
  it("keeps an emoji or a small picture, refuses anything else", () => {
    const save = (icon: string) => applyOp(emptyLedger(), op({ type: "category.save", category: { name: "تلفزات", description: "", marginTarget: 0, icon } }));
    expect(save("📺").result).toBe("ok");
    expect(save("data:image/webp;base64,UklGRhIAAABXRUJQ").result).toBe("ok");
    expect(save("").result).toBe("ok");
    expect(save("data:image/webp;base64," + "A".repeat(50_000)).result).toBe("invalid"); // too big for a cell
    expect(save("data:text/html;base64,PHNjcmlwdD4=").result).toBe("invalid");
    expect(save("<img src=x onerror=alert(1)>").result).toBe("invalid");
    // Changing only the icon is a change.
    const l = save("📺").ledger;
    expect(applyOp(l, op({ type: "category.save", category: { name: "تلفزات", description: "", marginTarget: 0, icon: "🖥️" } })).result).toBe("ok");
  });

  it("is saved in the new column and read back", () => {
    const l = applyOp(emptyLedger(), op({ type: "category.save", category: { name: "تلفزات", description: "", marginTarget: 20, icon: "📺" } })).ledger;
    const row = ledgerToRows(l, "2026-10-20").categories.get("تلفزات")!;
    expect(row).toEqual(["تلفزات", "", 20, "📺"]);
    expect(rowsToLedger({ categories: [row] }).categories[0].icon).toBe("📺");
    // Rows from before the column: no icon (the app guesses one from the name).
    expect(rowsToLedger({ categories: [["ريباراسيون", "", 60]] }).categories[0].icon).toBe("");
  });
});

describe("data from the network", () => {
  it("refuses broken shop operations instead of crashing the sync", () => {
    for (const body of [
      { type: "stock.add" },
      { type: "stock.adjust", move: null },
      { type: "caisse.close" },
      { type: "sale.add", lines: [null], purchases: [] },
      { type: "sale.add", lines: [{ id: "V-XXXXXXXX" }], purchases: [] },
      { type: "category.save", category: null },
    ]) {
      expect(applyOp(emptyLedger(), op(body)).result).toBe("invalid");
    }
  });
});
